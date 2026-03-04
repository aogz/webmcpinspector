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
} from "lucide-react";
import TabBar from "./TabBar";
import type { FormTool, ImperativeTool, SchemaResponse } from "../types";

interface SidebarProps {
  url: string;
  onUrlChange: (url: string) => void;
  onConnect: () => void;
  connected: boolean;
  connecting?: boolean;
  forms: FormTool[];
  imperativeTools: ImperativeTool[];
  schemaResponse: SchemaResponse | null;
  sendToSession: (msg: Record<string, unknown>) => void;
}

export default function Sidebar({
  url,
  onUrlChange,
  onConnect,
  connected,
  connecting,
  forms,
  imperativeTools,
  schemaResponse,
  sendToSession,
}: SidebarProps) {
  const [activeTab, setActiveTab] = useState(0);

  const nativeCount = forms.filter((f) => f.hasWebMCP && !f.webfuseApplied).length;
  const webfuseCount = forms.filter((f) => f.webfuseApplied).length;

  return (
    <aside className="w-[340px] min-w-[340px] border-r border-gray-200 flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        <Settings className="w-5 h-5 text-gray-500" />
        <h1 className="text-lg font-semibold text-gray-900">MCP Inspector</h1>
      </div>

      {/* URL + Connect */}
      <div className="px-4 py-3 space-y-3 border-b border-gray-100">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            URL
          </label>
          <input
            type="text"
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !connecting) onConnect();
            }}
            placeholder="https://example.com"
            className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <button
          onClick={onConnect}
          disabled={connecting}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Play className="w-4 h-4" />
          {connecting ? "Connecting..." : connected ? "Open Tab" : "Connect"}
        </button>

        {connected && (
          <div className="flex items-center gap-2 justify-center">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-xs text-green-600">Connected</span>
          </div>
        )}
      </div>

      {/* Stats bar + Rescan */}
      {connected && (
        <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between">
          <div className="flex gap-3 text-xs text-gray-500">
            <span>
              <strong className="text-gray-700">{forms.length}</strong> forms
            </span>
            <span>
              <strong className="text-gray-700">{imperativeTools.length}</strong>{" "}
              imperative
            </span>
            {nativeCount > 0 && (
              <span className="text-green-600">{nativeCount} native</span>
            )}
            {webfuseCount > 0 && (
              <span className="text-blue-600">{webfuseCount} augmented</span>
            )}
          </div>
          <button
            onClick={() => sendToSession({ type: "webmcp:scan" })}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
            title="Rescan page"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Tab bar */}
      <TabBar
        tabs={["Declarative Tools", "Imperative Tools"]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Tool cards */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 0 ? (
          forms.length === 0 ? (
            <div className="p-4 text-sm text-gray-400 italic">
              {connected ? "No forms detected" : "No declarative tools"}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {forms.map((form) => (
                <FormCard
                  key={form.index}
                  form={form}
                  sendToSession={sendToSession}
                  schemaResponse={schemaResponse}
                />
              ))}
            </div>
          )
        ) : imperativeTools.length === 0 ? (
          <div className="p-4 text-sm text-gray-400 italic">
            {connected ? "No imperative tools detected" : "No imperative tools"}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {imperativeTools.map((tool) => (
              <ImperativeCard key={tool.name} tool={tool} />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

// ── Form Card ───────────────────────────────────────────────────────

function FormCard({
  form,
  sendToSession,
  schemaResponse,
}: {
  form: FormTool;
  sendToSession: (msg: Record<string, unknown>) => void;
  schemaResponse: SchemaResponse | null;
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
    // Send form-level attribute changes
    for (const [attrName, attrValue] of Object.entries(edits)) {
      sendToSession({
        type: "webmcp:set-form-attr",
        formIndex: form.index,
        attrName,
        attrValue,
        isWebfuseApplied: true,
      });
    }
    // Send input-level attribute changes
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
          {form.hasWebMCP && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700">
              MCP
            </span>
          )}
          {form.webfuseApplied && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
              WF
            </span>
          )}
          {!form.hasWebMCP && !form.webfuseApplied && (
            <button
              onClick={() => setExpanded(true)}
              className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors cursor-pointer"
              title="Configure WebMCP attributes for this form"
            >
              <Wrench className="w-3 h-3" /> Configure
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
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
                onClick={handleSave}
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
            WF
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

function ImperativeCard({ tool }: { tool: ImperativeTool }) {
  const [expanded, setExpanded] = useState(false);

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
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 shrink-0">
          JS
        </span>
      </button>
      {tool.description && (
        <div className="ml-5 text-[11px] text-gray-400 truncate">
          {tool.description}
        </div>
      )}
      {expanded && (
        <div className="mt-2 ml-5">
          {tool.description && (
            <p className="text-xs text-gray-600 mb-2">{tool.description}</p>
          )}
          <div className="text-[11px] font-medium text-gray-500 mb-1">
            Input Schema
          </div>
          <pre className="text-[10px] bg-gray-50 border border-gray-200 rounded p-2 overflow-x-auto max-h-48 overflow-y-auto">
            {JSON.stringify(tool.inputSchema, null, 2)}
          </pre>
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
