import { useState, useRef, useCallback } from "react";
import Sidebar from "./components/Sidebar";
import MainContent from "./components/MainContent";
import type { FormTool, ImperativeTool, SchemaResponse } from "./types";

const WIDGET_KEY = "wk_tqCYlFrDmS_UGqhLcI_Wn6Y1DDTMaTSQ";
const SPACE_ID = "1798";

export default function App() {
  const [url, setUrl] = useState("");
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [forms, setForms] = useState<FormTool[]>([]);
  const [imperativeTools, setImperativeTools] = useState<ImperativeTool[]>([]);
  const [schemaResponse, setSchemaResponse] = useState<SchemaResponse | null>(
    null
  );
  const sessionRef = useRef<WebfuseSession | null>(null);
  const spaceRef = useRef<WebfuseSpace | null>(null);

  const sendToSession = useCallback((msg: Record<string, unknown>) => {
    if (sessionRef.current) {
      sessionRef.current.sendMessage(msg, "*");
    }
  }, []);

  const handleConnect = useCallback(async () => {
    if (!url.trim()) return;

    const targetUrl = url.trim();

    // If we already have a running session, open a new tab
    if (connected && sessionRef.current) {
      sessionRef.current.openTab(targetUrl);
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
          case "webmcp:tools-update":
            setForms((data.forms as FormTool[]) || []);
            setImperativeTools(
              (data.imperativeTools as ImperativeTool[]) || []
            );
            break;
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
  }, [url, connected]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white">
      <Sidebar
        url={url}
        onUrlChange={setUrl}
        onConnect={handleConnect}
        connected={connected}
        connecting={connecting}
        forms={forms}
        imperativeTools={imperativeTools}
        schemaResponse={schemaResponse}
        sendToSession={sendToSession}
      />
      <MainContent connected={connected} connecting={connecting} />
    </div>
  );
}
