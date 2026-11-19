import { useSyncExternalStore } from "react";
import { hostOf, track } from "../analytics";
import { MCP_URL_OVERRIDE, SPACE_ID, WIDGET_KEY } from "../config";
import { validate, type SchemaError } from "../shared/jsonSchema";
import { envelope, PROTOCOL_VERSION, unwrapMessage, type AppToPage } from "../shared/protocol";
import type {
  ExecuteOutcome,
  FormAttrUpdate,
  FormInfo,
  InjectedToolDef,
  LifecycleEvent,
  PageSnapshot,
} from "../shared/types";
import {
  addUrlToHistory,
  injectedFor,
  loadTitles,
  loadUrlHistory,
  overridesFor,
  pageKey,
  readString,
  removeOverride,
  saveInjected,
  saveOverride,
  saveTitle,
  STORAGE_KEYS,
  writeString,
  type SavedInjected,
} from "./storage";

export type SessionStatus = "idle" | "connecting" | "live" | "ended" | "error";
export type ExtensionStatus = "waiting" | "ok" | "outdated" | "missing";
export type CallOrigin = "manual" | "prompt" | "eval" | "replay" | "security";

export interface ActivityEntry {
  id: number;
  at: number;
  kind: "session" | "tools" | "lifecycle" | "call" | "augment" | "navigate" | "error" | "agent";
  message: string;
  detail?: unknown;
}

export interface CallRecord {
  requestId: string;
  toolName: string;
  args: Record<string, unknown>;
  origin: CallOrigin;
  startedAt: number;
  pending: boolean;
  outcome?: ExecuteOutcome;
  inputErrors: SchemaError[];
  outputErrors: SchemaError[];
}

export interface InspectorState {
  status: SessionStatus;
  error: string;
  targetUrl: string;
  sessionId: string;
  sessionOrigin: string;
  spaceSlug: string;
  snapshot: PageSnapshot | null;
  extension: ExtensionStatus;
  activity: ActivityEntry[];
  calls: CallRecord[];
  injected: SavedInjected[];
  injectErrors: Record<string, string>;
  urlHistory: string[];
  titles: Record<string, string>;
  automationKey: string;
  agentSent: string;
}

const MAX_ACTIVITY = 500;
const MAX_CALLS = 200;
export const DEFAULT_TIMEOUT_MS = 30_000;

function validTarget(raw: string): { url?: string; error?: string } {
  let value = raw.trim();
  if (!value) return { error: "Enter a URL." };
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  try {
    const url = new URL(value);
    const host = url.hostname;
    if (host === "localhost" || host.endsWith(".localhost") || /^(127\.|10\.|192\.168\.|0\.0\.0\.0)/.test(host) || host === "[::1]") {
      return {
        error: "Webfuse opens pages from its own servers, so it cannot reach your localhost. Use a public URL or a tunnel.",
      };
    }
    if (!host.includes(".") && !host.startsWith("[")) return { error: "Enter a full domain, for example example.com." };
    return { url: url.href };
  } catch {
    return { error: "That is not a valid URL." };
  }
}

class InspectorStore {
  private state: InspectorState = {
    status: "idle",
    error: "",
    targetUrl: readString(STORAGE_KEYS.lastUrl),
    sessionId: "",
    sessionOrigin: "",
    spaceSlug: "",
    snapshot: null,
    extension: "waiting",
    activity: [],
    calls: [],
    injected: [],
    injectErrors: {},
    urlHistory: loadUrlHistory(),
    titles: loadTitles(),
    automationKey: readString(STORAGE_KEYS.automationKey),
    agentSent: "",
  };
  private listeners = new Set<() => void>();
  private space: WebfuseSpace | null = null;
  private session: WebfuseSession | null = null;
  private activityId = 0;
  private waiters = new Map<string, (outcome: ExecuteOutcome) => void>();
  private restoredFor = "";
  private helloTimer = 0;
  private infoTimer = 0;
  private messageListener = (event: MessageEvent) => this.onWindowMessage(event);

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = () => this.state;

  private set(patch: Partial<InspectorState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  log(kind: ActivityEntry["kind"], message: string, detail?: unknown) {
    const entry = { id: ++this.activityId, at: Date.now(), kind, message, detail };
    this.set({ activity: [entry, ...this.state.activity].slice(0, MAX_ACTIVITY) });
  }

  clearActivity = () => this.set({ activity: [] });
  clearCalls = () => this.set({ calls: this.state.calls.filter((c) => c.pending) });

  setTargetUrl = (url: string) => {
    writeString(STORAGE_KEYS.lastUrl, url);
    this.set({ targetUrl: url, error: "" });
  };

  setAutomationKey = (key: string) => {
    writeString(STORAGE_KEYS.automationKey, key.trim());
    this.set({ automationKey: key.trim() });
  };

  markAgentSent = (agent: string) => this.set({ agentSent: agent });

  get mcpUrl(): string {
    if (MCP_URL_OVERRIDE) return MCP_URL_OVERRIDE;
    const host = this.state.sessionOrigin ? new URL(this.state.sessionOrigin).host : "webfu.se";
    return `https://session-mcp.${host}/mcp`;
  }

  // ── Session ───────────────────────────────────────────────────────

  connect = async () => {
    const { url, error } = validTarget(this.state.targetUrl);
    if (!url) {
      this.set({ error: error ?? "" });
      return;
    }
    this.setTargetUrl(url);
    this.set({ urlHistory: addUrlToHistory(url) });

    if (this.session && this.state.status === "live") {
      this.resetPage();
      const tabs = await this.session.getTabs();
      tabs.forEach((tab) => this.session?.closeTab(tab.ssid));
      await this.session.openTab(url);
      this.log("navigate", `Opened ${url}`);
      track("Tab Opened", { host: hostOf(url) });
      this.waitForExtension();
      return;
    }

    this.set({ status: "connecting", error: "" });
    try {
      if (!this.space) this.space = await window.webfuse.initSpace(WIDGET_KEY, SPACE_ID);
      const session = this.space.session();
      this.session = session;
      this.bindSession(session);

      // The session object passed to session_started is the one whose openTab works.
      const opened = new Promise<void>((resolve) => {
        window.webfuse.on("session_started", (started: unknown) => {
          void (started as WebfuseSession).openTab(url);
          resolve();
        });
      });
      await session.start("#webfuse-container");
      // The widget drives the frame without a src, so the session's origin comes from its link.
      let origin = "";
      try {
        origin = new URL(session.sessionLink).origin;
      } catch {
        origin = "";
      }
      this.set({ status: "live", sessionOrigin: origin, spaceSlug: this.space.slug ?? "" });
      this.log("session", "Session started");
      track("Connected", { host: hostOf(url) });
      await opened;
      this.log("navigate", `Opened ${url}`);
      this.waitForExtension();
      this.requestSessionInfo();
    } catch (err) {
      console.error("Failed to start the Webfuse session:", err);
      this.set({
        status: "error",
        error:
          "The Webfuse session did not start. Browsers that block third-party cookies (Safari, Brave, private windows) stop it; allow them for this site and try again.",
      });
      this.log("error", "Session failed to start", String(err));
    }
  };

  private resetPage() {
    this.restoredFor = "";
    this.set({ snapshot: null, extension: "waiting", injected: [], injectErrors: {} });
  }

  private bindSession(session: WebfuseSession) {
    window.addEventListener("message", this.messageListener);
    session.on("message", (...args: unknown[]) => this.onSessionMessage(args));
    session.on("session_ended", () => {
      clearInterval(this.helloTimer);
      clearInterval(this.infoTimer);
      window.removeEventListener("message", this.messageListener);
      this.session = null;
      this.set({ status: "ended", snapshot: null, sessionId: "", agentSent: "" });
      this.log("session", "Session ended");
      track("Disconnected");
    });
    session.on("tab_relocated", (...args: unknown[]) => {
      const event = args.find((a) => a && typeof a === "object" && "url" in (a as object)) as { url?: string } | undefined;
      this.log("navigate", event?.url ? `Navigated to ${event.url}` : "Navigated");
      if (this.state.agentSent) this.log("agent", "The session changed page after a prompt was sent to an agent.");
    });
  }

  /** The content script announces itself; if it does not, nudge it, then explain what is wrong. */
  private waitForExtension() {
    clearInterval(this.helloTimer);
    let tries = 0;
    this.helloTimer = window.setInterval(() => {
      if (this.state.extension === "ok" || this.state.extension === "outdated") {
        clearInterval(this.helloTimer);
        return;
      }
      if (++tries > 12) {
        clearInterval(this.helloTimer);
        this.set({ extension: "missing" });
        this.log("error", "The inspector extension did not answer from the page.");
        return;
      }
      this.send({ type: "webmcp:hello" });
    }, 1500);
  }

  /** Same request the Webfuse widget makes; works even when the extension is outdated. */
  private requestSessionInfo() {
    clearInterval(this.infoTimer);
    let tries = 0;
    const ask = () => {
      if (this.state.sessionId || ++tries > 40) {
        clearInterval(this.infoTimer);
        return;
      }
      if (!this.state.sessionOrigin && this.session?.sessionLink) {
        try {
          this.set({ sessionOrigin: new URL(this.session.sessionLink).origin });
        } catch {
          // Not a URL yet; try again on the next round.
        }
      }
      const frame = document.getElementById("webfuse-container") as HTMLIFrameElement | null;
      if (frame?.contentWindow && this.state.sessionOrigin) {
        frame.contentWindow.postMessage({ type: "api_request", params: { cmd: "get_session_info" } }, this.state.sessionOrigin);
      }
      this.send({ type: "webmcp:session-info" });
    };
    ask();
    this.infoTimer = window.setInterval(ask, 750);
  }

  private onWindowMessage(event: MessageEvent) {
    if (!this.state.sessionOrigin || event.origin !== this.state.sessionOrigin) return;
    const data = (event.data ?? {}) as { type?: string; params?: { msg?: string; sessionInfo?: { sessionId?: string } } };
    if (data.type === "widget_message" && data.params?.msg === "get_session_info") {
      const id = data.params.sessionInfo?.sessionId;
      if (id && id !== this.state.sessionId) this.set({ sessionId: id });
    }
  }

  send(msg: AppToPage) {
    try {
      this.session?.sendMessage(envelope(msg), "*");
    } catch (err) {
      console.warn("sendMessage failed", err);
    }
  }

  private onSessionMessage(args: unknown[]) {
    const msg = unwrapMessage(args);
    if (!msg) return;
    if (msg.type === "webmcp:tools-update" || typeof msg.v !== "number" || msg.v < PROTOCOL_VERSION) {
      if (this.state.extension !== "outdated") {
        this.set({ extension: "outdated" });
        this.log("error", "The Space runs an older inspector extension. Upload dist/extension to the Space.");
      }
      return;
    }
    switch (msg.type) {
      case "webmcp:snapshot":
        this.onSnapshot(msg.snapshot as PageSnapshot);
        break;
      case "webmcp:lifecycle":
        for (const event of msg.events as LifecycleEvent[]) this.onLifecycle(event);
        break;
      case "webmcp:execute-result":
        this.onOutcome(msg.outcome as ExecuteOutcome);
        break;
      case "webmcp:inject-result": {
        const id = msg.id as string;
        const errors = { ...this.state.injectErrors };
        if (msg.ok) delete errors[id];
        else errors[id] = String(msg.error ?? "Failed");
        this.set({ injectErrors: errors });
        if (!msg.ok) this.log("error", `Could not add the tool: ${String(msg.error)}`);
        break;
      }
      case "webmcp:session-info":
        if (typeof msg.sessionId === "string" && msg.sessionId !== this.state.sessionId) {
          this.set({ sessionId: msg.sessionId });
        }
        break;
    }
  }

  private onSnapshot(snapshot: PageSnapshot) {
    const previous = this.state.snapshot;
    const pageChanged = !previous || previous.instance !== snapshot.instance;
    const titles = snapshot.title ? saveTitle(snapshot.url, snapshot.title) : this.state.titles;
    this.set({
      snapshot,
      extension: "ok",
      titles,
      injected: pageChanged ? injectedFor(snapshot.url) : this.state.injected,
    });
    if (pageChanged) {
      const imperative = snapshot.tools.filter((t) => t.source !== "declarative").length;
      const declarative = snapshot.tools.length - imperative;
      this.log("tools", `${hostOf(snapshot.url) || snapshot.url}: ${snapshot.tools.length} tools (${declarative} form, ${imperative} script), ${snapshot.forms.length} forms`);
      track("Tools Discovered", { host: hostOf(snapshot.url), tools: snapshot.tools.length, forms: snapshot.forms.length });
    }
    this.restore(snapshot);
  }

  /** Re-applies saved form augmentations and injected tools once per page load. */
  private restore(snapshot: PageSnapshot) {
    if (this.restoredFor === snapshot.instance) return;
    this.restoredFor = snapshot.instance;
    const keys = new Set(snapshot.forms.map((f) => f.key));
    const updates = overridesFor(snapshot.url).filter((o) => keys.has(o.formKey));
    if (updates.length) {
      this.send({ type: "webmcp:set-attrs", updates, augmented: true });
      this.log("augment", `Restored ${updates.length} saved form augmentation${updates.length > 1 ? "s" : ""}`);
    }
    const names = new Set(snapshot.tools.map((t) => t.name));
    for (const tool of injectedFor(snapshot.url)) {
      if (tool.enabled && !names.has(tool.name)) this.send({ type: "webmcp:inject-tool", tool });
    }
  }

  private onLifecycle(event: LifecycleEvent) {
    const labels: Record<LifecycleEvent["kind"], string> = {
      registered: "Tool registered",
      unregistered: "Tool removed",
      toolactivated: "toolactivated",
      toolcancel: "toolcancel",
      "agent-submit": "Agent submitted a form",
      "respond-with": "respondWith",
      navigated: "Navigated",
    };
    this.log("lifecycle", `${labels[event.kind]}${event.tool ? `: ${event.tool}` : ""}`, event.detail);
  }

  // ── Tools ─────────────────────────────────────────────────────────

  execute = (
    toolName: string,
    args: Record<string, unknown>,
    { origin = "manual" as CallOrigin, timeoutMs = DEFAULT_TIMEOUT_MS } = {},
  ): Promise<ExecuteOutcome> => {
    const requestId = `call_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const tool = this.state.snapshot?.tools.find((t) => t.name === toolName);
    const record: CallRecord = {
      requestId,
      toolName,
      args,
      origin,
      startedAt: Date.now(),
      pending: true,
      inputErrors: validate(args, tool?.inputSchema),
      outputErrors: [],
    };
    this.set({ calls: [record, ...this.state.calls].slice(0, MAX_CALLS) });
    this.send({ type: "webmcp:execute", requestId, toolName, args, timeoutMs });
    track("Tool Executed", { origin });
    return new Promise((resolve) => {
      this.waiters.set(requestId, resolve);
      // The page enforces the timeout; this catches a page that went away mid-call.
      window.setTimeout(() => {
        if (!this.waiters.has(requestId)) return;
        this.onOutcome({
          requestId,
          toolName,
          ok: false,
          error: "No answer from the page. It may have navigated or reloaded.",
          durationMs: timeoutMs + 5000,
          via: "",
        });
      }, timeoutMs + 5000);
    });
  };

  cancel = (requestId: string) => this.send({ type: "webmcp:cancel", requestId });

  private onOutcome(outcome: ExecuteOutcome) {
    const tool = this.state.snapshot?.tools.find((t) => t.name === outcome.toolName);
    const outputErrors = outcome.ok && tool?.outputSchema ? validate(outcome.result, tool.outputSchema) : [];
    this.set({
      calls: this.state.calls.map((c) =>
        c.requestId === outcome.requestId ? { ...c, pending: false, outcome, outputErrors } : c,
      ),
    });
    this.log(
      "call",
      outcome.ok
        ? `${outcome.toolName} returned in ${outcome.durationMs}ms`
        : `${outcome.toolName} ${outcome.aborted ? "was cancelled" : "failed"}: ${outcome.error}`,
      outcome,
    );
    const waiter = this.waiters.get(outcome.requestId);
    this.waiters.delete(outcome.requestId);
    waiter?.(outcome);
  }

  rescan = (animate = false) => {
    this.send({ type: "webmcp:scan", animate });
    track("Rescan Page");
  };

  highlight = (formKey: string) => this.send({ type: "webmcp:highlight", formKey });

  saveFormEdit = (form: FormInfo, update: FormAttrUpdate) => {
    const url = this.state.snapshot?.url;
    if (!url) return;
    this.send({ type: "webmcp:set-attrs", updates: [update], augmented: true });
    saveOverride(url, { ...update, label: form.label, savedAt: Date.now() });
    this.log("augment", `Saved WebMCP attributes on "${form.label}"`, update);
    track("Tool Augmented", { host: hostOf(url) });
  };

  clearFormEdit = (form: FormInfo) => {
    const url = this.state.snapshot?.url;
    if (!url) return;
    removeOverride(url, form.key);
    const fields: FormAttrUpdate["fields"] = {};
    for (const f of form.fields) if (f.augmented) fields[f.name || f.id] = { toolparamdescription: null };
    this.send({
      type: "webmcp:set-attrs",
      augmented: false,
      updates: [{ formKey: form.key, form: { toolname: null, tooldescription: null, toolautosubmit: null }, fields }],
    });
    this.log("augment", `Removed the inspector's attributes from "${form.label}"`);
    track("Tool Cleared", { host: hostOf(url) });
  };

  saveInjectedTool = (def: InjectedToolDef, enabled = true) => {
    const url = this.state.snapshot?.url;
    if (!url) return;
    const list = [...this.state.injected.filter((t) => t.id !== def.id), { ...def, enabled }];
    saveInjected(url, list);
    this.set({ injected: list });
    if (enabled) this.send({ type: "webmcp:inject-tool", tool: def });
    else this.send({ type: "webmcp:remove-injected", id: def.id });
    this.log("augment", `${enabled ? "Registered" : "Disabled"} script tool "${def.name}"`);
    track("Tool Injected", { host: hostOf(url) });
  };

  deleteInjectedTool = (id: string) => {
    const url = this.state.snapshot?.url;
    if (!url) return;
    const list = this.state.injected.filter((t) => t.id !== id);
    saveInjected(url, list);
    this.set({ injected: list });
    this.send({ type: "webmcp:remove-injected", id });
  };

  pageKey() {
    return this.state.snapshot ? pageKey(this.state.snapshot.url) : "";
  }
}

export const store = new InspectorStore();

export function useInspector<T>(select: (state: InspectorState) => T): T {
  return useSyncExternalStore(store.subscribe, () => select(store.getState()));
}
