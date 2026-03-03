import { useState, useRef, useCallback } from "react";
import Sidebar from "./components/Sidebar";
import MainContent from "./components/MainContent";

const WIDGET_KEY = "wk_tqCYlFrDmS_UGqhLcI_Wn6Y1DDTMaTSQ";
const SPACE_ID = "1798";

export default function App() {
  const [url, setUrl] = useState("");
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const sessionRef = useRef<WebfuseSession | null>(null);
  const spaceRef = useRef<WebfuseSpace | null>(null);

  const handleConnect = useCallback(async () => {
    if (!url.trim()) return;

    const targetUrl = url.trim();

    // If we already have a running session, just open a new tab
    if (sessionRef.current?.started) {
      await sessionRef.current.openTab(targetUrl);
      return;
    }

    setConnecting(true);

    try {
      // Initialize space if not done yet
      if (!spaceRef.current) {
        spaceRef.current = await window.webfuse.initSpace(WIDGET_KEY, SPACE_ID);
      }

      // Create and start a session embedded in the container
      const session = spaceRef.current.session();
      sessionRef.current = session;

      session.on("session_ended", () => {
        setConnected(false);
        sessionRef.current = null;
      });

      await session.start("#webfuse-container");
      setConnected(true);
      setConnecting(false);

      // Now the session is fully started, open the target URL
      await session.openTab(targetUrl);
    } catch (error) {
      console.error("Failed to start Webfuse session:", error);
      setConnecting(false);
    }
  }, [url]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white">
      <Sidebar
        url={url}
        onUrlChange={setUrl}
        onConnect={handleConnect}
        connected={connected}
        connecting={connecting}
      />
      <MainContent connected={connected} connecting={connecting} />
    </div>
  );
}
