import { useState } from "react";
import { Settings, Play } from "lucide-react";
import TabBar from "./TabBar";

interface SidebarProps {
  url: string;
  onUrlChange: (url: string) => void;
  onConnect: () => void;
  connected: boolean;
  connecting?: boolean;
}

export default function Sidebar({
  url,
  onUrlChange,
  onConnect,
  connected,
  connecting,
}: SidebarProps) {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <aside className="w-[300px] min-w-[300px] border-r border-gray-200 flex flex-col bg-white">
      <div className="flex items-center gap-2 px-4 py-4">
        <Settings className="w-5 h-5 text-gray-500" />
        <h1 className="text-lg font-semibold text-gray-900">MCP Inspector</h1>
      </div>

      <div className="px-4 space-y-4 flex-1">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            URL
          </label>
          <input
            type="text"
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !connecting) onConnect();
            }}
            placeholder="https://example.com"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <button
          onClick={onConnect}
          disabled={connecting}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Play className="w-4 h-4" />
          {connecting ? "Connecting..." : connected ? "Open Tab" : "Connect"}
        </button>

        {connected && (
          <div className="flex items-center gap-2 justify-center">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
            <span className="text-sm text-green-600">Connected</span>
          </div>
        )}
      </div>

      <div className="mt-auto">
        <TabBar
          tabs={["Declarative Tools", "Imperative Tools"]}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
        <div className="p-4 text-sm text-gray-400 italic">
          {activeTab === 0 ? "No declarative tools" : "No imperative tools"}
        </div>
      </div>
    </aside>
  );
}
