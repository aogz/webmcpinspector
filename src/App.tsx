import { useState, useRef, useCallback } from "react";
import Sidebar from "./components/Sidebar";
import MainContent from "./components/MainContent";
import { track } from "./analytics";
import type { FormTool, ImperativeTool, SchemaResponse, SavedFormOverride, SavedPageOverrides, HistoryEntry, ToolExecutionResult } from "./types";

const STORAGE_KEY = "webmcp-overrides";
const URL_STORAGE_KEY = "webmcp-last-url";
const URL_HISTORY_KEY = "webmcp-url-history";
const WIDGET_KEY = import.meta.env.DEV
  ? "wk_88w0LdNQy0kxUZGRQgmtta30yaQ9rqJo"
  : "wk_tqCYlFrDmS_UGqhLcI_Wn6Y1DDTMaTSQ";
const SPACE_ID = import.meta.env.DEV ? "1872" : "1798";

function normalizeUrl(raw: string): string {
  let u = raw.trim();
  if (!u) return "";
  if (u.endsWith("/")) u = u.slice(0, -1);
  return u;
}

function loadAllOverrides(): SavedPageOverrides {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
  catch { return {}; }
}

function saveAllOverrides(data: SavedPageOverrides) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function getOverridesForUrl(url: string): SavedFormOverride[] {
  return loadAllOverrides()[normalizeUrl(url)] || [];
}

function saveOverrideForUrl(url: string, override: SavedFormOverride) {
  const key = normalizeUrl(url);
  const all = loadAllOverrides();
  const existing = all[key] || [];
  const idx = existing.findIndex((o) => o.formId === override.formId);
  if (idx >= 0) existing[idx] = override;
  else existing.push(override);
  all[key] = existing;
  saveAllOverrides(all);
}

function getSavedUrl(): string {
  return localStorage.getItem(URL_STORAGE_KEY) || "";
}

function saveUrl(url: string) {
  localStorage.setItem(URL_STORAGE_KEY, url);
}

const DEFAULT_URLS = [
  "https://googlechromelabs.github.io/webmcp-tools/demos/french-bistro/",
  "https://googlechromelabs.github.io/webmcp-tools/demos/react-flightsearch/",
];

function loadUrlHistory(): string[] {
  try {
    const saved: string[] = JSON.parse(localStorage.getItem(URL_HISTORY_KEY) || "[]");
    const merged = [...saved];
    for (const u of DEFAULT_URLS) {
      if (!merged.includes(u)) merged.push(u);
    }
    return merged;
  } catch { return [...DEFAULT_URLS]; }
}

function addUrlToHistory(url: string) {
  const normalized = url.trim();
  if (!normalized) return;
  const history = loadUrlHistory().filter((u) => u !== normalized);
  history.unshift(normalized);
  localStorage.setItem(URL_HISTORY_KEY, JSON.stringify(history.slice(0, 50)));
}

export default function App() {
  const [url, setUrlState] = useState(
    () => getSavedUrl() || ""
  );
  const setUrl = useCallback((v: string) => {
    setUrlState(v);
    saveUrl(v);
  }, []);
  const [urlHistory, setUrlHistory] = useState(loadUrlHistory);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [forms, setForms] = useState<FormTool[]>([]);
  const [imperativeTools, setImperativeTools] = useState<ImperativeTool[]>([]);
  const [schemaResponse, setSchemaResponse] = useState<SchemaResponse | null>(
    null
  );
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [executionResults, setExecutionResults] = useState<Record<string, ToolExecutionResult>>({});
  const sessionRef = useRef<WebfuseSession | null>(null);
  const spaceRef = useRef<WebfuseSpace | null>(null);
  const urlRef = useRef(url);
  urlRef.current = url;

  const addHistory = useCallback((type: HistoryEntry["type"], message: string) => {
    setHistory((prev) => [{ timestamp: Date.now(), type, message }, ...prev]);
  }, []);

  const sendToSession = useCallback((msg: Record<string, unknown>) => {
    if (sessionRef.current) {
      sessionRef.current.sendMessage(msg, "*");
    }
  }, []);

  const pendingCallbacks = useRef<Record<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>>({});

  const executeToolAsync = useCallback((toolName: string, args: Record<string, unknown>): Promise<unknown> => {
    const requestId = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    sendToSession({
      type: "webmcp:execute-tool",
      requestId,
      toolName,
      args,
    });
    track("Tool Executed", { tool: toolName });
    addHistory("tool_executed", `Executed ${toolName}`);
    return new Promise((resolve, reject) => {
      pendingCallbacks.current[requestId] = { resolve, reject };
      setTimeout(() => {
        if (pendingCallbacks.current[requestId]) {
          delete pendingCallbacks.current[requestId];
          reject(new Error(`Tool execution timed out: ${toolName}`));
        }
      }, 30000);
    });
  }, [sendToSession, addHistory]);

  const handleSaveOverrides = useCallback((override: SavedFormOverride) => {
    const targetUrl = normalizeUrl(urlRef.current);
    if (!targetUrl) return;
    saveOverrideForUrl(targetUrl, override);
    track("Tool Augmented", { tool: override.formId, url: targetUrl });
    addHistory("tool_augmented", `${override.formId} on ${targetUrl}`);
  }, [addHistory]);

  const handleClearOverrides = useCallback((form: FormTool) => {
    // Remove saved overrides for this form
    const targetUrl = normalizeUrl(urlRef.current);
    if (targetUrl) {
      const all = loadAllOverrides();
      const key = normalizeUrl(targetUrl);
      if (all[key]) {
        all[key] = all[key].filter((o) => o.formId !== form.formId);
        if (all[key].length === 0) delete all[key];
        saveAllOverrides(all);
      }
    }
    // Clear each augmented attribute on the form by sending empty values
    if (sessionRef.current) {
      for (const attrName of ["toolname", "tooldescription", "toolautosubmit"]) {
        sessionRef.current.sendMessage({
          type: "webmcp:set-form-attr",
          formIndex: form.index,
          attrName,
          attrValue: "",
          isWebfuseApplied: false,
        }, "*");
      }
      // Clear input-level attributes
      for (const input of form.inputs) {
        for (const attrName of ["toolparamtitle", "toolparamdescription"]) {
          sessionRef.current.sendMessage({
            type: "webmcp:set-input-attr",
            formIndex: form.index,
            inputIndex: input.index,
            attrName,
            attrValue: "",
            isWebfuseApplied: false,
          }, "*");
        }
      }
      // Trigger a rescan so the form list refreshes
      sessionRef.current.sendMessage({ type: "webmcp:scan" }, "*");
    }
    track("Tool Cleared", { tool: form.toolname || form.formId, url: normalizeUrl(urlRef.current) });
    addHistory("tool_cleared", `${form.toolname || form.formId} on ${normalizeUrl(urlRef.current)}`);
  }, [addHistory]);

  const handleExecuteTool = useCallback((toolName: string, args: Record<string, unknown>) => {
    const requestId = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setExecutionResults((prev) => ({
      ...prev,
      [toolName]: { requestId, toolName, pending: true },
    }));
    sendToSession({
      type: "webmcp:execute-tool",
      requestId,
      toolName,
      args,
    });
    track("Tool Executed", { tool: toolName });
    addHistory("tool_executed", `Executed ${toolName}`);
  }, [sendToSession, addHistory]);

  const restoreOverrides = useCallback((incomingForms: FormTool[]) => {
    const targetUrl = normalizeUrl(urlRef.current);
    if (!targetUrl) return;

    const saved = getOverridesForUrl(targetUrl);
    if (!saved.length) return;

    const applyForms: Record<string, unknown>[] = [];
    for (const override of saved) {
      const liveForm = incomingForms.find((f) => f.formId === override.formId);
      if (!liveForm) continue;

      // Check if this form already has the overrides applied
      const alreadyApplied = liveForm.webfuseApplied &&
        Object.entries(override.attributes).every(
          ([key, val]) => (liveForm as unknown as Record<string, string>)[key] === val
        );
      if (alreadyApplied) continue;

      const formAttrs: Record<string, { value: string; webfuseApplied: boolean }> = {};
      for (const [key, val] of Object.entries(override.attributes)) {
        formAttrs[key] = { value: val, webfuseApplied: true };
      }

      const inputUpdates: Record<string, unknown>[] = [];
      for (const [inputKey, attrs] of Object.entries(override.inputs)) {
        const liveInput = liveForm.inputs.find(
          (inp) => (inp.name || inp.id || `__idx_${inp.index}`) === inputKey
        );
        if (!liveInput) continue;
        const inputAttrs: Record<string, { value: string; webfuseApplied: boolean }> = {};
        for (const [key, val] of Object.entries(attrs)) {
          inputAttrs[key] = { value: val, webfuseApplied: true };
        }
        inputUpdates.push({ index: liveInput.index, attributes: inputAttrs });
      }

      applyForms.push({
        index: liveForm.index,
        attributes: formAttrs,
        inputs: inputUpdates,
      });
    }

    if (applyForms.length) {
      console.log("[WebMCP] Restoring overrides for", targetUrl, applyForms);
      if (sessionRef.current) {
        sessionRef.current.sendMessage({ type: "webmcp:apply-attrs", forms: applyForms }, "*");
      }
    }
  }, []);

  const handleConnect = useCallback(async () => {
    if (!url.trim()) return;

    let targetUrl = url.trim();
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = "https://" + targetUrl;
      setUrl(targetUrl);
    }
    addUrlToHistory(targetUrl);
    setUrlHistory(loadUrlHistory());

    // If we already have a running session, close existing tabs then open new one
    if (connected && sessionRef.current) {
      setForms([]);
      setImperativeTools([]);
      setSchemaResponse(null);
      const tabs = await sessionRef.current.getTabs();
      for (const tab of tabs) {
        sessionRef.current.closeTab(tab.ssid);
      }
      sessionRef.current.openTab(targetUrl);
      track("Tab Opened", { url: targetUrl });
      addHistory("tab_opened", targetUrl);

      // Request a scan after the new tab loads
      setTimeout(() => {
        if (sessionRef.current) {
          sessionRef.current.sendMessage({ type: "webmcp:scan" }, "*");
        }
      }, 1500);
      return;
    }

    setConnecting(true);

    try {
      // Initialize space if not done yet
      if (!spaceRef.current) {
        spaceRef.current = await window.webfuse.initSpace(
          WIDGET_KEY,
          SPACE_ID
        );
      }

      // Create session
      const session = spaceRef.current.session();
      sessionRef.current = session;

      session.on("session_ended", () => {
        setConnected(false);
        setConnecting(false);
        setForms([]);
        setImperativeTools([]);
        sessionRef.current = null;
        track("Disconnected");
        addHistory("disconnected", "Session ended");
      });

      // Listen for messages from the extension
      session.on("message", (...args: unknown[]) => {
        let data: Record<string, unknown> | null = null;
        for (const arg of args) {
          if (!arg || typeof arg !== "object") continue;
          const obj = arg as Record<string, unknown>;

          if (typeof obj.type === "string" && obj.type.startsWith("webmcp:")) {
            data = obj;
            break;
          }
          if (obj.data && typeof obj.data === "object") {
            const eventData = obj.data as Record<string, unknown>;
            if (eventData.message && typeof eventData.message === "object") {
              const msg = eventData.message as Record<string, unknown>;
              if (typeof msg.type === "string" && msg.type.startsWith("webmcp:")) {
                data = msg;
                break;
              }
            }
            if (typeof eventData.type === "string" && eventData.type.startsWith("webmcp:")) {
              data = eventData;
              break;
            }
          }
        }

        if (!data) return;

        switch (data.type) {
          case "webmcp:tools-update": {
            const incomingForms = (data.forms as FormTool[]) || [];
            const incomingImperative = (data.imperativeTools as ImperativeTool[]) || [];
            setForms(incomingForms);
            setImperativeTools(incomingImperative);
            restoreOverrides(incomingForms);
            const nativeMcp = incomingForms.filter((f) => f.hasWebMCP && !f.webfuseApplied).length;
            const augmented = incomingForms.filter((f) => f.webfuseApplied).length;
            const parts = [`${incomingForms.length} forms`, `${incomingImperative.length} imperative`];
            if (nativeMcp > 0) parts.push(`${nativeMcp} native MCP`);
            if (augmented > 0) parts.push(`${augmented} augmented`);
            track("Tools Discovered", { forms: incomingForms.length, imperative: incomingImperative.length, url: urlRef.current });
            addHistory("tools_discovered", `${urlRef.current} — ${parts.join(", ")}`);
            break;
          }
          case "webmcp:schema":
            setSchemaResponse(data as unknown as SchemaResponse);
            break;
          case "webmcp:execute-tool-result": {
            const toolName = data.toolName as string;
            const reqId = data.requestId as string;
            setExecutionResults((prev) => ({
              ...prev,
              [toolName]: {
                requestId: reqId,
                toolName,
                result: data.result,
                error: data.error as string | undefined,
                pending: false,
              },
            }));
            // Resolve pending async callback
            const cb = pendingCallbacks.current[reqId];
            if (cb) {
              delete pendingCallbacks.current[reqId];
              if (data.error) {
                cb.reject(new Error(data.error as string));
              } else {
                cb.resolve(data.result);
              }
            }
            if (data.error) {
              addHistory("tool_executed", `${toolName} failed: ${data.error}`);
            } else {
              addHistory("tool_executed", `${toolName} completed`);
            }
            break;
          }
        }
      });

      // Start session, then open tab via session_started global event
      // (the session object from this event is the one with working openTab)
      const openTabPromise = new Promise<void>((resolve) => {
        window.webfuse.on("session_started", (startedSession: unknown) => {
          const s = startedSession as WebfuseSession;
          s.openTab(targetUrl);
          resolve();
        });
      });

      await session.start("#webfuse-container");

      // Mark connected immediately after start resolves
      setConnected(true);
      setConnecting(false);
      track("Connected", { url: targetUrl });
      addHistory("connected", `Session started for ${targetUrl}`);

      await openTabPromise;
      track("Tab Opened", { url: targetUrl });
      addHistory("tab_opened", targetUrl);

      // Request a scan from the content script after the tab loads
      setTimeout(() => {
        if (sessionRef.current) {
          sessionRef.current.sendMessage({ type: "webmcp:scan" }, "*");
        }
      }, 1500);
    } catch (error) {
      console.error("Failed to start Webfuse session:", error);
      setConnecting(false);
    }
  }, [url, connected, restoreOverrides]);

  return (
    <div className="flex flex-col md:flex-row h-screen w-screen overflow-hidden bg-white">
      <Sidebar
        url={url}
        urlHistory={urlHistory}
        onUrlChange={setUrl}
        onConnect={handleConnect}
        connected={connected}
        connecting={connecting}
        forms={forms}
        imperativeTools={imperativeTools}
        schemaResponse={schemaResponse}
        sendToSession={sendToSession}
        onSaveOverrides={handleSaveOverrides}
        onClearOverrides={handleClearOverrides}
        onExecuteTool={handleExecuteTool}
        executionResults={executionResults}
        executeToolAsync={executeToolAsync}
      />
      <MainContent connected={connected} connecting={connecting} history={history} />
    </div>
  );
}
