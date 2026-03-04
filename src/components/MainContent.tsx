interface MainContentProps {
  connected: boolean;
  connecting: boolean;
}

export default function MainContent({ connected, connecting }: MainContentProps) {
  return (
    <div className="flex-1 flex flex-col min-w-0 bg-gray-50">
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

      <div className="h-[200px] min-h-[200px] border-t border-gray-200 flex">
        <div className="flex-1 p-4 border-r border-gray-200 overflow-auto">
          <h3 className="text-base font-semibold text-gray-900 mb-2">
            History
          </h3>
          <p className="text-sm text-gray-400 italic">No history yet</p>
        </div>
        <div className="flex-1 p-4 overflow-auto">
          <h3 className="text-base font-semibold text-gray-900 mb-2">
            Server Notifications
          </h3>
          <p className="text-sm text-gray-400 italic">No notifications yet</p>
        </div>
      </div>
    </div>
  );
}
