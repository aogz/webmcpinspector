import { CheckCircle2, CircleSlash, Loader2, XCircle } from "lucide-react";
import type { CallRecord } from "../app/store";
import { Badge, CodeBlock } from "./ui";

export default function ResultView({ call }: { call: CallRecord }) {
  const outcome = call.outcome;
  if (call.pending || !outcome) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Running {call.toolName}…
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {outcome.ok ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-ok" />
        ) : outcome.aborted ? (
          <CircleSlash className="h-3.5 w-3.5 text-warn" />
        ) : (
          <XCircle className="h-3.5 w-3.5 text-err" />
        )}
        <span className="font-medium text-fg">{outcome.ok ? "Returned" : outcome.aborted ? "Cancelled" : "Failed"}</span>
        <span className="text-faint">{outcome.durationMs}ms</span>
        {outcome.via && <span className="text-faint truncate">via {outcome.via}</span>}
        {call.inputErrors.length > 0 && (
          <Badge tone="warn" title={call.inputErrors.map((e) => `${e.path} ${e.message}`).join("\n")}>
            Arguments broke the input schema
          </Badge>
        )}
        {call.outputErrors.length > 0 && (
          <Badge tone="warn" title={call.outputErrors.map((e) => `${e.path} ${e.message}`).join("\n")}>
            Result breaks the output schema
          </Badge>
        )}
      </div>
      {outcome.ok ? (
        <CodeBlock value={outcome.result === undefined ? "undefined" : outcome.result} />
      ) : (
        <p className="rounded-md bg-err-soft px-2 py-1.5 text-xs text-err break-words">{outcome.error}</p>
      )}
      {call.outputErrors.length > 0 && (
        <ul className="text-[10px] text-warn">
          {call.outputErrors.map((e, i) => (
            <li key={i}>
              <span className="font-mono">{e.path}</span> {e.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
