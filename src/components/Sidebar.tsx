import { useState } from "react";
import {
  Settings,
  Play,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Crosshair,
  FileJson,
  Save,
  Wrench,
  Undo2,
  Zap,
  Code2,
  FileText,
  AlertTriangle,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import PromptPanel from "./PromptPanel";
import { track } from "../analytics";
import type { FormTool, ImperativeTool, SchemaResponse, SavedFormOverride, ToolExecutionResult } from "../types";

function getChromeVersion(): number | null {
  const match = navigator.userAgent.match(/Chrome\/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

const chromeVersion = getChromeVersion();
const supportsImperative = chromeVersion !== null && chromeVersion >= 146;

interface SidebarProps {
  url: string;
  urlHistory: string[];
  onUrlChange: (url: string) => void;
  onConnect: () => void;
  connected: boolean;
  connecting?: boolean;
  forms: FormTool[];
  imperativeTools: ImperativeTool[];
  schemaResponse: SchemaResponse | null;
  sendToSession: (msg: Record<string, unknown>) => void;
  onSaveOverrides: (override: SavedFormOverride) => void;
  onClearOverrides: (form: FormTool) => void;
  onExecuteTool: (toolName: string, args: Record<string, unknown>) => void;
  executionResults: Record<string, ToolExecutionResult>;
  executeToolAsync: (toolName: string, args: Record<string, unknown>) => Promise<unknown>;
  isOpen: boolean;
  onToggle: () => void;
}

export default function Sidebar({
  url,
  urlHistory,
  onUrlChange,
  onConnect,
  connected,
  connecting,
  forms,
  imperativeTools,
  schemaResponse,
  sendToSession,
  onSaveOverrides,
  onClearOverrides,
  onExecuteTool,
  executionResults,
  executeToolAsync,
  isOpen,
  onToggle,
}: SidebarProps) {
  const [showHistory, setShowHistory] = useState(false);

  // Categorize forms
  const nativeMcpForms = forms.filter((f) => f.hasWebMCP && !f.webfuseApplied);
  const augmentedForms = forms.filter((f) => f.webfuseApplied);
  const plainForms = forms.filter((f) => !f.hasWebMCP && !f.webfuseApplied);

  const toolCount = nativeMcpForms.length + augmentedForms.length + imperativeTools.length;

  // Collapsed sidebar (desktop only)
  if (!isOpen) {
    return (
      <aside className="hidden md:flex w-12 min-w-12 border-r border-[#1e1e2e] flex-col items-center bg-[#0a0a0f] py-3 gap-3">
        <button
          onClick={onToggle}
          className="p-2 text-[#6b6b80] hover:text-white transition-colors cursor-pointer"
          title="Open sidebar"
        >
          <PanelLeftOpen className="w-5 h-5" />
        </button>
        <div className="w-6 h-px bg-[#1e1e2e]" />
        <Settings className="w-4 h-4 text-[#6b6b80]" />
      </aside>
    );
  }

  return (
    <aside className="h-[40vh] md:h-auto w-full md:w-[340px] md:min-w-[340px] border-b md:border-b-0 md:border-r border-[#1e1e2e] flex flex-col bg-[#0a0a0f] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#1e1e2e]">
        <Settings className="w-5 h-5 text-[#9a9ab0]" />
        <h1 className="text-lg font-semibold text-white flex-1">WebMCP Inspector</h1>
        <button
          onClick={onToggle}
          className="hidden md:block p-1 text-[#6b6b80] hover:text-white transition-colors cursor-pointer"
          title="Collapse sidebar"
        >
          <PanelLeftClose className="w-4 h-4" />
        </button>
      </div>

      {/* URL + Connect */}
      <div className="px-4 py-2 md:py-3 space-y-2 md:space-y-3 border-b border-[#1e1e2e]">
        <div className="relative">
          <label className="block text-xs font-medium text-[#9a9ab0] mb-1">
            URL
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={url}
              onChange={(e) => onUrlChange(e.target.value)}
              onFocus={() => urlHistory.length > 0 && setShowHistory(true)}
              onBlur={() => setTimeout(() => setShowHistory(false), 150)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !connecting) {
                  setShowHistory(false);
                  onConnect();
                }
                if (e.key === "Escape") setShowHistory(false);
              }}
              placeholder="https://example.com"
              className="flex-1 min-w-0 px-3 py-1.5 bg-[#12121a] border border-[#1e1e2e] rounded-md text-sm text-[#e2e2e8] placeholder-[#6b6b80] focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:border-[#2563eb]"
            />
            <button
              onClick={onConnect}
              disabled={connecting}
              className="md:hidden shrink-0 flex items-center justify-center gap-1 px-3 py-1.5 bg-[#2563eb] text-white rounded-md text-sm font-medium hover:bg-[#1d4ed8] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play className="w-4 h-4" />
              {connecting ? "..." : connected ? "Open" : "Go"}
            </button>
          </div>
          {showHistory && urlHistory.length > 0 && (
            <div className="absolute z-10 left-0 right-0 mt-1 bg-[#12121a] border border-[#1e1e2e] rounded-md shadow-lg max-h-48 overflow-y-auto">
              {urlHistory
                .filter((u) => u.toLowerCase().includes(url.toLowerCase()))
                .map((historyUrl) => (
                  <button
                    key={historyUrl}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onUrlChange(historyUrl);
                      setShowHistory(false);
                    }}
                    className="w-full text-left px-3 py-1.5 text-sm text-[#9a9ab0] hover:bg-[#1e1e2e] hover:text-[#60a5fa] truncate cursor-pointer"
                  >
                    {historyUrl}
                  </button>
                ))}
            </div>
          )}
        </div>

        <button
          onClick={onConnect}
          disabled={connecting}
          className="hidden md:flex w-full items-center justify-center gap-2 px-4 py-2 bg-[#2563eb] text-white rounded-md text-sm font-medium hover:bg-[#1d4ed8] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Play className="w-4 h-4" />
          {connecting ? "Connecting..." : connected ? "Open Tab" : "Connect"}
        </button>

        <div className="flex items-center gap-2 justify-center">
          <span className={`w-2 h-2 rounded-full ${
            connecting ? "bg-yellow-500 animate-pulse" : connected ? "bg-green-500" : "bg-[#6b6b80]"
          }`} />
          <span className={`text-xs ${
            connecting ? "text-yellow-500" : connected ? "text-green-400" : "text-[#6b6b80]"
          }`}>
            {connecting ? "Connecting" : connected ? "Connected" : "Disconnected"}
          </span>
        </div>
      </div>

      {/* Stats bar + Rescan */}
      {connected && (
        <div className="px-4 py-2 border-b border-[#1e1e2e] flex items-center justify-between">
          <div className="flex gap-3 text-xs text-[#6b6b80]">
            <span>
              <strong className="text-[#e2e2e8]">{toolCount}</strong>{" "}
              {toolCount === 1 ? "tool" : "tools"}
            </span>
            {plainForms.length > 0 && (
              <span>
                <strong className="text-[#e2e2e8]">{plainForms.length}</strong>{" "}
                {plainForms.length === 1 ? "form" : "forms"}
              </span>
            )}
          </div>
          <button
            onClick={() => { track("Rescan Page"); sendToSession({ type: "webmcp:scan" }); }}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#9a9ab0] bg-[#12121a] hover:bg-[#1e1e2e] hover:text-white rounded-md transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            Rescan
          </button>
        </div>
      )}

      {/* Scrollable tool/form list */}
      <div className="flex-1 overflow-y-auto">
        {/* WebMCP Tools section */}
        {(nativeMcpForms.length > 0 || augmentedForms.length > 0 || imperativeTools.length > 0) && (
          <div>
            <SectionHeader
              icon={<Zap className="w-3.5 h-3.5" />}
              label="WebMCP Tools"
              count={toolCount}
              color="text-green-400"
              bgColor="bg-[#0d1a0f]"
            />

            {/* Native MCP form tools */}
            {nativeMcpForms.map((form) => (
              <FormCard
                key={`native-${form.index}`}
                form={form}
                badge={{ label: "Native", color: "bg-[#1a3a2a] text-[#4ade80]" }}
                sendToSession={sendToSession}
                schemaResponse={schemaResponse}
                onSaveOverrides={onSaveOverrides}
                onClearOverrides={onClearOverrides}
              />
            ))}

            {/* Augmented form tools */}
            {augmentedForms.map((form) => (
              <FormCard
                key={`augmented-${form.index}`}
                form={form}
                badge={{ label: "Augmented", color: "bg-[#1e3a5f] text-[#60a5fa]" }}
                sendToSession={sendToSession}
                schemaResponse={schemaResponse}
                onSaveOverrides={onSaveOverrides}
                onClearOverrides={onClearOverrides}
              />
            ))}

            {/* Imperative tools */}
            {imperativeTools.map((tool) => (
              <ImperativeCard
                key={tool.name}
                tool={tool}
                onExecute={onExecuteTool}
                executionResult={executionResults[tool.name] ?? null}
              />
            ))}
            {!supportsImperative && imperativeTools.length === 0 && (
              <div className="mx-3 mb-2 flex items-start gap-1.5 text-[11px] text-amber-400 bg-amber-950/40 rounded-md px-2.5 py-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>Imperative tools require Chrome 146+.{chromeVersion !== null ? ` You have Chrome ${chromeVersion}.` : ""}</span>
              </div>
            )}
          </div>
        )}

        {/* Detected Forms section (not yet tools) */}
        {plainForms.length > 0 && (
          <div>
            <SectionHeader
              icon={<FileText className="w-3.5 h-3.5" />}
              label="Detected Forms"
              count={plainForms.length}
              color="text-[#9a9ab0]"
              bgColor="bg-[#12121a]"
            />
            {plainForms.map((form) => (
              <FormCard
                key={`plain-${form.index}`}
                form={form}
                badge={null}
                sendToSession={sendToSession}
                schemaResponse={schemaResponse}
                onSaveOverrides={onSaveOverrides}
                onClearOverrides={onClearOverrides}
              />
            ))}
          </div>
        )}

        {/* Empty states */}
        {forms.length === 0 && imperativeTools.length === 0 && (
          <div className="p-4 text-sm text-[#6b6b80] italic">
            {connected ? "No forms or tools detected on this page" : "Connect to a URL to discover tools"}
          </div>
        )}
      </div>

      {/* Prompt Debugger panel */}
      {connected && (
        <PromptPanel
          forms={forms}
          imperativeTools={imperativeTools}
          executeToolAsync={executeToolAsync}
        />
      )}

      {/* Powered by Webfuse */}
      <div className="hidden md:flex px-4 py-3 border-t border-[#1e1e2e] items-center justify-center gap-2">
        <span className="text-sm text-[#6b6b80]">Powered by</span>
        <a href="https://www.webfuse.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5">
          <span className="text-base font-semibold text-white" style={{ fontFamily: "'Manrope', sans-serif" }}>Webfuse</span>
          <img src="https://www.webfuse.com/logo.svg" alt="Webfuse" className="h-5" />
        </a>
      </div>
    </aside>
  );
}

// ── Section Header ──────────────────────────────────────────────────

function SectionHeader({
  icon,
  label,
  count,
  color,
  bgColor,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  color: string;
  bgColor: string;
}) {
  return (
    <div className={`flex items-center gap-2 px-4 py-1.5 ${bgColor} border-b border-[#1e1e2e] sticky top-0 z-10`}>
      <span className={color}>{icon}</span>
      <span className={`text-xs font-semibold ${color} uppercase tracking-wide`}>
        {label}
      </span>
      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${bgColor} ${color} font-medium`}>
        {count}
      </span>
    </div>
  );
}

// ── Form Card ───────────────────────────────────────────────────────

function FormCard({
  form,
  badge,
  sendToSession,
  schemaResponse,
  onSaveOverrides,
  onClearOverrides,
}: {
  form: FormTool;
  badge: { label: string; color: string } | null;
  sendToSession: (msg: Record<string, unknown>) => void;
  schemaResponse: SchemaResponse | null;
  onSaveOverrides: (override: SavedFormOverride) => void;
  onClearOverrides: (form: FormTool) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showSchema, setShowSchema] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [inputEdits, setInputEdits] = useState<
    Record<string, Record<string, string>>
  >({});

  const formVal = (key: string) =>
    edits[key] ?? (form as unknown as Record<string, string>)[key] ?? "";

  const inputVal = (inputIdx: number, key: string) =>
    inputEdits[inputIdx]?.[key] ??
    (form.inputs[inputIdx] as unknown as Record<string, string>)[key] ??
    "";

  const setFormEdit = (key: string, value: string) =>
    setEdits((prev) => ({ ...prev, [key]: value }));

  const setInputEdit = (inputIdx: number, key: string, value: string) =>
    setInputEdits((prev) => ({
      ...prev,
      [inputIdx]: { ...prev[inputIdx], [key]: value },
    }));

  const handleSave = () => {
    for (const [attrName, attrValue] of Object.entries(edits)) {
      sendToSession({
        type: "webmcp:set-form-attr",
        formIndex: form.index,
        attrName,
        attrValue,
        isWebfuseApplied: true,
      });
    }
    for (const [inputIdx, attrs] of Object.entries(inputEdits)) {
      for (const [attrName, attrValue] of Object.entries(attrs)) {
        sendToSession({
          type: "webmcp:set-input-attr",
          formIndex: form.index,
          inputIndex: Number(inputIdx),
          attrName,
          attrValue,
          isWebfuseApplied: true,
        });
      }
    }
    const mergedAttrs: Record<string, string> = {};
    for (const key of ["toolname", "tooldescription", "toolautosubmit"] as const) {
      const val = edits[key] ?? (form as unknown as Record<string, string>)[key] ?? "";
      if (val) mergedAttrs[key] = val;
    }

    const mergedInputs: Record<string, Record<string, string>> = {};
    for (const input of form.inputs) {
      const inputKey = input.name || input.id || `__idx_${input.index}`;
      const merged: Record<string, string> = {};
      for (const key of ["toolparamtitle", "toolparamdescription"] as const) {
        const val =
          inputEdits[input.index]?.[key] ??
          (input as unknown as Record<string, string>)[key] ??
          "";
        if (val) merged[key] = val;
      }
      if (Object.keys(merged).length) mergedInputs[inputKey] = merged;
    }

    onSaveOverrides({
      formId: form.formId,
      attributes: mergedAttrs,
      inputs: mergedInputs,
    });

    setEdits({});
    setInputEdits({});
  };

  const hasPendingEdits =
    Object.entries(edits).some(
      ([key, val]) =>
        val !== ((form as unknown as Record<string, string>)[key] ?? "")
    ) ||
    Object.entries(inputEdits).some(([idx, attrs]) =>
      Object.entries(attrs).some(
        ([key, val]) =>
          val !==
          ((form.inputs[Number(idx)] as unknown as Record<string, string>)[
            key
          ] ?? "")
      )
    );

  const schema =
    schemaResponse?.formIndex === form.index ? schemaResponse.schema : null;

  const isPlainForm = !form.hasWebMCP && !form.webfuseApplied;

  return (
    <div className="px-3 py-2">
      {/* Card header row */}
      <div className="flex items-center gap-1.5">
        <button
          className="flex items-center gap-1.5 flex-1 min-w-0 text-left cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-[#6b6b80] shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-[#6b6b80] shrink-0" />
          )}
          <span className="text-sm font-medium text-[#e2e2e8] truncate flex-1">
            {form.toolname || form.formId}
          </span>
        </button>
        <span className="flex items-center gap-1 shrink-0">
          {badge && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${badge.color}`}>
              {badge.label}
            </span>
          )}
          {form.webfuseApplied && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                track("Reset Form", { tool: form.toolname || form.formId });
                onClearOverrides(form);
              }}
              className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-red-950/40 text-red-400 hover:bg-red-900/50 transition-colors cursor-pointer"
              title="Remove augmented attributes and restore original form"
            >
              <Undo2 className="w-3 h-3" /> Reset
            </button>
          )}
          {isPlainForm && (
            <button
              onClick={() => { track("Configure Form", { tool: form.toolname || form.formId }); setExpanded(true); }}
              className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-950/40 text-amber-400 hover:bg-amber-900/50 transition-colors cursor-pointer"
              title="Add WebMCP attributes to expose this form as a tool"
            >
              <Wrench className="w-3 h-3" /> Make Tool
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              track("Highlight Form", { tool: form.toolname || form.formId });
              sendToSession({
                type: "webmcp:highlight",
                formIndex: form.index,
              });
            }}
            className="p-1 text-[#6b6b80] hover:text-[#60a5fa] transition-colors cursor-pointer"
            title="Locate form on page"
          >
            <Crosshair className="w-3.5 h-3.5" />
          </button>
        </span>
      </div>

      {/* Subtitle */}
      <div className="ml-5 text-[11px] text-[#6b6b80]">
        {form.method} {form.action || "/"} &middot; {form.inputCount} fields
      </div>

      {expanded && (
        <div className="mt-2 ml-5 space-y-2">
          {/* Action buttons */}
          <div className="flex gap-1.5">
            <button
              onClick={() => {
                if (showSchema) {
                  setShowSchema(false);
                } else {
                  track("View Schema", { tool: form.toolname || form.formId });
                  sendToSession({
                    type: "webmcp:get-schema",
                    formIndex: form.index,
                  });
                  setShowSchema(true);
                }
              }}
              className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded transition-colors cursor-pointer ${
                showSchema
                  ? "bg-[#1e3a5f] text-[#60a5fa] hover:bg-[#254a75]"
                  : "bg-[#12121a] text-[#9a9ab0] hover:bg-[#1e1e2e]"
              }`}
            >
              <FileJson className="w-3 h-3" /> Schema
            </button>
            {hasPendingEdits && (
              <button
                onClick={() => { track("Save Overrides", { tool: form.toolname || form.formId }); handleSave(); }}
                className="flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-[#2563eb] text-white hover:bg-[#1d4ed8] transition-colors cursor-pointer"
              >
                <Save className="w-3 h-3" /> Save
              </button>
            )}
          </div>

          {/* Form attributes */}
          <AttrField
            label="toolname"
            value={formVal("toolname")}
            onChange={(v) => setFormEdit("toolname", v)}
          />
          <AttrField
            label="tooldescription"
            value={formVal("tooldescription")}
            onChange={(v) => setFormEdit("tooldescription", v)}
          />
          <AttrField
            label="toolautosubmit"
            value={formVal("toolautosubmit")}
            onChange={(v) => setFormEdit("toolautosubmit", v)}
            placeholder="true / false"
          />

          {/* Input fields */}
          {form.inputs.length > 0 && (
            <div className="mt-2">
              <div className="text-[11px] font-medium text-[#9a9ab0] mb-1">
                Fields
              </div>
              <div className="space-y-2">
                {form.inputs.map((input) => (
                  <InputCard
                    key={input.index}
                    input={input}
                    getValue={(key) => inputVal(input.index, key)}
                    onChange={(key, val) =>
                      setInputEdit(input.index, key, val)
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {/* Schema display */}
          {showSchema && schema && (
            <div className="mt-2">
              <div className="text-[11px] font-medium text-[#9a9ab0] mb-1">
                Generated Schema
              </div>
              <pre className="text-[10px] bg-[#12121a] border border-[#1e1e2e] rounded p-2 overflow-x-auto max-h-48 overflow-y-auto text-[#e2e2e8]">
                {JSON.stringify(schema, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Input Card ──────────────────────────────────────────────────────

function InputCard({
  input,
  getValue,
  onChange,
}: {
  input: FormTool["inputs"][number];
  getValue: (key: string) => string;
  onChange: (key: string, val: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const displayName = input.name || input.id || input.label || `Field ${input.index}`;

  return (
    <div className="border border-[#1e1e2e] rounded p-1.5">
      <button
        className="flex items-center gap-1 w-full text-left cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="w-3 h-3 text-[#6b6b80] shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-[#6b6b80] shrink-0" />
        )}
        <span className="text-[11px] font-medium text-[#e2e2e8] truncate flex-1">
          {displayName}
        </span>
        <span className="text-[10px] text-[#6b6b80] shrink-0">
          {input.tag}
          {input.type !== input.tag ? `[${input.type}]` : ""}
        </span>
        {input.webfuseApplied && (
          <span className="text-[10px] px-1 py-0.5 rounded bg-[#1e3a5f] text-[#60a5fa] shrink-0">
            Augmented
          </span>
        )}
      </button>
      {expanded && (
        <div className="mt-1.5 ml-4 space-y-1.5">
          <AttrField
            label="toolparamtitle"
            value={getValue("toolparamtitle")}
            onChange={(v) => onChange("toolparamtitle", v)}
          />
          <AttrField
            label="toolparamdescription"
            value={getValue("toolparamdescription")}
            onChange={(v) => onChange("toolparamdescription", v)}
          />
          <div className="text-[10px] text-[#6b6b80]">
            {input.required && <span className="text-red-400">required</span>}
            {input.label && <span> &middot; label: {input.label}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Imperative Tool Card ────────────────────────────────────────────

function getSchemaProperties(
  inputSchema: Record<string, unknown>
): Record<string, Record<string, unknown>> {
  const props = inputSchema?.properties;
  if (props && typeof props === "object") return props as Record<string, Record<string, unknown>>;
  return {};
}

function getSchemaRequired(inputSchema: Record<string, unknown>): string[] {
  const req = inputSchema?.required;
  if (Array.isArray(req)) return req as string[];
  return [];
}

function ImperativeCard({
  tool,
  onExecute,
  executionResult,
}: {
  tool: ImperativeTool;
  onExecute: (toolName: string, args: Record<string, unknown>) => void;
  executionResult: ToolExecutionResult | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showSchema, setShowSchema] = useState(false);
  const [argValues, setArgValues] = useState<Record<string, string>>({});

  const properties = getSchemaProperties(tool.inputSchema);
  const requiredFields = getSchemaRequired(tool.inputSchema);
  const paramNames = Object.keys(properties);

  const handleExecute = () => {
    const args: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(argValues)) {
      if (!val) continue;
      const prop = properties[key];
      const propType = prop?.type;
      if (propType === "number" || propType === "integer") {
        args[key] = Number(val);
      } else if (propType === "boolean") {
        args[key] = val === "true";
      } else {
        args[key] = val;
      }
    }
    onExecute(tool.name, args);
  };

  return (
    <div className="px-3 py-2">
      <button
        className="flex items-center gap-1.5 w-full text-left cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-[#6b6b80] shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-[#6b6b80] shrink-0" />
        )}
        <span className="text-sm font-medium text-[#e2e2e8] truncate flex-1">
          {tool.name}
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#3b1f5e] text-[#a78bfa] font-medium shrink-0">
          <span className="inline-flex items-center gap-0.5">
            <Code2 className="w-3 h-3" /> Imperative
          </span>
        </span>
      </button>
      {tool.description && (
        <div className="ml-5 text-[11px] text-[#6b6b80] truncate">
          {tool.description}
        </div>
      )}
      {expanded && (
        <div className="mt-2 ml-5 space-y-2">
          {tool.description && (
            <p className="text-xs text-[#9a9ab0]">{tool.description}</p>
          )}

          {/* Parameter inputs */}
          {paramNames.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-medium text-[#9a9ab0]">
                Parameters
              </div>
              {paramNames.map((paramName) => {
                const prop = properties[paramName];
                const isRequired = requiredFields.includes(paramName);
                const propType = (prop?.type as string) || "string";
                const description = prop?.description as string | undefined;
                const enumValues = prop?.enum as string[] | undefined;

                return (
                  <div key={paramName}>
                    <label className="flex items-center gap-1 text-[10px] text-[#6b6b80] mb-0.5">
                      {paramName}
                      <span className="text-[#4a4a5a]">({propType})</span>
                      {isRequired && <span className="text-red-400">*</span>}
                    </label>
                    {enumValues ? (
                      <select
                        value={argValues[paramName] ?? ""}
                        onChange={(e) =>
                          setArgValues((prev) => ({ ...prev, [paramName]: e.target.value }))
                        }
                        className="w-full px-2 py-1 text-[11px] bg-[#12121a] border border-[#1e1e2e] rounded text-[#e2e2e8] focus:outline-none focus:ring-1 focus:ring-[#a78bfa] focus:border-[#a78bfa]"
                      >
                        <option value="">-- select --</option>
                        {enumValues.map((v) => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                    ) : propType === "boolean" ? (
                      <select
                        value={argValues[paramName] ?? ""}
                        onChange={(e) =>
                          setArgValues((prev) => ({ ...prev, [paramName]: e.target.value }))
                        }
                        className="w-full px-2 py-1 text-[11px] bg-[#12121a] border border-[#1e1e2e] rounded text-[#e2e2e8] focus:outline-none focus:ring-1 focus:ring-[#a78bfa] focus:border-[#a78bfa]"
                      >
                        <option value="">-- select --</option>
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </select>
                    ) : (
                      <input
                        type={propType === "number" || propType === "integer" ? "number" : "text"}
                        value={argValues[paramName] ?? ""}
                        onChange={(e) =>
                          setArgValues((prev) => ({ ...prev, [paramName]: e.target.value }))
                        }
                        placeholder={description || paramName}
                        className="w-full px-2 py-1 text-[11px] bg-[#12121a] border border-[#1e1e2e] rounded text-[#e2e2e8] placeholder-[#6b6b80] focus:outline-none focus:ring-1 focus:ring-[#a78bfa] focus:border-[#a78bfa]"
                      />
                    )}
                    {description && (
                      <div className="text-[10px] text-[#6b6b80] mt-0.5">{description}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Execute button */}
          <div className="flex gap-1.5">
            <button
              onClick={handleExecute}
              disabled={executionResult?.pending}
              className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded bg-[#7c3aed] text-white hover:bg-[#6d28d9] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play className="w-3 h-3" />
              {executionResult?.pending ? "Running..." : "Execute"}
            </button>
            <button
              onClick={() => setShowSchema(!showSchema)}
              className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded transition-colors cursor-pointer ${
                showSchema
                  ? "bg-[#3b1f5e] text-[#a78bfa] hover:bg-[#4c2a7a]"
                  : "bg-[#12121a] text-[#9a9ab0] hover:bg-[#1e1e2e]"
              }`}
            >
              <FileJson className="w-3 h-3" /> Schema
            </button>
          </div>

          {/* Execution result */}
          {executionResult && !executionResult.pending && (
            <div className="mt-1">
              <div className={`text-[11px] font-medium mb-0.5 ${
                executionResult.error ? "text-red-400" : "text-green-400"
              }`}>
                {executionResult.error ? "Error" : "Result"}
              </div>
              <pre className={`text-[10px] border rounded p-2 overflow-x-auto max-h-48 overflow-y-auto ${
                executionResult.error
                  ? "bg-red-950/30 border-red-900/50 text-red-300"
                  : "bg-green-950/30 border-green-900/50 text-green-300"
              }`}>
                {executionResult.error
                  ? executionResult.error
                  : JSON.stringify(executionResult.result, null, 2) ?? "undefined"}
              </pre>
            </div>
          )}

          {/* Schema display */}
          {showSchema && (
            <div>
              <div className="text-[11px] font-medium text-[#9a9ab0] mb-1">
                Input Schema
              </div>
              <pre className="text-[10px] bg-[#12121a] border border-[#1e1e2e] rounded p-2 overflow-x-auto max-h-48 overflow-y-auto text-[#e2e2e8]">
                {JSON.stringify(tool.inputSchema, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Shared Attribute Field ──────────────────────────────────────────

function AttrField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-[10px] text-[#6b6b80] mb-0.5">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? label}
        className="w-full px-2 py-1 text-[11px] bg-[#12121a] border border-[#1e1e2e] rounded text-[#e2e2e8] placeholder-[#6b6b80] focus:outline-none focus:ring-1 focus:ring-[#60a5fa] focus:border-[#60a5fa]"
      />
    </div>
  );
}
