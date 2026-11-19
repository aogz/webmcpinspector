import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { copyText, cx } from "./uiUtils";

type Tone = "neutral" | "accent" | "ok" | "warn" | "err" | "info";

const TONES: Record<Tone, string> = {
  neutral: "bg-panel-2 text-muted",
  accent: "bg-accent-soft text-accent-text",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  err: "bg-err-soft text-err",
  info: "bg-info-soft text-info",
};

export function Badge({ tone = "neutral", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={cx("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none", TONES[tone])}>
      {children}
    </span>
  );
}

export function Button({
  children,
  onClick,
  variant = "secondary",
  disabled,
  title,
  type = "button",
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  title?: string;
  type?: "button" | "submit";
  className?: string;
}) {
  const styles = {
    primary: "bg-accent text-accent-fg hover:brightness-110",
    secondary: "bg-panel-2 text-fg hover:bg-line",
    ghost: "text-muted hover:text-fg hover:bg-panel-2",
    danger: "text-err hover:bg-err-soft",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
        styles[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function CopyButton({ text, label = "Copy", className }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="ghost"
      className={className}
      onClick={async () => {
        if (await copyText(text)) {
          setDone(true);
          window.setTimeout(() => setDone(false), 1400);
        }
      }}
    >
      {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {done ? "Copied" : label}
    </Button>
  );
}

export function CodeBlock({ value, maxHeight = "16rem", copy = true }: { value: unknown; maxHeight?: string; copy?: boolean }) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2) ?? "undefined";
  return (
    <div className="relative group">
      <pre
        className="overflow-auto rounded-md bg-code border border-line p-2 text-[11px] leading-relaxed font-mono text-fg whitespace-pre-wrap break-words"
        style={{ maxHeight }}
      >
        {text}
      </pre>
      {copy && (
        <div className="absolute right-1 top-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <CopyButton text={text} />
        </div>
      )}
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { id: T; label: ReactNode; count?: number }[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={cx("flex gap-0.5 overflow-x-auto", className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={tab.id === value}
          onClick={() => onChange(tab.id)}
          className={cx(
            "shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border-b-2 cursor-pointer transition-colors",
            tab.id === value ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg",
          )}
        >
          {tab.label}
          {tab.count !== undefined && tab.count > 0 && (
            <span className="rounded-full bg-panel-2 px-1.5 text-[10px] text-muted">{tab.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function Notice({ tone = "info", children, icon }: { tone?: Tone; children: ReactNode; icon?: ReactNode }) {
  return (
    <div className={cx("flex items-start gap-2 rounded-md px-3 py-2 text-xs leading-relaxed", TONES[tone])}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-1.5">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-faint">{children}</h3>
      {right}
    </div>
  );
}

export function Field({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="block text-[11px] font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="block text-[10px] text-faint">{hint}</span>}
    </label>
  );
}
