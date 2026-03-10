import type { HistoryEntry } from "../types";

interface MainContentProps {
  connected: boolean;
  connecting: boolean;
  history: HistoryEntry[];
}

const typeColors: Record<HistoryEntry["type"], string> = {
  connected: "text-green-600",
  disconnected: "text-red-500",
  tools_discovered: "text-blue-600",
  tool_augmented: "text-purple-600",
  tool_cleared: "text-amber-600",
  tab_opened: "text-gray-600",
};

const typeLabels: Record<HistoryEntry["type"], string> = {
  connected: "CONNECTED",
  disconnected: "DISCONNECTED",
  tools_discovered: "DISCOVERED",
  tool_augmented: "AUGMENTED",
  tool_cleared: "CLEARED",
  tab_opened: "TAB",
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function MainContent({ connected, connecting, history }: MainContentProps) {
  return (
    <div className="h-[60vh] md:h-auto flex-1 flex flex-col min-w-0 bg-gray-50">
      <div className="flex-1 min-h-0 relative">
        <iframe
          id="webfuse-container"
          className="w-full h-full border-0"
          title="Webfuse Session"
        />
        {!connected && !connecting && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm bg-gray-50">
            Enter a URL and click Connect to start a session
          </div>
        )}
        {connecting && !connected && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm bg-gray-50">
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

      <div className="h-[100px] md:h-[200px] min-h-[100px] md:min-h-[200px] border-t border-gray-200 overflow-auto">
        <div className="p-4">
          <h3 className="text-base font-semibold text-gray-900 mb-2">
            History
          </h3>
          {history.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No history yet</p>
          ) : (
            <div className="space-y-1">
              {history.map((entry, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="text-gray-400 shrink-0 font-mono">{formatTime(entry.timestamp)}</span>
                  <span className={`shrink-0 font-semibold ${typeColors[entry.type]}`}>
                    {typeLabels[entry.type]}
                  </span>
                  <span className="text-gray-600 truncate">{entry.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
