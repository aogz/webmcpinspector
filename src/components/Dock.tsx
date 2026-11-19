import { useState } from "react";
import { ChevronDown, ChevronUp, Download, RotateCcw, Square, Trash2 } from "lucide-react";
import { store, useInspector, type ActivityEntry, type CallRecord } from "../app/store";
import { Badge, Button, CodeBlock, CopyButton, Tabs } from "./ui";
import { cx, download, formatTime } from "./uiUtils";
import ResultView from "./ResultView";
import { bugReport } from "../app/report";

const KIND_TONE: Record<ActivityEntry["kind"], "neutral" | "accent" | "ok" | "warn" | "err" | "info"> = {
  session: "neutral",
  tools: "ok",
  lifecycle: "info",
  call: "accent",
  augment: "accent",
  navigate: "neutral",
  error: "err",
  agent: "warn",
};

function ActivityList() {
  const activity = useInspector((s) => s.activity);
  const [filter, setFilter] = useState<ActivityEntry["kind"] | "all">("all");
  const [openId, setOpenId] = useState<number | null>(null);
  const shown = filter === "all" ? activity : activity.filter((a) => a.kind === filter);
  const kinds = Array.from(new Set(activity.map((a) => a.kind)));

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b border-line px-3 py-1">
        {(["all", ...kinds] as const).map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={cx("rounded px-1.5 py-0.5 text-[10px] cursor-pointer", filter === k ? "bg-accent-soft text-accent-text" : "text-muted hover:text-fg")}
          >
            {k}
          </button>
        ))}
        <span className="flex-1" />
        <Button variant="ghost" title="Download as JSON" onClick={() => download("webmcp-activity.json", JSON.stringify(activity, null, 2), "application/json")}>
          <Download className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" title="Clear" onClick={store.clearActivity}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex-1 overflow-auto px-3 py-1">
        {shown.length === 0 && <p className="py-2 text-xs italic text-faint">Nothing yet.</p>}
        {shown.map((entry) => (
          <div key={entry.id} className="py-0.5">
            <button
              className="flex w-full items-start gap-2 text-left text-xs cursor-pointer"
              onClick={() => setOpenId(openId === entry.id ? null : entry.id)}
              disabled={entry.detail === undefined}
            >
              <span className="shrink-0 font-mono text-faint">{formatTime(entry.at)}</span>
              <Badge tone={KIND_TONE[entry.kind]}>{entry.kind}</Badge>
              <span className="min-w-0 text-muted break-words">{entry.message}</span>
            </button>
            {openId === entry.id && entry.detail !== undefined && (
              <div className="mt-1 ml-16">
                <CodeBlock value={entry.detail} maxHeight="10rem" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function diffLines(a: string, b: string): { sign: " " | "-" | "+"; line: string }[] {
  const left = a.split("\n");
  const right = b.split("\n");
  const out: { sign: " " | "-" | "+"; line: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length || j < right.length) {
    if (left[i] === right[j]) {
      out.push({ sign: " ", line: left[i] });
      i++;
      j++;
    } else if (j < right.length && !left.slice(i).includes(right[j])) {
      out.push({ sign: "+", line: right[j++] });
    } else {
      out.push({ sign: "-", line: left[i++] });
    }
  }
  return out;
}

function CallItem({ call, previous }: { call: CallRecord; previous?: CallRecord }) {
  const [open, setOpen] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const pretty = (c?: CallRecord) => JSON.stringify(c?.outcome?.ok ? c.outcome.result : c?.outcome?.error, null, 2) ?? "";
  return (
    <div className="border-b border-line py-1.5">
      <div className="flex items-center gap-2 text-xs">
        <button className="flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer" onClick={() => setOpen(!open)}>
          <span className="font-mono text-faint">{formatTime(call.startedAt)}</span>
          <span className={cx("h-1.5 w-1.5 rounded-full shrink-0", call.pending ? "bg-warn animate-pulse" : call.outcome?.ok ? "bg-ok" : "bg-err")} />
          <span className="font-mono font-medium text-fg truncate">{call.toolName}</span>
          {call.origin !== "manual" && <Badge>{call.origin}</Badge>}
          {call.outcome && <span className="text-faint">{call.outcome.durationMs}ms</span>}
        </button>
        {call.pending ? (
          <Button variant="danger" title="Cancel" onClick={() => store.cancel(call.requestId)}>
            <Square className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button variant="ghost" title="Run again with the same arguments" onClick={() => void store.execute(call.toolName, call.args, { origin: "replay" })}>
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        )}
        {open ? <ChevronUp className="h-3.5 w-3.5 text-faint" /> : <ChevronDown className="h-3.5 w-3.5 text-faint" />}
      </div>
      {open && (
        <div className="mt-1.5 grid gap-2 md:grid-cols-2">
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase text-faint">Request</p>
            <CodeBlock value={call.args} maxHeight="12rem" />
          </div>
          <div>
            <div className="mb-1 flex items-center gap-2">
              <p className="text-[10px] font-semibold uppercase text-faint">Response</p>
              {previous && !call.pending && (
                <button className="text-[10px] text-accent-text cursor-pointer" onClick={() => setShowDiff(!showDiff)}>
                  {showDiff ? "Hide diff" : "Diff with previous call"}
                </button>
              )}
            </div>
            {showDiff && previous ? (
              <pre className="max-h-48 overflow-auto rounded-md border border-line bg-code p-2 text-[11px] font-mono">
                {diffLines(pretty(previous), pretty(call)).map((d, i) => (
                  <div key={i} className={d.sign === "+" ? "text-ok" : d.sign === "-" ? "text-err" : "text-muted"}>
                    {d.sign} {d.line}
                  </div>
                ))}
              </pre>
            ) : (
              <ResultView call={call} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CallList() {
  const calls = useInspector((s) => s.calls);
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-line px-3 py-1">
        <span className="text-[10px] text-faint flex-1">Every tool call, from the sidebar, the prompt debugger and evals.</span>
        <Button variant="ghost" title="Download as JSON" onClick={() => download("webmcp-calls.json", JSON.stringify(calls, null, 2), "application/json")}>
          <Download className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" title="Clear finished calls" onClick={store.clearCalls}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex-1 overflow-auto px-3">
        {calls.length === 0 && <p className="py-2 text-xs italic text-faint">No calls yet.</p>}
        {calls.map((call, i) => (
          <CallItem key={call.requestId} call={call} previous={calls.slice(i + 1).find((c) => c.toolName === call.toolName && !c.pending)} />
        ))}
      </div>
    </div>
  );
}

export default function Dock() {
  const [tab, setTab] = useState<"activity" | "calls">("activity");
  const [open, setOpen] = useState(true);
  const activityCount = useInspector((s) => s.activity.length);
  const callCount = useInspector((s) => s.calls.length);
  return (
    <div className={cx("flex flex-col border-t border-line bg-panel", open ? "h-[140px] md:h-[220px]" : "")}>
      <div className="flex items-center gap-2 pr-2">
        <Tabs
          className="flex-1 px-1"
          value={tab}
          onChange={(t) => {
            setTab(t);
            setOpen(true);
          }}
          tabs={[
            { id: "activity", label: "Activity", count: activityCount },
            { id: "calls", label: "Calls", count: callCount },
          ]}
        />
        <CopyButton text={bugReport()} label="Copy report" />
        <Button variant="ghost" title={open ? "Collapse" : "Expand"} onClick={() => setOpen(!open)}>
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </Button>
      </div>
      {open && <div className="min-h-0 flex-1">{tab === "activity" ? <ActivityList /> : <CallList />}</div>}
    </div>
  );
}
