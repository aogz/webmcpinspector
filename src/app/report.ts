import { store } from "./store";

export function bugReport(): string {
  const s = store.getState();
  const lines = [
    "## WebMCP Inspector report",
    "",
    `- Page: ${s.snapshot?.url ?? "(none)"}`,
    `- WebMCP API: ${s.snapshot?.runtime.api ?? "?"} (${s.snapshot?.runtime.implementation ?? "?"})`,
    `- Browser: ${navigator.userAgent}`,
    `- Tools: ${s.snapshot?.tools.map((t) => t.name).join(", ") || "none"}`,
    "",
    "### Last calls",
    ...s.calls.slice(0, 5).map((c) => `- \`${c.toolName}\` ${JSON.stringify(c.args)} → ${c.outcome ? (c.outcome.ok ? "ok" : `error: ${c.outcome.error}`) : "pending"}`),
    "",
    "### Recent activity",
    ...s.activity.slice(0, 15).map((a) => `- ${new Date(a.at).toISOString()} [${a.kind}] ${a.message}`),
  ];
  return lines.join("\n");
}
