import { useState, useRef, useCallback } from "react";
import Sidebar from "./components/Sidebar";
import MainContent from "./components/MainContent";
import type { FormTool, ImperativeTool, SchemaResponse, SavedFormOverride, SavedPageOverrides } from "./types";

const STORAGE_KEY = "webmcp-overrides";
const URL_STORAGE_KEY = "webmcp-last-url";
const URL_HISTORY_KEY = "webmcp-url-history";
const WIDGET_KEY = "wk_tqCYlFrDmS_UGqhLcI_Wn6Y1DDTMaTSQ";
const SPACE_ID = "1798";

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
  const sessionRef = useRef<WebfuseSession | null>(null);
  const spaceRef = useRef<WebfuseSpace | null>(null);
  const restoredUrlRef = useRef<string | null>(null);
  const urlRef = useRef(url);
  urlRef.current = url;

  const sendToSession = useCallback((msg: Record<string, unknown>) => {
    if (sessionRef.current) {
      sessionRef.current.sendMessage(msg, "*");
    }
  }, []);

  const handleSaveOverrides = useCallback((override: SavedFormOverride) => {
    const targetUrl = normalizeUrl(urlRef.current);
    if (!targetUrl) return;
    saveOverrideForUrl(targetUrl, override);
    console.log("[WebMCP] Saved overrides for", targetUrl, override);
  }, []);

  const restoreOverrides = useCallback((incomingForms: FormTool[]) => {
    const targetUrl = normalizeUrl(urlRef.current);
    if (!targetUrl) return;
    if (restoredUrlRef.current === targetUrl) return;
    restoredUrlRef.current = targetUrl;

    const saved = getOverridesForUrl(targetUrl);
    if (!saved.length) return;

    const applyForms: Record<string, unknown>[] = [];
    for (const override of saved) {
      const liveForm = incomingForms.find((f) => f.formId === override.formId);
      if (!liveForm) continue;

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

    const targetUrl = url.trim();
    addUrlToHistory(targetUrl);
    setUrlHistory(loadUrlHistory());

    // If we already have a running session, close existing tabs then open new one
    if (connected && sessionRef.current) {
      const tabs = await sessionRef.current.getTabs();
      for (const tab of tabs) {
        sessionRef.current.closeTab(tab.ssid);
      }
      sessionRef.current.openTab(targetUrl);
      restoredUrlRef.current = null;
      return;
    }

    setConnecting(true);
    restoredUrlRef.current = null;

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
            setForms(incomingForms);
            setImperativeTools(
              (data.imperativeTools as ImperativeTool[]) || []
            );
            restoreOverrides(incomingForms);
            break;
          }
          case "webmcp:schema":
            setSchemaResponse(data as unknown as SchemaResponse);
            break;
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

      await openTabPromise;
    } catch (error) {
      console.error("Failed to start Webfuse session:", error);
      setConnecting(false);
    }
  }, [url, connected, restoreOverrides]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white">
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
      />
      <MainContent connected={connected} connecting={connecting} />
    </div>
  );
}
