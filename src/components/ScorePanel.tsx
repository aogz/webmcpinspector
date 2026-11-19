import { useMemo } from "react";
import { AlertCircle, AlertTriangle, Info } from "lucide-react";
import { lintSnapshot, type Finding, type Report } from "../shared/lint";
import type { PageSnapshot } from "../shared/types";
import { REPO_URL } from "../config";
import { CopyButton, SectionTitle } from "./ui";
import { cx } from "./uiUtils";

const ICONS = {
  error: <AlertCircle className="h-3.5 w-3.5 text-err" />,
  warning: <AlertTriangle className="h-3.5 w-3.5 text-warn" />,
  info: <Info className="h-3.5 w-3.5 text-info" />,
};

const GRADE_TONE: Record<Report["grade"], string> = {
  A: "text-ok border-ok",
  B: "text-ok border-ok",
  C: "text-warn border-warn",
  D: "text-warn border-warn",
  F: "text-err border-err",
};

function reportMarkdown(report: Report, snapshot: PageSnapshot): string {
  const lines = [
    `## WebMCP score: ${report.grade} (${report.score}/100)`,
    "",
    `Page: ${snapshot.url}`,
    `Tools: ${report.toolCount} · Forms that could become tools: ${report.candidateForms}`,
    "",
    ...report.findings.map(
      (f) => `- **${f.severity}** ${f.tool ? `\`${f.tool}\` ` : ""}${f.message}${f.fix ? ` _${f.fix}_` : ""}`,
    ),
    "",
    `Checked with [WebMCP Inspector](${REPO_URL}).`,
  ];
  return lines.join("\n");
}

function badgeSvg(report: Report): string {
  const color = report.score >= 75 ? "#16a34a" : report.score >= 40 ? "#d97706" : "#dc2626";
  const right = `${report.grade} · ${report.score}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="20" role="img" aria-label="WebMCP ready: ${right}"><rect width="90" height="20" fill="#24292f"/><rect x="90" width="60" height="20" fill="${color}"/><g fill="#fff" font-family="Verdana,sans-serif" font-size="11" text-anchor="middle"><text x="45" y="14">WebMCP ready</text><text x="120" y="14">${right}</text></g></svg>`;
}

function FindingRow({ finding }: { finding: Finding }) {
  return (
    <li className="flex gap-2 px-3 py-1.5 border-b border-line">
      <span className="mt-0.5 shrink-0">{ICONS[finding.severity]}</span>
      <div className="min-w-0 text-xs">
        {finding.tool && <span className="mr-1 font-mono font-semibold text-fg">{finding.tool}</span>}
        <span className="text-muted">{finding.message}</span>
        {finding.fix && <p className="mt-0.5 text-[11px] text-faint">{finding.fix}</p>}
        <p className="mt-0.5 text-[10px] text-faint font-mono">{finding.rule}</p>
      </div>
    </li>
  );
}

export default function ScorePanel({ snapshot }: { snapshot: PageSnapshot | null }) {
  const report = useMemo(() => lintSnapshot(snapshot), [snapshot]);
  if (!snapshot) return <p className="p-4 text-xs text-muted">Open a page to check how ready it is for agents.</p>;
  const counts = {
    error: report.findings.filter((f) => f.severity === "error").length,
    warning: report.findings.filter((f) => f.severity === "warning").length,
    info: report.findings.filter((f) => f.severity === "info").length,
  };
  const svg = badgeSvg(report);
  return (
    <div>
      <div className="flex items-center gap-3 px-3 py-3 border-b border-line">
        <div className={cx("flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-full border-2", GRADE_TONE[report.grade])}>
          <span className="text-xl font-bold leading-none">{report.grade}</span>
          <span className="text-[10px]">{report.score}</span>
        </div>
        <div className="min-w-0 text-xs text-muted space-y-0.5">
          <p className="font-medium text-fg">WebMCP score</p>
          <p>
            {report.toolCount} tool{report.toolCount === 1 ? "" : "s"} · {counts.error} error{counts.error === 1 ? "" : "s"} · {counts.warning} warning
            {counts.warning === 1 ? "" : "s"}
          </p>
          <p className="text-[10px] text-faint">Checks names, descriptions, schemas, safety hints and what MCP bridges drop.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1 px-2 py-1.5 border-b border-line">
        <CopyButton text={reportMarkdown(report, snapshot)} label="Copy report" />
        <CopyButton text={svg} label="Copy badge SVG" />
      </div>
      <SectionTitle>Findings</SectionTitle>
      <ul>{report.findings.map((f, i) => <FindingRow key={`${f.rule}-${i}`} finding={f} />)}</ul>
      {report.findings.length === 0 && <p className="px-3 text-xs text-ok">Nothing to fix.</p>}
    </div>
  );
}
