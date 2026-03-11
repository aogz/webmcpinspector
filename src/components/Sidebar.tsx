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
} from "lucide-react";
import { track } from "../analytics";
import type { FormTool, ImperativeTool, SchemaResponse, SavedFormOverride, ToolExecutionResult } from "../types";

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
}: SidebarProps) {
  const [showHistory, setShowHistory] = useState(false);

  // Categorize forms
  const nativeMcpForms = forms.filter((f) => f.hasWebMCP && !f.webfuseApplied);
  const augmentedForms = forms.filter((f) => f.webfuseApplied);
  const plainForms = forms.filter((f) => !f.hasWebMCP && !f.webfuseApplied);

  const toolCount = nativeMcpForms.length + augmentedForms.length + imperativeTools.length;

  return (
    <aside className="h-[40vh] md:h-auto w-full md:w-[340px] md:min-w-[340px] border-b md:border-b-0 md:border-r border-gray-200 flex flex-col bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        <Settings className="w-5 h-5 text-gray-500" />
        <h1 className="text-lg font-semibold text-gray-900">WebMCP Inspector</h1>
      </div>

      {/* URL + Connect */}
      <div className="px-4 py-2 md:py-3 space-y-2 md:space-y-3 border-b border-gray-100">
        <div className="relative">
          <label className="block text-xs font-medium text-gray-500 mb-1">
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
              className="flex-1 min-w-0 px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <button
              onClick={onConnect}
              disabled={connecting}
              className="md:hidden shrink-0 flex items-center justify-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play className="w-4 h-4" />
              {connecting ? "..." : connected ? "Open" : "Go"}
            </button>
          </div>
          {showHistory && urlHistory.length > 0 && (
            <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
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
                    className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 truncate cursor-pointer"
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
          className="hidden md:flex w-full items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Play className="w-4 h-4" />
          {connecting ? "Connecting..." : connected ? "Open Tab" : "Connect"}
        </button>

        <div className="flex items-center gap-2 justify-center">
          <span className={`w-2 h-2 rounded-full ${
            connecting ? "bg-yellow-500 animate-pulse" : connected ? "bg-green-500" : "bg-gray-400"
          }`} />
          <span className={`text-xs ${
            connecting ? "text-yellow-600" : connected ? "text-green-600" : "text-gray-400"
          }`}>
            {connecting ? "Connecting" : connected ? "Connected" : "Disconnected"}
          </span>
        </div>
      </div>

      {/* Stats bar + Rescan */}
      {connected && (
        <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between">
          <div className="flex gap-3 text-xs text-gray-500">
            <span>
              <strong className="text-gray-700">{toolCount}</strong>{" "}
              {toolCount === 1 ? "tool" : "tools"}
            </span>
            {plainForms.length > 0 && (
              <span>
                <strong className="text-gray-700">{plainForms.length}</strong>{" "}
                {plainForms.length === 1 ? "form" : "forms"}
              </span>
            )}
          </div>
          <button
            onClick={() => { track("Rescan Page"); sendToSession({ type: "webmcp:scan" }); }}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 hover:text-gray-700 rounded-md transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            Rescan
          </button>
        </div>
      )}

      {/* Scrollable tool/form list */}
      <div className="flex-1 overflow-y-auto">
        {/* MCP Tools section */}
        {(nativeMcpForms.length > 0 || augmentedForms.length > 0 || imperativeTools.length > 0) && (
          <div>
            <SectionHeader
              icon={<Zap className="w-3.5 h-3.5" />}
              label="MCP Tools"
              count={toolCount}
              color="text-green-700"
              bgColor="bg-green-50"
            />

            {/* Native MCP form tools */}
            {nativeMcpForms.map((form) => (
              <FormCard
                key={`native-${form.index}`}
                form={form}
                badge={{ label: "Native", color: "bg-green-100 text-green-700" }}
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
                badge={{ label: "Augmented", color: "bg-blue-100 text-blue-700" }}
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
          </div>
        )}

        {/* Detected Forms section (not yet tools) */}
        {plainForms.length > 0 && (
          <div>
            <SectionHeader
              icon={<FileText className="w-3.5 h-3.5" />}
              label="Detected Forms"
              count={plainForms.length}
              color="text-gray-600"
              bgColor="bg-gray-50"
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
          <div className="p-4 text-sm text-gray-400 italic">
            {connected ? "No forms or tools detected on this page" : "Connect to a URL to discover tools"}
          </div>
        )}
      </div>

      {/* Powered by Webfuse */}
      <div className="hidden md:flex px-4 py-3 border-t border-gray-100 items-center justify-center gap-2">
        <span className="text-sm text-gray-400">Powered by</span>
        <a href="https://www.webfuse.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5">
          <span className="text-base font-semibold text-gray-900" style={{ fontFamily: "'Manrope', sans-serif" }}>Webfuse</span>
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
    <div className={`flex items-center gap-2 px-4 py-1.5 ${bgColor} border-b border-gray-100 sticky top-0 z-10`}>
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
            <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          )}
          <span className="text-sm font-medium text-gray-800 truncate flex-1">
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
              className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 hover:bg-red-100 transition-colors cursor-pointer"
              title="Remove augmented attributes and restore original form"
            >
              <Undo2 className="w-3 h-3" /> Reset
            </button>
          )}
          {isPlainForm && (
            <button
              onClick={() => { track("Configure Form", { tool: form.toolname || form.formId }); setExpanded(true); }}
              className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors cursor-pointer"
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
            className="p-1 text-gray-400 hover:text-blue-600 transition-colors cursor-pointer"
            title="Locate form on page"
          >
            <Crosshair className="w-3.5 h-3.5" />
          </button>
        </span>
      </div>

      {/* Subtitle */}
      <div className="ml-5 text-[11px] text-gray-400">
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
                  ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              <FileJson className="w-3 h-3" /> Schema
            </button>
            {hasPendingEdits && (
              <button
                onClick={() => { track("Save Overrides", { tool: form.toolname || form.formId }); handleSave(); }}
                className="flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors cursor-pointer"
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
              <div className="text-[11px] font-medium text-gray-500 mb-1">
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
              <div className="text-[11px] font-medium text-gray-500 mb-1">
                Generated Schema
              </div>
              <pre className="text-[10px] bg-gray-50 border border-gray-200 rounded p-2 overflow-x-auto max-h-48 overflow-y-auto">
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
    <div className="border border-gray-100 rounded p-1.5">
      <button
        className="flex items-center gap-1 w-full text-left cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="w-3 h-3 text-gray-400 shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-gray-400 shrink-0" />
        )}
        <span className="text-[11px] font-medium text-gray-700 truncate flex-1">
          {displayName}
        </span>
        <span className="text-[10px] text-gray-400 shrink-0">
          {input.tag}
          {input.type !== input.tag ? `[${input.type}]` : ""}
        </span>
        {input.webfuseApplied && (
          <span className="text-[10px] px-1 py-0.5 rounded bg-blue-100 text-blue-700 shrink-0">
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
          <div className="text-[10px] text-gray-400">
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
          <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        )}
        <span className="text-sm font-medium text-gray-800 truncate flex-1">
          {tool.name}
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium shrink-0">
          <span className="inline-flex items-center gap-0.5">
            <Code2 className="w-3 h-3" /> Imperative
          </span>
        </span>
      </button>
      {tool.description && (
        <div className="ml-5 text-[11px] text-gray-400 truncate">
          {tool.description}
        </div>
      )}
      {expanded && (
        <div className="mt-2 ml-5 space-y-2">
          {tool.description && (
            <p className="text-xs text-gray-600">{tool.description}</p>
          )}

          {/* Parameter inputs */}
          {paramNames.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-medium text-gray-500">
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
                    <label className="flex items-center gap-1 text-[10px] text-gray-400 mb-0.5">
                      {paramName}
                      <span className="text-gray-300">({propType})</span>
                      {isRequired && <span className="text-red-400">*</span>}
                    </label>
                    {enumValues ? (
                      <select
                        value={argValues[paramName] ?? ""}
                        onChange={(e) =>
                          setArgValues((prev) => ({ ...prev, [paramName]: e.target.value }))
                        }
                        className="w-full px-2 py-1 text-[11px] border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-400 focus:border-purple-400 bg-white"
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
                        className="w-full px-2 py-1 text-[11px] border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-400 focus:border-purple-400 bg-white"
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
                        className="w-full px-2 py-1 text-[11px] border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-400 focus:border-purple-400"
                      />
                    )}
                    {description && (
                      <div className="text-[10px] text-gray-400 mt-0.5">{description}</div>
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
              className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded bg-purple-600 text-white hover:bg-purple-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play className="w-3 h-3" />
              {executionResult?.pending ? "Running..." : "Execute"}
            </button>
            <button
              onClick={() => setShowSchema(!showSchema)}
              className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded transition-colors cursor-pointer ${
                showSchema
                  ? "bg-purple-100 text-purple-700 hover:bg-purple-200"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              <FileJson className="w-3 h-3" /> Schema
            </button>
          </div>

          {/* Execution result */}
          {executionResult && !executionResult.pending && (
            <div className="mt-1">
              <div className={`text-[11px] font-medium mb-0.5 ${
                executionResult.error ? "text-red-600" : "text-green-600"
              }`}>
                {executionResult.error ? "Error" : "Result"}
              </div>
              <pre className={`text-[10px] border rounded p-2 overflow-x-auto max-h-48 overflow-y-auto ${
                executionResult.error
                  ? "bg-red-50 border-red-200 text-red-700"
                  : "bg-green-50 border-green-200 text-green-800"
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
              <div className="text-[11px] font-medium text-gray-500 mb-1">
                Input Schema
              </div>
              <pre className="text-[10px] bg-gray-50 border border-gray-200 rounded p-2 overflow-x-auto max-h-48 overflow-y-auto">
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
      <label className="block text-[10px] text-gray-400 mb-0.5">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? label}
        className="w-full px-2 py-1 text-[11px] border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
      />
    </div>
  );
}
