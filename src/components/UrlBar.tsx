import { useState, type RefObject } from "react";
import { Globe, Play } from "lucide-react";
import { pageKey } from "../app/storage";
import { store, useInspector } from "../app/store";
import { cx, inputClass } from "./uiUtils";

export default function UrlBar({ inputRef }: { inputRef: RefObject<HTMLInputElement | null> }) {
  const url = useInspector((s) => s.targetUrl);
  const error = useInspector((s) => s.error);
  const status = useInspector((s) => s.status);
  const history = useInspector((s) => s.urlHistory);
  const titles = useInspector((s) => s.titles);
  const currentUrl = useInspector((s) => s.snapshot?.url ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const q = url.toLowerCase();
  const suggestions = history.filter((u) => u.toLowerCase().includes(q) || (titles[pageKey(u)] ?? "").toLowerCase().includes(q)).slice(0, 8);
  const connecting = status === "connecting";
  const live = status === "live";

  const go = () => {
    setOpen(false);
    void store.connect();
  };

  return (
    <div className="space-y-1.5 border-b border-line px-3 py-2">
      <div className="relative flex gap-1.5">
        <div className="relative flex-1">
          <Globe className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
          <input
            ref={inputRef}
            type="url"
            inputMode="url"
            aria-label="Page URL"
            aria-autocomplete="list"
            aria-expanded={open && suggestions.length > 0}
            className={cx(inputClass, "pl-7", error && "ring-2 ring-err")}
            placeholder="https://example.com"
            value={url}
            onChange={(e) => {
              store.setTargetUrl(e.target.value);
              setOpen(true);
              setActive(-1);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => window.setTimeout(() => setOpen(false), 120)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, suggestions.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, -1));
              } else if (e.key === "Enter" && !connecting) {
                if (active >= 0 && suggestions[active]) store.setTargetUrl(suggestions[active]);
                go();
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
          />
          {open && suggestions.length > 0 && (
            <ul role="listbox" className="absolute left-0 right-0 z-30 mt-1 max-h-56 overflow-auto rounded-md border border-line bg-panel shadow-lg">
              {suggestions.map((u, i) => {
                const title = titles[pageKey(u)];
                return (
                  <li key={u} role="option" aria-selected={i === active}>
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        store.setTargetUrl(u);
                        go();
                      }}
                      className={cx("block w-full px-2.5 py-1.5 text-left text-xs cursor-pointer", i === active ? "bg-accent-soft" : "hover:bg-panel-2")}
                    >
                      {title && <span className="block truncate text-fg">{title}</span>}
                      <span className="block truncate text-faint">{u}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <button
          onClick={go}
          disabled={connecting}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:brightness-110 disabled:opacity-50 cursor-pointer"
        >
          <Play className="h-3.5 w-3.5" />
          {connecting ? "Starting…" : live ? "Open" : "Inspect"}
        </button>
      </div>
      {error && <p className="text-[11px] text-err">{error}</p>}
      <div className="flex items-center gap-1.5 text-[10px] text-faint">
        <span className={cx("h-1.5 w-1.5 rounded-full", live ? "bg-ok" : connecting ? "bg-warn animate-pulse" : status === "error" ? "bg-err" : "bg-faint")} />
        <span className="truncate">
          {live ? (currentUrl ? `Inspecting ${currentUrl}` : "Session running") : connecting ? "Starting a Webfuse session" : status === "ended" ? "Session ended" : "Not connected"}
        </span>
      </div>
    </div>
  );
}
