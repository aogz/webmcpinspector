// WebMCP Inspector – Webfuse extension content script. Runs inside the proxied page and talks to
// the inspector app through the Webfuse session's message channel.

import { parseSchema } from "../shared/jsonSchema";
import { envelope, unwrapMessage, type AppToPage, type PageToApp } from "../shared/protocol";
import type {
  ExecuteOutcome,
  FormAttrUpdate,
  FrameInfo,
  InjectedToolDef,
  InspectedTool,
  LifecycleEvent,
  PageSnapshot,
  RuntimeInfo,
  ToolAnnotations,
} from "../shared/types";
import { AUGMENTED_ATTR, estimateFormSchema, fillForm, findForm, readForm } from "./forms";
import { glowForms, highlight } from "./overlay";
import { SPACE_ID, WIDGET_KEY } from "../config";

interface RegisteredLike {
  name: string;
  title?: string | null;
  description?: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
  annotations?: ToolAnnotations;
  readOnlyHint?: boolean;
  untrustedContentHint?: boolean;
  consequentialHint?: boolean;
  exposedTo?: string[];
}

interface ToolDescriptor extends RegisteredLike {
  execute?: (input: unknown, options?: unknown) => unknown;
}

interface ModelContextLike extends Partial<EventTarget> {
  registerTool?: (tool: ToolDescriptor, options?: { signal?: AbortSignal; exposedTo?: string[] }) => unknown;
  getTools?: (options?: unknown) => Promise<RegisteredLike[]>;
  executeTool?: (tool: unknown, input: unknown, options?: { signal?: AbortSignal }) => Promise<unknown>;
}

interface TestingLike extends Partial<EventTarget> {
  listTools?: () => RegisteredLike[] | Promise<RegisteredLike[]>;
  executeTool?: (name: string, input: string, options?: { signal?: AbortSignal }) => Promise<unknown>;
  registerToolsChangedCallback?: (cb: () => void) => void;
}

interface WebfuseInPage {
  isInsideSession?: boolean;
  currentSession?: {
    sendMessage(message: unknown, origin: string): void;
    on(event: string, cb: (...args: unknown[]) => void): void;
  } | null;
  initSpace(key: string, space: string, settings?: object): Promise<unknown>;
}

interface ExtensionBrowser {
  webfuseSession?: { getSessionInfo?: () => Promise<{ sessionId?: string }> };
}

const host = window as unknown as { webfuse?: WebfuseInPage; __webmcpInspector?: boolean };

const WRAPPED = Symbol("webmcp-inspector-wrapped");

interface Captured {
  tool: ToolDescriptor;
  legacy: boolean;
  exposedTo?: string[];
}

const captured = new Map<string, Captured>();
const injected = new Map<string, { controller: AbortController; name: string }>();
const inflight = new Map<string, AbortController>();
const instance = Math.random().toString(36).slice(2, 10);
let knownNames = new Set<string>();
let hasScanned = false;
let runtimeNative = false;
let pendingLifecycle: LifecycleEvent[] = [];
let scanTimer = 0;
let lastSignature = "";

const docMc = (): ModelContextLike | undefined => (document as unknown as { modelContext?: ModelContextLike }).modelContext;
const navMc = (): ModelContextLike | undefined => (navigator as unknown as { modelContext?: ModelContextLike }).modelContext;
const testing = (): TestingLike | undefined =>
  (navigator as unknown as { modelContextTesting?: TestingLike }).modelContextTesting;

const isNative = (fn: unknown) => typeof fn === "function" && /\[native code\]/.test(Function.prototype.toString.call(fn));

// ── Messaging ─────────────────────────────────────────────────────────

function send(msg: PageToApp) {
  try {
    host.webfuse?.currentSession?.sendMessage(envelope(msg), "*");
  } catch (err) {
    console.warn("[WebMCP Inspector] sendMessage failed:", err);
  }
}

function lifecycle(kind: LifecycleEvent["kind"], tool?: string, detail?: string) {
  pendingLifecycle.push({ at: Date.now(), kind, tool, detail });
  queueMicrotask(flushLifecycle);
}

function flushLifecycle() {
  if (!pendingLifecycle.length) return;
  const events = pendingLifecycle;
  pendingLifecycle = [];
  send({ type: "webmcp:lifecycle", events });
}

// ── Watching registrations ────────────────────────────────────────────

/** Records what pages pass to registerTool, which the registry APIs leave out (handlers, outputSchema, hints). */
function wrapRegister(target: ModelContextLike | undefined, legacy: boolean) {
  if (!target || typeof target.registerTool !== "function") return;
  const original = target.registerTool as ModelContextLike["registerTool"] & { [WRAPPED]?: boolean };
  if (original[WRAPPED]) return;
  const wrapped = function (this: unknown, tool: ToolDescriptor, options?: { signal?: AbortSignal; exposedTo?: string[] }) {
    if (tool && typeof tool.name === "string" && !options?.signal?.aborted) {
      captured.set(tool.name, { tool, legacy, exposedTo: options?.exposedTo });
      options?.signal?.addEventListener(
        "abort",
        () => {
          if (captured.get(tool.name)?.tool === tool) captured.delete(tool.name);
          scheduleScan();
        },
        { once: true },
      );
      scheduleScan();
    }
    return original.apply(this, [tool, options] as never);
  } as ModelContextLike["registerTool"] & { [WRAPPED]?: boolean };
  wrapped[WRAPPED] = true;
  try {
    target.registerTool = wrapped;
  } catch {
    // A frozen implementation; the registry APIs still list its tools.
  }
}

function watchRegistry() {
  const realRegisterIsNative = isNative(docMc()?.registerTool ?? navMc()?.registerTool);
  runtimeNative = realRegisterIsNative || isNative((window as unknown as { ModelContext?: unknown }).ModelContext);
  wrapRegister(docMc(), false);
  const nav = navMc();
  if (nav && nav !== docMc()) wrapRegister(nav, true);

  const onChange = () => scheduleScan();
  for (const target of [docMc(), nav, testing()]) {
    try {
      target?.addEventListener?.("toolchange", onChange);
    } catch {
      // Not an EventTarget in this implementation.
    }
  }
  try {
    testing()?.registerToolsChangedCallback?.(onChange);
  } catch {
    // Older Chrome builds only.
  }
  for (const kind of ["toolactivated", "toolcancel"] as const) {
    docMc()?.addEventListener?.(kind, (event) => {
      lifecycle(kind, (event as Event & { toolName?: string }).toolName);
    });
  }

  document.addEventListener(
    "submit",
    (event) => {
      const submit = event as SubmitEvent & { agentInvoked?: boolean; respondWith?: (p: Promise<unknown>) => void };
      if (!submit.agentInvoked) return;
      const form = event.target as HTMLFormElement;
      const name = form.getAttribute("toolname") ?? undefined;
      lifecycle("agent-submit", name, "Submitted by an agent (SubmitEvent.agentInvoked)");
      const respondWith = submit.respondWith?.bind(submit);
      if (respondWith) {
        submit.respondWith = (promise: Promise<unknown>) => {
          Promise.resolve(promise).then(
            (value) => lifecycle("respond-with", name, `respondWith resolved: ${preview(value)}`),
            (err) => lifecycle("respond-with", name, `respondWith rejected: ${String(err)}`),
          );
          return respondWith(promise);
        };
      }
    },
    true,
  );
}

function preview(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text === undefined ? "undefined" : text.length > 160 ? `${text.slice(0, 157)}…` : text;
}

// ── Reading the page ──────────────────────────────────────────────────

async function listRegistry(): Promise<RegisteredLike[] | null> {
  const mc = docMc();
  if (typeof mc?.getTools === "function") {
    try {
      return await mc.getTools();
    } catch {
      // Fall through to the testing API.
    }
  }
  const t = testing();
  if (typeof t?.listTools === "function") {
    try {
      return await t.listTools();
    } catch {
      // Fall through to what the wrapper saw.
    }
  }
  return null;
}

function annotationsOf(entry: RegisteredLike | undefined, source: ToolDescriptor | undefined): ToolAnnotations {
  const out: ToolAnnotations = { ...(entry?.annotations ?? {}), ...(source?.annotations ?? {}) };
  for (const key of ["readOnlyHint", "untrustedContentHint", "consequentialHint"] as const) {
    if (out[key] === undefined && entry?.[key] !== undefined) out[key] = entry[key];
  }
  for (const key of Object.keys(out)) if (out[key] === undefined) delete out[key];
  for (const key of ["readOnlyHint", "untrustedContentHint", "consequentialHint", "debugging"]) {
    if (out[key] === false) delete out[key];
  }
  return out;
}

interface PolicyLike {
  allowsFeature?: (feature: string) => boolean;
}

function toolsAllowed(): boolean | undefined {
  const d = document as unknown as { permissionsPolicy?: PolicyLike; featurePolicy?: PolicyLike };
  const policy = d.permissionsPolicy ?? d.featurePolicy;
  try {
    return typeof policy?.allowsFeature === "function" ? policy.allowsFeature("tools") : undefined;
  } catch {
    return undefined;
  }
}

function runtimeInfo(): RuntimeInfo {
  const doc = docMc();
  const nav = navMc();
  const hasPolyfillRegistry = "__ss_webmcp_registry" in window;
  return {
    api: doc ? "document.modelContext" : nav ? "navigator.modelContext" : "none",
    implementation: !doc && !nav ? "unknown" : runtimeNative ? "native" : hasPolyfillRegistry || testing() ? "webfuse-polyfill" : "unknown",
    hasGetTools: typeof doc?.getTools === "function",
    hasExecuteTool: typeof doc?.executeTool === "function",
    hasTestingApi: !!testing(),
    legacyNavigatorApi: !!nav && nav !== doc,
    toolsAllowed: runtimeNative ? toolsAllowed() : undefined,
    userAgent: navigator.userAgent,
  };
}

function readFrames(): FrameInfo[] {
  return Array.from(document.querySelectorAll("iframe")).flatMap((frame) => {
    if (!frame.src) return [];
    try {
      const url = new URL(frame.src, location.href);
      const allow = (frame.getAttribute("allow") ?? "").split(";").map((s) => s.trim().split(/\s+/)[0]);
      return [{ src: url.href, origin: url.origin, crossOrigin: url.origin !== location.origin, allowTools: allow.includes("tools") }];
    } catch {
      return [];
    }
  });
}

async function buildSnapshot(): Promise<PageSnapshot> {
  const registry = await listRegistry();
  const forms = Array.from(document.querySelectorAll("form"));
  const registeredNames = new Set((registry ?? []).map((t) => t.name));
  const formInfos = forms.map((f) => readForm(f, forms, registeredNames));
  const formsByTool = new Map(formInfos.filter((f) => f.toolname).map((f) => [f.toolname, f]));
  const injectedNames = new Set(Array.from(injected.values()).map((i) => i.name));
  const injectedIds = new Map(Array.from(injected.entries()).map(([id, i]) => [i.name, id]));

  const entries: RegisteredLike[] = registry ?? Array.from(captured.values()).map((c) => c.tool);
  const tools: InspectedTool[] = entries.map((entry) => {
    const cap = captured.get(entry.name);
    const form = formsByTool.get(entry.name);
    const isDeclarative = !!form && !cap;
    return {
      name: entry.name,
      title: (entry.title ?? cap?.tool.title) || undefined,
      description: entry.description ?? cap?.tool.description ?? "",
      inputSchema: parseSchema(entry.inputSchema) ?? parseSchema(cap?.tool.inputSchema),
      outputSchema: parseSchema(entry.outputSchema) ?? parseSchema(cap?.tool.outputSchema),
      annotations: annotationsOf(entry, cap?.tool),
      source: injectedNames.has(entry.name) ? "injected" : isDeclarative ? "declarative" : "imperative",
      formKey: isDeclarative ? form?.key : undefined,
      exposedTo: entry.exposedTo ?? cap?.exposedTo,
      schemaOrigin: registry ? "registry" : "inspector",
      legacyApi: cap?.legacy || undefined,
      injectedId: injectedIds.get(entry.name),
    };
  });

  // Forms the browser does not list (no declarative support, or a name clash) still show, with an estimated schema.
  const listed = new Set(tools.map((t) => t.name));
  for (const info of formInfos) {
    if (!info.toolname || listed.has(info.toolname)) continue;
    const form = forms.find((f) => f.getAttribute("toolname") === info.toolname);
    tools.push({
      name: info.toolname,
      description: info.tooldescription,
      inputSchema: form ? estimateFormSchema(form) : undefined,
      annotations: {},
      source: "declarative",
      formKey: info.key,
      schemaOrigin: "inspector",
    });
    listed.add(info.toolname);
  }

  return {
    instance,
    url: location.href,
    title: document.title,
    runtime: runtimeInfo(),
    tools,
    forms: formInfos,
    frames: readFrames(),
    scannedAt: Date.now(),
  };
}

async function scan({ force = false, animate = false } = {}) {
  const snapshot = await buildSnapshot();
  const names = new Set(snapshot.tools.map((t) => t.name));
  if (hasScanned) {
    for (const name of names) if (!knownNames.has(name)) lifecycle("registered", name);
    for (const name of knownNames) if (!names.has(name)) lifecycle("unregistered", name);
  }
  hasScanned = true;
  knownNames = names;
  const signature = JSON.stringify({ ...snapshot, scannedAt: 0 });
  if (force || signature !== lastSignature) {
    lastSignature = signature;
    send({ type: "webmcp:snapshot", snapshot });
  }
  if (animate) glowForms(snapshot.tools.length);
}

function scheduleScan(delay = 150) {
  clearTimeout(scanTimer);
  scanTimer = window.setTimeout(() => void scan(), delay);
}

// ── Changing the page ─────────────────────────────────────────────────

function applyAttrs(updates: FormAttrUpdate[], augmented: boolean) {
  for (const update of updates) {
    const form = findForm(update.formKey);
    if (!form) continue;
    for (const [attr, value] of Object.entries(update.form)) {
      if (value === null || value === undefined || value === "" || (attr === "toolautosubmit" && value === "false")) {
        form.removeAttribute(attr);
        form.removeAttribute(`${AUGMENTED_ATTR}-${attr}`);
      } else {
        form.setAttribute(attr, attr === "toolautosubmit" ? "" : value);
        if (augmented) form.setAttribute(`${AUGMENTED_ATTR}-${attr}`, "");
      }
    }
    const fields = Array.from(form.querySelectorAll<HTMLElement>("input, select, textarea"));
    for (const [key, attrs] of Object.entries(update.fields)) {
      const targets = fields.filter((f) => (f.getAttribute("name") || f.id) === key);
      for (const field of targets.slice(0, 1)) {
        for (const [attr, value] of Object.entries(attrs)) {
          if (value) {
            field.setAttribute(attr, value);
            if (augmented) field.setAttribute(`${AUGMENTED_ATTR}-${attr}`, "");
          } else {
            field.removeAttribute(attr);
            field.removeAttribute(`${AUGMENTED_ATTR}-${attr}`);
          }
        }
      }
    }
    const anyAugmented = Array.from(form.attributes).some((a) => a.name.startsWith(`${AUGMENTED_ATTR}-`)) ||
      !!form.querySelector(`[${CSS.escape(AUGMENTED_ATTR)}-toolparamdescription]`);
    if (anyAugmented) form.setAttribute(AUGMENTED_ATTR, "");
    else form.removeAttribute(AUGMENTED_ATTR);
  }
  scheduleScan(50);
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", () => reject(signal.reason ?? new DOMException("Aborted", "AbortError")), {
      once: true,
    });
    promise.then(resolve, reject);
  });
}

async function runTool(name: string, args: Record<string, unknown>, signal: AbortSignal) {
  const mc = docMc();
  if (typeof mc?.executeTool === "function" && typeof mc.getTools === "function") {
    const tool = (await mc.getTools()).find((t) => t.name === name);
    if (tool) {
      return { value: await abortable(mc.executeTool(tool, args, { signal }), signal), via: "document.modelContext.executeTool()" };
    }
  }
  const t = testing();
  if (typeof t?.executeTool === "function") {
    const listed = await listRegistry();
    if (!listed || listed.some((x) => x.name === name)) {
      return {
        value: await abortable(t.executeTool(name, JSON.stringify(args), { signal }), signal),
        via: "navigator.modelContextTesting.executeTool()",
      };
    }
  }
  const cap = captured.get(name);
  if (cap?.tool.execute) {
    return { value: await abortable(Promise.resolve(cap.tool.execute(args, { signal })), signal), via: "the tool's execute()" };
  }
  const form = Array.from(document.querySelectorAll("form")).find((f) => f.getAttribute("toolname") === name);
  if (form) return { value: fillForm(form, args), via: "the inspector filling the form" };
  throw new Error(`No tool named "${name}" on this page.`);
}

async function execute(msg: Extract<AppToPage, { type: "webmcp:execute" }>) {
  const controller = new AbortController();
  inflight.set(msg.requestId, controller);
  const timer = window.setTimeout(
    () => controller.abort(new DOMException(`Timed out after ${Math.round(msg.timeoutMs / 1000)}s`, "TimeoutError")),
    msg.timeoutMs,
  );
  const started = performance.now();
  const outcome: ExecuteOutcome = { requestId: msg.requestId, toolName: msg.toolName, ok: false, durationMs: 0, via: "" };
  try {
    const { value, via } = await runTool(msg.toolName, msg.args, controller.signal);
    outcome.ok = true;
    outcome.via = via;
    if (typeof value === "string") {
      outcome.raw = value;
      try {
        outcome.result = JSON.parse(value);
      } catch {
        outcome.result = value;
      }
    } else {
      outcome.result = JSON.parse(JSON.stringify(value ?? null));
    }
  } catch (err) {
    outcome.error = err instanceof Error ? `${err.name !== "Error" ? `${err.name}: ` : ""}${err.message}` : String(err);
    outcome.aborted = controller.signal.aborted;
  } finally {
    clearTimeout(timer);
    inflight.delete(msg.requestId);
    outcome.durationMs = Math.round(performance.now() - started);
  }
  send({ type: "webmcp:execute-result", outcome });
}

function inject(def: InjectedToolDef) {
  const mc = docMc() ?? navMc();
  if (!mc?.registerTool) {
    send({ type: "webmcp:inject-result", id: def.id, ok: false, error: "This page has no WebMCP API." });
    return;
  }
  injected.get(def.id)?.controller.abort();
  let executeFn: (input: unknown, options: unknown) => Promise<unknown>;
  try {
    const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (...args: string[]) => typeof executeFn;
    executeFn = new AsyncFunction("input", "options", def.code);
  } catch (err) {
    const blocked = err instanceof EvalError || /Content Security Policy|unsafe-eval/i.test(String(err));
    send({
      type: "webmcp:inject-result",
      id: def.id,
      ok: false,
      error: blocked ? "The page's Content Security Policy blocks running new code." : `The code does not compile: ${String(err)}`,
    });
    return;
  }
  const controller = new AbortController();
  try {
    const result = mc.registerTool(
      {
        name: def.name,
        title: def.title || undefined,
        description: def.description,
        inputSchema: def.inputSchema,
        outputSchema: def.outputSchema,
        annotations: def.annotations,
        execute: (input, options) => executeFn(input, options),
      },
      { signal: controller.signal },
    );
    injected.set(def.id, { controller, name: def.name });
    Promise.resolve(result).then(
      () => send({ type: "webmcp:inject-result", id: def.id, ok: true }),
      (err) => {
        injected.delete(def.id);
        send({ type: "webmcp:inject-result", id: def.id, ok: false, error: String(err) });
      },
    );
  } catch (err) {
    send({ type: "webmcp:inject-result", id: def.id, ok: false, error: String(err) });
  }
  scheduleScan(50);
}

async function sendSessionInfo() {
  const api = (globalThis as unknown as { browser?: ExtensionBrowser }).browser;
  try {
    const info = await api?.webfuseSession?.getSessionInfo?.();
    if (info?.sessionId) send({ type: "webmcp:session-info", sessionId: info.sessionId });
  } catch {
    // The app also asks the session frame directly.
  }
}

function handle(...args: unknown[]) {
  const msg = unwrapMessage(args) as AppToPage | null;
  if (!msg) return;
  switch (msg.type) {
    case "webmcp:hello":
      void scan({ force: true });
      void sendSessionInfo();
      break;
    case "webmcp:scan":
      void scan({ force: true, animate: msg.animate });
      break;
    case "webmcp:highlight": {
      const form = findForm(msg.formKey);
      if (form) highlight(form);
      break;
    }
    case "webmcp:set-attrs":
      applyAttrs(msg.updates, msg.augmented);
      break;
    case "webmcp:execute":
      void execute(msg);
      break;
    case "webmcp:cancel":
      inflight.get(msg.requestId)?.abort(new DOMException("Cancelled in the inspector", "AbortError"));
      break;
    case "webmcp:inject-tool":
      inject(msg.tool);
      break;
    case "webmcp:remove-injected":
      injected.get(msg.id)?.controller.abort();
      injected.delete(msg.id);
      scheduleScan(50);
      break;
    case "webmcp:session-info":
      void sendSessionInfo();
      break;
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────

function loadWidgetScript() {
  if (host.webfuse) return;
  const stub = {
    initSpace: (...args: unknown[]) =>
      new Promise((resolve) => {
        Object.assign(stub, { q: args, resolve });
      }),
  };
  host.webfuse = stub as unknown as WebfuseInPage;
  const script = document.createElement("script");
  script.async = true;
  script.src = "https://webfu.se/surfly.js";
  document.head.appendChild(script);
}

function connect() {
  if (!host.webfuse?.isInsideSession) {
    window.setTimeout(connect, 200);
    return;
  }
  host.webfuse
    .initSpace(WIDGET_KEY, SPACE_ID, {})
    .then(() => {
      const session = host.webfuse?.currentSession;
      if (!session) {
        console.warn("[WebMCP Inspector] No current session after initSpace.");
        return;
      }
      session.on("message", handle);
      void scan({ force: true });
      void sendSessionInfo();

      const observer = new MutationObserver(() => scheduleScan(400));
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["toolname", "tooldescription", "toolautosubmit", "toolparamdescription", "toolparamtitle", "name"],
      });
      // Safety net for implementations without a change event.
      window.setInterval(() => void scan(), 4000);
    })
    .catch((err) => console.error("[WebMCP Inspector] initSpace failed:", err));
}

if (window === window.top && !host.__webmcpInspector) {
  host.__webmcpInspector = true;
  watchRegistry();
  loadWidgetScript();
  connect();
}
