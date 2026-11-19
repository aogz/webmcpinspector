import { useMemo, useState } from "react";
import { ArrowRight, Ban, Plug } from "lucide-react";
import { specView, webfuseAgentView } from "../shared/agentView";
import type { PageSnapshot } from "../shared/types";
import { Badge, Button, CodeBlock, Notice, SectionTitle } from "./ui";
import { cx } from "./uiUtils";

export default function AgentViewPanel({ snapshot, onConnect }: { snapshot: PageSnapshot | null; onConnect: () => void }) {
  const entries = useMemo(() => snapshot?.tools.map((t) => webfuseAgentView(t)) ?? [], [snapshot]);
  const [selected, setSelected] = useState<string>("");
  if (!snapshot) return <p className="p-4 text-xs text-muted">Open a page to see what agents receive.</p>;
  if (!entries.length) {
    return <p className="p-4 text-xs text-muted">The page has no tools, so agents get only Webfuse's built-in browser tools.</p>;
  }
  const current = entries.find((e) => e.tool.name === selected) ?? entries[0];
  const dropped = entries.filter((e) => e.dropped).length;

  return (
    <div>
      <div className="px-3 pt-3 space-y-2">
        <p className="text-xs text-muted">
          A browser agent reads a tool as the page registered it. An agent connected through Webfuse's Session MCP Server gets a
          translated copy. Compare the two to catch what gets lost.
        </p>
        {dropped > 0 && (
          <Notice tone="err" icon={<Ban className="h-3.5 w-3.5" />}>
            {dropped} tool{dropped > 1 ? "s are" : " is"} not advertised over MCP at all.
          </Notice>
        )}
        <Button variant="primary" onClick={onConnect}>
          <Plug className="h-3.5 w-3.5" /> Try it with your agent
        </Button>
      </div>
      <SectionTitle>Tools</SectionTitle>
      <div className="flex flex-wrap gap-1 px-3">
        {entries.map((e) => (
          <button
            key={e.tool.name}
            onClick={() => setSelected(e.tool.name)}
            className={cx(
              "rounded px-2 py-1 font-mono text-[11px] cursor-pointer border",
              e.tool.name === current.tool.name ? "border-accent bg-accent-soft text-accent-text" : "border-line text-muted hover:text-fg",
              e.dropped && "line-through",
            )}
          >
            {e.tool.name}
          </button>
        ))}
      </div>
      <div className="space-y-3 p-3">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase text-faint">Registered on the page (what browser agents read)</p>
          <CodeBlock value={specView(current.tool)} maxHeight="14rem" />
        </div>
        <div className="flex items-center gap-1 text-[10px] text-faint">
          <ArrowRight className="h-3 w-3" /> Webfuse Session MCP Server, dynamic mode
        </div>
        {current.dropped ? (
          <Notice tone="err" icon={<Ban className="h-3.5 w-3.5" />}>
            Not advertised. {current.dropped}
          </Notice>
        ) : (
          <>
            <ul className="space-y-0.5 text-[11px] text-muted">
              {current.changes.map((c) => (
                <li key={c} className="flex gap-1.5">
                  <Badge tone="info">changed</Badge> {c}
                </li>
              ))}
            </ul>
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase text-faint">What an MCP client receives in tools/list</p>
              <CodeBlock value={current.advertised} maxHeight="14rem" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
