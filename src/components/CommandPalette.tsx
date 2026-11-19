import { useEffect, useRef, useState } from "react";
import { Command } from "lucide-react";
import { cx } from "./uiUtils";

export interface PaletteAction {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

export default function CommandPalette({ open, onClose, actions }: { open: boolean; onClose: () => void; actions: PaletteAction[] }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  if (!open) return null;
  const q = query.toLowerCase();
  const shown = actions.filter((a) => a.label.toLowerCase().includes(q));
  const choose = (action: PaletteAction | undefined) => {
    if (!action) return;
    onClose();
    setQuery("");
    action.run();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-scrim p-4 pt-[15vh]" onClick={onClose}>
      <div role="dialog" aria-label="Command palette" className="w-full max-w-md overflow-hidden rounded-xl border border-line bg-panel shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Command className="h-4 w-4 text-faint" />
          <input
            ref={inputRef}
            className="w-full bg-transparent py-2.5 text-sm text-fg placeholder:text-faint focus:outline-none"
            placeholder="Type a command or a tool name"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, shown.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter") {
                choose(shown[active]);
              } else if (e.key === "Escape") {
                onClose();
              }
            }}
          />
        </div>
        <ul className="max-h-72 overflow-auto py-1">
          {shown.map((a, i) => (
            <li key={a.id}>
              <button
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(a)}
                className={cx("flex w-full items-center justify-between px-3 py-1.5 text-left text-sm cursor-pointer", i === active ? "bg-accent-soft text-fg" : "text-muted")}
              >
                {a.label}
                {a.hint && <kbd className="text-[10px] text-faint">{a.hint}</kbd>}
              </button>
            </li>
          ))}
          {shown.length === 0 && <li className="px-3 py-2 text-xs text-faint">No matches.</li>}
        </ul>
      </div>
    </div>
  );
}
