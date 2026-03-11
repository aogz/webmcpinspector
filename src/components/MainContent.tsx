import { useState } from "react";
import { ChevronDown, ChevronRight, Clock } from "lucide-react";
import type { HistoryEntry } from "../types";

interface MainContentProps {
  connected: boolean;
  connecting: boolean;
  history: HistoryEntry[];
}

const typeColors: Record<HistoryEntry["type"], string> = {
  connected: "text-green-400",
  disconnected: "text-red-400",
  tools_discovered: "text-[#60a5fa]",
  tool_augmented: "text-[#a78bfa]",
  tool_cleared: "text-amber-400",
  tab_opened: "text-[#6b6b80]",
  tool_executed: "text-emerald-400",
};

const typeLabels: Record<HistoryEntry["type"], string> = {
  connected: "CONNECTED",
  disconnected: "DISCONNECTED",
  tools_discovered: "DISCOVERED",
  tool_augmented: "AUGMENTED",
  tool_cleared: "CLEARED",
  tab_opened: "TAB",
  tool_executed: "EXECUTED",
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function MainContent({ connected, connecting, history }: MainContentProps) {
  const [historyOpen, setHistoryOpen] = useState(true);

  return (
    <div className="h-[60vh] md:h-auto flex-1 flex flex-col min-w-0 bg-[#0a0a0f]">
      <div className="flex-1 min-h-0 relative">
        <iframe
          id="webfuse-container"
          className="w-full h-full border-0"
          title="Webfuse Session"
        />
        {!connected && !connecting && (
          <div className="absolute inset-0 flex items-center justify-center text-[#6b6b80] text-sm bg-[#0a0a0f]">
            Enter a URL and click Connect to start a session
          </div>
        )}
        {connecting && !connected && (
          <div className="absolute inset-0 flex items-center justify-center text-[#9a9ab0] text-sm bg-[#0a0a0f]">
            <div className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Starting session...
            </div>
          </div>
        )}
      </div>

      {/* Collapsible History */}
      <div className={`border-t border-[#1e1e2e] ${historyOpen ? "h-[100px] md:h-[200px] min-h-[100px] md:min-h-[200px]" : ""} flex flex-col`}>
        <button
          onClick={() => setHistoryOpen(!historyOpen)}
          className="flex items-center gap-2 px-4 py-2 bg-[#12121a] hover:bg-[#1e1e2e] transition-colors cursor-pointer shrink-0"
        >
          {historyOpen ? (
            <ChevronDown className="w-3.5 h-3.5 text-[#6b6b80]" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-[#6b6b80]" />
          )}
          <Clock className="w-3.5 h-3.5 text-[#9a9ab0]" />
          <span className="text-xs font-semibold text-[#9a9ab0] uppercase tracking-wide">
            History
          </span>
          {history.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#1e1e2e] text-[#6b6b80] font-medium">
              {history.length}
            </span>
          )}
        </button>
        {historyOpen && (
          <div className="flex-1 overflow-auto px-4 py-2 bg-[#0a0a0f]">
            {history.length === 0 ? (
              <p className="text-sm text-[#6b6b80] italic">No history yet</p>
            ) : (
              <div className="space-y-1">
                {history.map((entry, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="text-[#4a4a5a] shrink-0 font-mono">{formatTime(entry.timestamp)}</span>
                    <span className={`shrink-0 font-semibold ${typeColors[entry.type]}`}>
                      {typeLabels[entry.type]}
                    </span>
                    <span className="text-[#9a9ab0] truncate">{entry.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
