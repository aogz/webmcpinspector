const STYLE_ID = "webmcp-inspector-style";
const BADGE_ID = "webmcp-inspector-badge";

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes webmcp-inspector-glow {
      0% { box-shadow: 0 0 0 0 rgba(59,130,246,0); }
      30% { box-shadow: 0 0 0 3px rgba(59,130,246,.45), 0 0 24px 4px rgba(99,160,255,.25); }
      100% { box-shadow: 0 0 0 0 rgba(59,130,246,0); }
    }
    .webmcp-inspector-glow { animation: webmcp-inspector-glow 1.6s ease-out 1; }
    @media (prefers-reduced-motion: reduce) {
      .webmcp-inspector-glow { animation: none; outline: 2px solid rgba(59,130,246,.6); outline-offset: 3px; }
    }`;
  document.head.appendChild(style);
}

/** Marks the page's tool forms without moving the page; the user may be in the middle of something. */
export function glowForms(toolCount: number) {
  ensureStyle();
  const forms = Array.from(document.querySelectorAll<HTMLFormElement>("form[toolname]"));
  for (const form of forms) {
    form.classList.remove("webmcp-inspector-glow");
    void form.offsetWidth;
    form.classList.add("webmcp-inspector-glow");
    window.setTimeout(() => form.classList.remove("webmcp-inspector-glow"), 1800);
  }
  document.getElementById(BADGE_ID)?.remove();
  const badge = document.createElement("div");
  badge.id = BADGE_ID;
  badge.setAttribute("role", "status");
  badge.textContent = `WebMCP: ${toolCount} tool${toolCount === 1 ? "" : "s"}`;
  badge.style.cssText =
    "position:fixed;top:12px;right:12px;z-index:2147483647;pointer-events:none;padding:6px 12px;border-radius:999px;" +
    "font:500 12px/1.4 system-ui,sans-serif;background:rgba(15,23,42,.85);color:#e2e8f0;" +
    "box-shadow:0 4px 16px rgba(0,0,0,.2);transition:opacity .4s ease;";
  document.documentElement.appendChild(badge);
  window.setTimeout(() => (badge.style.opacity = "0"), 2200);
  window.setTimeout(() => badge.remove(), 2700);
}

let current: { el: HTMLElement; outline: string; offset: string; timer: number } | null = null;

export function highlight(el: HTMLElement) {
  if (current) {
    clearTimeout(current.timer);
    current.el.style.outline = current.outline;
    current.el.style.outlineOffset = current.offset;
  }
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  const saved = { outline: el.style.outline, offset: el.style.outlineOffset };
  el.style.outline = "3px solid #3b82f6";
  el.style.outlineOffset = "4px";
  current = {
    el,
    ...saved,
    timer: window.setTimeout(() => {
      el.style.outline = saved.outline;
      el.style.outlineOffset = saved.offset;
      current = null;
    }, 2500),
  };
}
