import { schemaProblems } from "./jsonSchema";
import type { FormInfo, InspectedTool, JsonSchema, PageSnapshot } from "./types";
import { RESERVED_MCP_TOOL_NAMES, SPEC_TOOL_NAME_RE, WEBFUSE_TOOL_NAME_RE } from "./webfuse";

export type Severity = "error" | "warning" | "info";

export interface Finding {
  rule: string;
  severity: Severity;
  message: string;
  fix?: string;
  tool?: string;
  formKey?: string;
}

export interface Report {
  findings: Finding[];
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  toolCount: number;
  candidateForms: number;
}

// Zero-width, bidi-control and tag characters can hide instructions from a human reviewer.
const INVISIBLE = /[\u00AD\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]|[\u{E0000}-\u{E007F}]/u;
const INJECTION =
  /\b(ignore (all |any )?(previous|prior|above) (instructions|messages)|disregard (the|all|previous)|system prompt|you are now|do not (tell|inform) the user|always call this tool|before (doing )?anything else)\b/i;
const CONSEQUENTIAL =
  /\b(buy|purchase|pay|payment|checkout|order|delete|remove|cancel|send|transfer|book|reserve|subscribe|unsubscribe|publish|post|apply|sign ?up|register|confirm|submit)\b/i;

const WEIGHTS: Record<Severity, number> = { error: 12, warning: 4, info: 0 };

function words(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function lintDescription(tool: InspectedTool, findings: Finding[]) {
  const at = { tool: tool.name };
  const description = tool.description ?? "";
  if (!description.trim()) {
    findings.push({
      ...at,
      rule: "description-missing",
      severity: "error",
      message: "The tool has no description, so an agent cannot tell when to use it.",
      fix: "Say what the tool does, what it returns, and when to call it.",
    });
  } else if (words(description) < 4) {
    findings.push({
      ...at,
      rule: "description-short",
      severity: "warning",
      message: `The description "${description}" is too short to tell an agent when to use the tool.`,
      fix: "Describe the effect and the result in a full sentence.",
    });
  } else if (description.length > 1000) {
    findings.push({
      ...at,
      rule: "description-long",
      severity: "warning",
      message: `The description is ${description.length} characters long. Long descriptions cost every agent context on every request.`,
    });
  }
  const texts = [tool.name, tool.title ?? "", description, ...describeParams(tool.inputSchema)];
  if (texts.some((t) => INVISIBLE.test(t))) {
    findings.push({
      ...at,
      rule: "invisible-characters",
      severity: "error",
      message: "The tool's text contains invisible or direction-changing Unicode characters.",
      fix: "Remove them. They can hide instructions from people reviewing the tool (webmcp#360).",
    });
  }
  if (texts.some((t) => INJECTION.test(t))) {
    findings.push({
      ...at,
      rule: "instruction-like-text",
      severity: "warning",
      message: "The tool's text reads like instructions to the agent rather than a description.",
      fix: "Describe the tool. Agents treat page-supplied text as untrusted and may refuse the tool.",
    });
  }
}

function describeParams(schema: JsonSchema | undefined): string[] {
  if (!schema?.properties) return [];
  return Object.entries(schema.properties).flatMap(([key, child]) => [
    key,
    typeof child?.description === "string" ? child.description : "",
    ...describeParams(child),
  ]);
}

function lintName(tool: InspectedTool, findings: Finding[]) {
  const at = { tool: tool.name };
  if (!SPEC_TOOL_NAME_RE.test(tool.name)) {
    findings.push({
      ...at,
      rule: "name-invalid",
      severity: "error",
      message: `"${tool.name}" is not a valid WebMCP tool name.`,
      fix: "Use 1 to 128 letters, digits, underscores, dots or dashes.",
    });
  } else if (!WEBFUSE_TOOL_NAME_RE.test(tool.name)) {
    findings.push({
      ...at,
      rule: "name-leading-letter",
      severity: "warning",
      message: `"${tool.name}" does not start with a letter, so MCP bridges such as Webfuse drop it.`,
    });
  }
  if (RESERVED_MCP_TOOL_NAMES.has(tool.name)) {
    findings.push({
      ...at,
      rule: "name-reserved",
      severity: "error",
      message: `"${tool.name}" is a built-in Webfuse automation tool, so agents connected through Webfuse never see this one.`,
      fix: "Rename the tool.",
    });
  }
}

function lintSchema(tool: InspectedTool, findings: Finding[]) {
  const at = { tool: tool.name };
  const schema = tool.inputSchema;
  if (!schema) {
    findings.push({
      ...at,
      rule: "schema-missing",
      severity: "info",
      message: "No input schema. That is fine for a tool without parameters.",
    });
    return;
  }
  if (schema.type !== undefined && schema.type !== "object") {
    findings.push({
      ...at,
      rule: "schema-not-object",
      severity: "error",
      message: `The input schema's top-level type is "${String(schema.type)}". MCP requires an object, so bridges reject the tool.`,
    });
  }
  for (const problem of schemaProblems(schema)) {
    findings.push({ ...at, rule: "schema-invalid", severity: "error", message: `Input schema: ${problem}.` });
  }
  const undocumented = Object.entries(schema.properties ?? {})
    .filter(([, child]) => !child?.description)
    .map(([key]) => key);
  if (undocumented.length) {
    findings.push({
      ...at,
      rule: "param-undocumented",
      severity: "warning",
      message: `Parameter${undocumented.length > 1 ? "s" : ""} without a description: ${undocumented.join(", ")}.`,
      fix: "Describe each parameter's meaning and format.",
    });
  }
  const untyped = Object.entries(schema.properties ?? {})
    .filter(([, child]) => child && child.type === undefined && !child.enum && !child.anyOf && !child.oneOf)
    .map(([key]) => key);
  if (untyped.length) {
    findings.push({
      ...at,
      rule: "param-untyped",
      severity: "warning",
      message: `Parameter${untyped.length > 1 ? "s" : ""} without a type: ${untyped.join(", ")}.`,
    });
  }
  const nullable = JSON.stringify(schema).match(/"type":\[[^\]]*"null"[^\]]*\]/g);
  if (nullable) {
    findings.push({
      ...at,
      rule: "schema-nullable-union",
      severity: "info",
      message: 'The schema uses "null" in type unions. Some MCP clients reject those, so Webfuse strips them.',
    });
  }
  if (!tool.outputSchema) {
    findings.push({
      ...at,
      rule: "output-schema-missing",
      severity: "info",
      message: "No output schema. Adding one lets agents rely on the result's shape.",
    });
  } else {
    for (const problem of schemaProblems(tool.outputSchema)) {
      findings.push({ ...at, rule: "output-schema-invalid", severity: "error", message: `Output schema: ${problem}.` });
    }
  }
}

function lintAnnotations(tool: InspectedTool, form: FormInfo | undefined, findings: Finding[]) {
  const at = { tool: tool.name };
  const text = `${tool.name} ${tool.title ?? ""} ${tool.description}`.replace(/([a-z])([A-Z])/g, "$1 $2");
  const looksConsequential = CONSEQUENTIAL.test(text) || form?.method === "POST";
  const ann = tool.annotations;
  if (looksConsequential && !ann.consequentialHint && !ann.readOnlyHint && tool.source !== "declarative") {
    findings.push({
      ...at,
      rule: "consequential-hint",
      severity: "warning",
      message: "The tool looks like it changes something for the user, but has no consequentialHint.",
      fix: "Set annotations.consequentialHint: true so agents ask the user before calling it.",
    });
  }
  if (ann.readOnlyHint && ann.consequentialHint) {
    findings.push({
      ...at,
      rule: "readonly-consequential",
      severity: "error",
      message: "readOnlyHint and consequentialHint are both set; a read-only tool has no consequences.",
    });
  } else if (ann.readOnlyHint && looksConsequential) {
    findings.push({
      ...at,
      rule: "readonly-suspicious",
      severity: "warning",
      message: "readOnlyHint is set, but the name or description suggests the tool changes something.",
    });
  }
  if (ann.debugging) {
    findings.push({
      ...at,
      rule: "debugging-tool",
      severity: "info",
      message: "Marked as a debugging tool. Agents may hide it from end users.",
    });
  }
  if (tool.legacyApi) {
    findings.push({
      ...at,
      rule: "legacy-navigator-api",
      severity: "warning",
      message: "Registered through navigator.modelContext, which moved to document.modelContext in May 2026.",
      fix: "Call document.modelContext.registerTool(). Keep a fallback only while you support older browsers.",
    });
  }
}

function lintForm(form: FormInfo, findings: Finding[]) {
  const at = { formKey: form.key, tool: form.toolname || undefined };
  if (!form.toolname) return;
  if (!form.tooldescription.trim()) {
    findings.push({
      ...at,
      rule: "form-description-missing",
      severity: "error",
      message: `Form "${form.label}" has a toolname but no tooldescription.`,
    });
  }
  const unnamed = form.fields.filter((f) => !f.name);
  if (unnamed.length) {
    findings.push({
      ...at,
      rule: "field-unnamed",
      severity: "warning",
      message: `${unnamed.length} field${unnamed.length > 1 ? "s have" : " has"} no name attribute, so ${unnamed.length > 1 ? "they are" : "it is"} left out of the tool.`,
      fix: "Give every field the agent should fill a name.",
    });
  }
  const undescribed = form.fields.filter(
    (f) => f.name && !f.toolparamdescription && !f.label && !f.ariaDescription,
  );
  if (undescribed.length) {
    findings.push({
      ...at,
      rule: "field-undescribed",
      severity: "warning",
      message: `No toolparamdescription, label or aria-description on: ${undescribed.map((f) => f.name).join(", ")}.`,
    });
  }
  const radios = form.fields.filter((f) => f.type === "radio" && !f.toolparamdescription);
  if (radios.length) {
    findings.push({
      ...at,
      rule: "radio-undescribed",
      severity: "warning",
      message: `Radio group${radios.length > 1 ? "s" : ""} ${radios.map((f) => f.name).join(", ")} ${radios.length > 1 ? "have" : "has"} no toolparamdescription. Browsers cannot take one from a label for a group (webmcp#362).`,
      fix: "Put toolparamdescription on the first radio button of the group.",
    });
  }
  const legacy = form.fields.filter((f) => f.toolparamtitle);
  if (legacy.length) {
    findings.push({
      ...at,
      rule: "toolparamtitle",
      severity: "warning",
      message: `toolparamtitle is not part of WebMCP and is ignored (on ${legacy.map((f) => f.name || f.key).join(", ")}).`,
      fix: "The parameter name comes from the field's name attribute. Remove toolparamtitle.",
    });
  }
  if (!form.hasSubmitButton) {
    findings.push({
      ...at,
      rule: "form-no-submit",
      severity: "info",
      message: "The form has no submit button. Agents can still submit it, but users cannot review and confirm.",
    });
  }
  if (form.toolautosubmit && form.method === "POST") {
    findings.push({
      ...at,
      rule: "autosubmit-post",
      severity: "warning",
      message: "toolautosubmit is set on a POST form, so an agent can submit it without the user reviewing it.",
      fix: "Remove toolautosubmit unless the submission is harmless to repeat.",
    });
  }
  if (!form.registered) {
    findings.push({
      ...at,
      rule: "form-not-registered",
      severity: "info",
      message: "The browser does not list this form as a tool. The schema shown is the inspector's estimate.",
    });
  }
}

export function lintSnapshot(snapshot: PageSnapshot | null): Report {
  const findings: Finding[] = [];
  if (!snapshot) return { findings, score: 0, grade: "F", toolCount: 0, candidateForms: 0 };

  const formsByKey = new Map(snapshot.forms.map((f) => [f.key, f]));
  const seen = new Map<string, InspectedTool>();
  for (const tool of snapshot.tools) {
    const previous = seen.get(tool.name);
    if (previous) {
      findings.push({
        tool: tool.name,
        rule: "name-duplicate",
        severity: previous.source !== tool.source ? "warning" : "error",
        message:
          previous.source !== tool.source
            ? `"${tool.name}" is declared by both a script and a form. The script's tool wins and the form is ignored.`
            : `Two tools are named "${tool.name}".`,
      });
    }
    seen.set(tool.name, tool);
    lintName(tool, findings);
    lintDescription(tool, findings);
    lintSchema(tool, findings);
    lintAnnotations(tool, tool.formKey ? formsByKey.get(tool.formKey) : undefined, findings);
  }
  for (const form of snapshot.forms) lintForm(form, findings);

  const candidateForms = snapshot.forms.filter((f) => !f.toolname && f.fields.length > 0).length;
  if (candidateForms) {
    findings.push({
      rule: "forms-not-exposed",
      severity: "info",
      message: `${candidateForms} form${candidateForms > 1 ? "s are" : " is"} not exposed as a tool. Add toolname and tooldescription to let agents use ${candidateForms > 1 ? "them" : "it"}.`,
    });
  }
  const closedFrames = snapshot.frames.filter((f) => f.crossOrigin && !f.allowTools);
  if (closedFrames.length) {
    findings.push({
      rule: "frame-tools-blocked",
      severity: "info",
      message: `${closedFrames.length} cross-origin iframe${closedFrames.length > 1 ? "s" : ""} without allow="tools". Their tools stay private to the frame.`,
    });
  }
  if (snapshot.runtime.toolsAllowed === false) {
    findings.push({
      rule: "tools-policy-blocked",
      severity: "info",
      message: "The tools permissions policy is off in this frame, so script tools could not register. The score covers forms only.",
    });
  }
  if (snapshot.runtime.api === "none") {
    findings.push({
      rule: "no-runtime",
      severity: "info",
      message: "No WebMCP API in this page. Imperative tools cannot be listed.",
    });
  }

  const toolCount = snapshot.tools.length;
  if (toolCount === 0) {
    findings.unshift({
      rule: "no-tools",
      severity: "error",
      message: "The page exposes no WebMCP tools.",
      fix: "Annotate a form, or call document.modelContext.registerTool().",
    });
  }
  const penalty = findings.reduce((sum, f) => sum + WEIGHTS[f.severity], 0);
  const score = toolCount === 0 ? 0 : Math.max(0, 100 - penalty);
  const grade = score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F";
  const order: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  return { findings, score, grade, toolCount, candidateForms };
}
