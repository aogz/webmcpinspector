import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Copy, Plug } from "lucide-react";
import {
  AGENTS,
  composePrompt,
  instructions,
  KEY_PATTERN,
  LINK_HREF_LIMIT,
  LINK_PROMPT_LIMIT,
  LINKS,
  maskKey,
  serverNameFor,
  suggestTask,
  type AgentContext,
  type AgentId,
} from "../app/agentLinks";
import { store, useInspector } from "../app/store";
import { AUTOMATION_KEY } from "../config";
import { track } from "../analytics";
import { AGENT_LOGOS } from "./agentLogos";
import { copyText, cx, inputClass } from "./uiUtils";

export default function ConnectAgent({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const sessionId = useInspector((s) => s.sessionId);
  const status = useInspector((s) => s.status);
  const snapshot = useInspector((s) => s.snapshot);
  const savedKey = useInspector((s) => s.automationKey);
  const spaceSlug = useInspector((s) => s.spaceSlug);
  const mcpUrl = useInspector(() => store.mcpUrl);
  const lastSent = useInspector((s) => s.agentSent);
  const key = AUTOMATION_KEY || savedKey;
  const keyValid = !key || KEY_PATTERN.test(key);
  const toolNames = useMemo(() => snapshot?.tools.map((t) => t.name) ?? [], [snapshot]);
  const targetUrl = useInspector((s) => s.targetUrl);
  const pageUrl = snapshot?.url ?? targetUrl;
  const suggested = useMemo(() => suggestTask(toolNames, pageUrl), [toolNames, pageUrl]);
  const [task, setTask] = useState("");
  const [copied, setCopied] = useState(false);
  const effectiveTask = task || suggested;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (status !== "live") return null;

  const ctx: AgentContext | null =
    sessionId && key && keyValid
      ? {
          sessionId,
          key,
          mcpUrl,
          serverName: serverNameFor(spaceSlug),
          task: effectiveTask,
          toolNames,
          pageUrl,
        }
      : null;
  const prompts = ctx ? Object.fromEntries(AGENTS.map((a) => [a.id, composePrompt(a.id, ctx)])) : {};
  const hrefs = ctx ? Object.fromEntries(AGENTS.map((a) => [a.id, LINKS[a.id](prompts[a.id])])) : {};
  const longest = Math.max(0, ...Object.values(prompts).map((p) => p.length));
  const linkable = !!ctx && longest <= LINK_PROMPT_LIMIT && Object.values(hrefs).every((h) => h.length <= LINK_HREF_LIMIT);
  const preview = ctx
    ? instructions((lastSent as AgentId) || "copy", { ...ctx, key: maskKey(ctx.key) })
    : "The session ID and MCP setup are added once the session is running.";

  const hint = !sessionId
    ? "Waiting for the session ID…"
    : !key
      ? "Paste the Space's Automation key first. The agent needs it to connect."
      : !keyValid
        ? "That does not look like an Automation key."
        : !effectiveTask.trim()
          ? "Write a task."
          : ctx && !linkable
            ? `App links hold up to ${LINK_PROMPT_LIMIT.toLocaleString("en")} characters and this prompt has ${longest.toLocaleString("en")}. Shorten the task, or copy the prompt.`
            : copied
              ? "Prompt copied. Paste it into your agent."
              : AGENTS.find((a) => a.id === lastSent)?.hint ?? "Each button opens the app with the prompt filled in. Nothing is sent until you press Enter there.";

  const pill = (
    <button
      onClick={() => onOpenChange(true)}
      aria-expanded={false}
      className="absolute bottom-4 right-4 z-20 inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-xs font-semibold text-accent-fg shadow-lg hover:brightness-110 cursor-pointer"
    >
      <span className={cx("h-2 w-2 rounded-full", lastSent ? "bg-ok-soft" : "bg-accent-fg/70")} />
      <Plug className="h-3.5 w-3.5" />
      {lastSent ? "Prompt sent to agent" : "Connect your agent"}
      <ChevronUp className="h-3.5 w-3.5" />
    </button>
  );
  if (!open) return pill;

  return (
    <>
      <div className="absolute inset-0 z-20 bg-scrim" aria-hidden="true" onClick={() => onOpenChange(false)} />
      <aside
        aria-labelledby="connect-agent-title"
        className="absolute bottom-4 right-4 left-4 md:left-auto z-30 md:w-[440px] max-h-[calc(100%-2rem)] overflow-auto rounded-xl border border-line bg-panel p-4 shadow-2xl space-y-3"
      >
        <div className="flex items-center gap-2">
          <h2 id="connect-agent-title" className="flex-1 text-sm font-semibold text-fg">Connect your agent</h2>
          <button onClick={() => onOpenChange(false)} title="Minimize (Esc)" className="rounded p-1 text-muted hover:text-fg hover:bg-panel-2 cursor-pointer">
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-muted">
          Send your agent one prompt. It connects to this browser over Webfuse's Session MCP Server and calls the page's WebMCP
          tools while you watch here.
        </p>

        {!AUTOMATION_KEY && (
          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted">Automation key</span>
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="ak_…"
              className={cx(inputClass, !keyValid && "ring-2 ring-err")}
              value={savedKey}
              onChange={(e) => store.setAutomationKey(e.target.value)}
            />
            <span className="block text-[10px] text-faint">
              Goes into the prompt and stays in this browser. Find it in Webfuse Studio, on the Space's Developers tab, under API. The
              Space needs the Automation app.
            </span>
          </label>
        )}

        <div className="space-y-1">
          <label htmlFor="agent-task" className="text-[11px] font-medium text-muted">Task</label>
          <textarea
            id="agent-task"
            rows={3}
            spellCheck={false}
            className={inputClass}
            placeholder={suggested}
            value={task}
            onChange={(e) => {
              setTask(e.target.value);
              setCopied(false);
              store.markAgentSent("");
            }}
          />
          <details className="text-[11px]">
            <summary className="cursor-pointer text-muted">Includes the session ID and MCP setup</summary>
            <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-line bg-code p-2 font-mono text-[10px] text-fg">{preview}</pre>
          </details>
        </div>

        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Send the prompt">
          {AGENTS.map((agent) => (
            <a
              key={agent.id}
              href={linkable ? hrefs[agent.id] : undefined}
              aria-disabled={!linkable}
              onClick={(e) => {
                if (!linkable) {
                  e.preventDefault();
                  return;
                }
                setCopied(false);
                store.markAgentSent(agent.id);
                track("Agent Link", { agent: agent.id });
              }}
              className={cx(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors",
                linkable ? "border-line hover:border-accent cursor-pointer" : "border-line opacity-50 cursor-not-allowed",
                lastSent === agent.id && "border-accent bg-accent-soft",
              )}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white [&>svg]:h-4 [&>svg]:w-4" dangerouslySetInnerHTML={{ __html: AGENT_LOGOS[agent.id] }} />
              <span className="min-w-0">
                <span className="block text-xs font-medium text-fg">{agent.label}</span>
                <span className="block text-[10px] text-faint">{agent.note}</span>
              </span>
            </a>
          ))}
          <button
            disabled={!ctx}
            onClick={async () => {
              if (!ctx) return;
              const ok = await copyText(composePrompt("copy", ctx));
              setCopied(ok);
              if (ok) {
                store.markAgentSent("copy");
                track("Agent Link", { agent: "copy" });
              }
            }}
            className={cx(
              "flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-left disabled:opacity-50 disabled:cursor-not-allowed hover:border-accent cursor-pointer",
              lastSent === "copy" && "border-accent bg-accent-soft",
            )}
          >
            <Copy className="h-5 w-5 shrink-0 text-fg" />
            <span>
              <span className="block text-xs font-medium text-fg">{copied ? "Copied" : "Copy prompt"}</span>
              <span className="block text-[10px] text-faint">For any other agent</span>
            </span>
          </button>
        </div>
        <p role="status" className={cx("text-[11px]", ctx && !linkable ? "text-warn" : "text-muted")}>{hint}</p>
        <p className="text-[10px] text-faint">
          The Automation key lets anyone who has it drive sessions in the Space. Use a Space made for testing, and create a new key in
          Studio if one leaks.
        </p>
      </aside>
    </>
  );
}
