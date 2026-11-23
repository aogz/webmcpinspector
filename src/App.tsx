import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Github, Monitor, Moon, PanelLeftClose, PanelLeftOpen, Search, Sun } from "lucide-react";
import { DEFAULT_URLS, readString, STORAGE_KEYS, writeString } from "./app/storage";
import { store, useInspector } from "./app/store";
import AgentViewPanel from "./components/AgentViewPanel";
import BuildPanel from "./components/BuildPanel";
import CommandPalette, { type PaletteAction } from "./components/CommandPalette";
import ConnectAgent from "./components/ConnectAgent";
import Dock from "./components/Dock";
import ScorePanel from "./components/ScorePanel";
import ToolsPanel from "./components/ToolsPanel";
import { Notice, Tabs } from "./components/ui";
import { cx } from "./components/uiUtils";
import UrlBar from "./components/UrlBar";
import WebfuseLogo from "./components/WebfuseLogo";
import { REPO_URL } from "./config";
import { lintSnapshot } from "./shared/lint";
import { inspectLink } from "./app/shareLink";
import { copyText } from "./components/uiUtils";

// Loaded on first use: it carries the model SDKs.
const PromptPanel = lazy(() => import("./components/PromptPanel"));

type Panel = "tools" | "score" | "agent" | "build" | "prompt";
type Theme = "system" | "light" | "dark";

function applyTheme(theme: Theme) {
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

function SessionOverlay() {
  const status = useInspector((s) => s.status);
  const error = useInspector((s) => s.error);
  if (status === "live") return null;
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-bg p-6">
      <div className="max-w-md space-y-3 text-center">
        {status === "connecting" ? (
          <p className="text-sm text-muted">Starting a Webfuse session…</p>
        ) : status === "error" ? (
          <>
            <h2 className="text-base font-semibold text-fg">The session didn't start</h2>
            <p className="text-sm text-muted">{error}</p>
          </>
        ) : (
          <>
            <h2 className="text-base font-semibold text-fg">{status === "ended" ? "Session ended" : "Inspect WebMCP tools on any page"}</h2>
            <p className="text-sm text-muted">
              Enter a URL. The page opens in a live Webfuse session with WebMCP available in any browser, and its tools show up on the
              left.
            </p>
            <div className="flex flex-col gap-1.5">
              {DEFAULT_URLS.map((u) => (
                <button
                  key={u}
                  onClick={() => {
                    store.setTargetUrl(u);
                    void store.connect();
                  }}
                  className="truncate rounded-md border border-line px-3 py-1.5 text-xs text-accent-text hover:border-accent cursor-pointer"
                >
                  Try {u.replace(/^https:\/\/googlechromelabs\.github\.io\/webmcp-tools\/demos\//, "the ").replace(/\/$/, "")} demo
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const snapshot = useInspector((s) => s.snapshot);
  const status = useInspector((s) => s.status);
  const extension = useInspector((s) => s.extension);
  const [panel, setPanel] = useState<Panel>("tools");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [agentOpen, setAgentOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => (readString(STORAGE_KEYS.theme) as Theme) || "system");
  const urlRef = useRef<HTMLInputElement>(null);
  const report = useMemo(() => lintSnapshot(snapshot), [snapshot]);

  useEffect(() => {
    store.startFromQuery();
  }, []);

  useEffect(() => {
    applyTheme(theme);
    writeString(STORAGE_KEYS.theme, theme === "system" ? "" : theme);
  }, [theme]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") {
        e.preventDefault();
        urlRef.current?.focus();
      } else if (e.key === "r" && store.getState().status === "live") {
        store.rescan(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const actions: PaletteAction[] = [
    { id: "url", label: "Go to URL", hint: "/", run: () => urlRef.current?.focus() },
    { id: "rescan", label: "Scan the page again", hint: "R", run: () => store.rescan(true) },
    { id: "agent", label: "Connect your agent", run: () => setAgentOpen(true) },
    {
      id: "share",
      label: "Copy a link that opens this page in the inspector",
      run: () => {
        const target = store.getState().snapshot?.url || store.getState().targetUrl;
        if (target) void copyText(inspectLink(target, window.location));
      },
    },
    ...(["tools", "score", "agent", "build", "prompt"] as Panel[]).map((p) => ({
      id: `panel-${p}`,
      label: `Show ${{ tools: "Tools", score: "Score", agent: "Agent view", build: "Build", prompt: "Prompt debugger" }[p]}`,
      run: () => {
        setSidebarOpen(true);
        setPanel(p);
      },
    })),
    { id: "theme", label: `Theme: switch to ${theme === "dark" ? "light" : "dark"}`, run: () => setTheme(theme === "dark" ? "light" : "dark") },
    ...(snapshot?.tools ?? []).map((t) => ({
      id: `tool-${t.name}`,
      label: `Tool: ${t.name}`,
      run: () => {
        setSidebarOpen(true);
        setPanel("tools");
      },
    })),
  ];

  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-bg text-fg md:flex-row">
      {sidebarOpen ? (
        <aside className="flex h-[48vh] w-full flex-col overflow-hidden border-b border-line bg-panel md:h-auto md:w-[400px] md:min-w-[400px] md:border-b-0 md:border-r">
          <header className="flex items-center gap-1 border-b border-line px-3 py-2">
            <h1 className="flex-1 text-sm font-semibold">WebMCP Inspector</h1>
            <button onClick={() => setPaletteOpen(true)} title="Commands (Ctrl+K)" className="rounded p-1.5 text-muted hover:bg-panel-2 hover:text-fg cursor-pointer">
              <Search className="h-4 w-4" />
            </button>
            <button
              onClick={() => setTheme(theme === "system" ? "light" : theme === "light" ? "dark" : "system")}
              title={`Theme: ${theme}`}
              className="rounded p-1.5 text-muted hover:bg-panel-2 hover:text-fg cursor-pointer"
            >
              <ThemeIcon className="h-4 w-4" />
            </button>
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer" title="Source on GitHub" className="rounded p-1.5 text-muted hover:bg-panel-2 hover:text-fg">
              <Github className="h-4 w-4" />
            </a>
            <button onClick={() => setSidebarOpen(false)} title="Collapse" className="hidden rounded p-1.5 text-muted hover:bg-panel-2 hover:text-fg md:block cursor-pointer">
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </header>
          <UrlBar inputRef={urlRef} />
          {status === "live" && extension === "missing" && (
            <div className="px-3 pt-2">
              <Notice tone="warn" icon={<AlertTriangle className="h-3.5 w-3.5" />}>
                The page is not answering. It may still be loading, or the Space may not have the inspector extension.
              </Notice>
            </div>
          )}
          <Tabs
            className="border-b border-line px-1"
            value={panel}
            onChange={setPanel}
            tabs={[
              { id: "tools", label: "Tools", count: snapshot?.tools.length },
              {
                id: "score",
                label: (
                  <span className="inline-flex items-center gap-1">
                    Score
                    {snapshot && (
                      <span className={cx("rounded px-1 text-[10px] font-bold", report.score >= 75 ? "bg-ok-soft text-ok" : report.score >= 40 ? "bg-warn-soft text-warn" : "bg-err-soft text-err")}>
                        {report.grade}
                      </span>
                    )}
                  </span>
                ),
              },
              { id: "agent", label: "Agent view" },
              { id: "build", label: "Build" },
              { id: "prompt", label: "Prompt" },
            ]}
          />
          <div className={cx("min-h-0 flex-1", panel === "prompt" ? "flex flex-col" : "overflow-y-auto")}>
            {panel === "tools" && <ToolsPanel snapshot={snapshot} />}
            {panel === "score" && <ScorePanel snapshot={snapshot} />}
            {panel === "agent" && <AgentViewPanel snapshot={snapshot} onConnect={() => setAgentOpen(true)} />}
            {panel === "build" && <BuildPanel snapshot={snapshot} />}
            {panel === "prompt" && (
              <Suspense fallback={<p className="p-4 text-xs text-muted">Loading…</p>}>
                <PromptPanel snapshot={snapshot} />
              </Suspense>
            )}
          </div>
          <footer className="hidden items-center justify-center gap-1.5 border-t border-line px-3 py-2 text-xs text-faint md:flex">
            Powered by
            <a href="https://www.webfuse.com" target="_blank" rel="noopener noreferrer" className="inline-flex text-fg hover:opacity-80">
              <WebfuseLogo className="h-4 w-auto" />
            </a>
          </footer>
        </aside>
      ) : (
        <aside className="hidden w-11 flex-col items-center gap-2 border-r border-line bg-panel py-2 md:flex">
          <button onClick={() => setSidebarOpen(true)} title="Open the sidebar" className="rounded p-1.5 text-muted hover:bg-panel-2 hover:text-fg cursor-pointer">
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        </aside>
      )}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="relative min-h-0 flex-1">
          <iframe id="webfuse-container" className="h-full w-full border-0" title="Webfuse session" />
          <SessionOverlay />
          <ConnectAgent open={agentOpen} onOpenChange={setAgentOpen} />
        </div>
        <Dock />
      </main>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} actions={actions} />
    </div>
  );
}
