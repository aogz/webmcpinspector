import { useState } from "react";
import { Download, Pencil, Play, Plus, Power, Trash2 } from "lucide-react";
import { formHtmlSnippet, registerToolSnippet, webfuseExtension } from "../app/exporters";
import { overridesFor, type SavedInjected } from "../app/storage";
import { store, useInspector } from "../app/store";
import { schemaProblems } from "../shared/jsonSchema";
import type { InjectedToolDef, JsonSchema, PageSnapshot, ToolAnnotations } from "../shared/types";
import { Badge, Button, CodeBlock, Field, Notice, SectionTitle } from "./ui";
import { cx, download, inputClass } from "./uiUtils";

const TEMPLATE = `// \`input\` holds the arguments; \`options.signal\` aborts when the call is cancelled.
// Return a string or a JSON-serializable value.
const heading = document.querySelector("h1");
return { title: heading ? heading.textContent.trim() : document.title };`;

const EMPTY_SCHEMA = `{
  "type": "object",
  "properties": {}
}`;

const ANNOTATIONS: { key: keyof ToolAnnotations; label: string }[] = [
  { key: "readOnlyHint", label: "readOnlyHint" },
  { key: "consequentialHint", label: "consequentialHint" },
  { key: "untrustedContentHint", label: "untrustedContentHint" },
  { key: "debugging", label: "debugging" },
];

function blank(): InjectedToolDef {
  return { id: `tool_${Date.now().toString(36)}`, name: "", title: "", description: "", code: TEMPLATE, annotations: { readOnlyHint: true } };
}

function parseJson(text: string): { value?: JsonSchema; error?: string } {
  if (!text.trim()) return {};
  try {
    const value = JSON.parse(text) as JsonSchema;
    const problems = schemaProblems(value);
    return problems.length ? { value, error: problems[0] } : { value };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Invalid JSON" };
  }
}

function ToolEditor({ initial, onDone }: { initial: InjectedToolDef; onDone: () => void }) {
  const [def, setDef] = useState(initial);
  const [input, setInput] = useState(initial.inputSchema ? JSON.stringify(initial.inputSchema, null, 2) : EMPTY_SCHEMA);
  const [output, setOutput] = useState(initial.outputSchema ? JSON.stringify(initial.outputSchema, null, 2) : "");
  const inputParsed = parseJson(input);
  const outputParsed = parseJson(output);
  const nameOk = /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(def.name);
  const ready = nameOk && def.description.trim() && !inputParsed.error && !outputParsed.error && def.code.trim();

  const submit = (enabled: boolean) => {
    store.saveInjectedTool({ ...def, inputSchema: inputParsed.value, outputSchema: outputParsed.value }, enabled);
    onDone();
  };

  return (
    <div className="space-y-2 px-3 pb-3">
      <Field label="Name" hint={def.name && !nameOk ? "Start with a letter; letters, digits, _ . - only." : undefined}>
        <input className={inputClass} value={def.name} placeholder="getPageTitle" onChange={(e) => setDef({ ...def, name: e.target.value })} />
      </Field>
      <Field label="Title (optional)">
        <input className={inputClass} value={def.title ?? ""} placeholder="Get page title" onChange={(e) => setDef({ ...def, title: e.target.value })} />
      </Field>
      <Field label="Description">
        <textarea rows={2} className={inputClass} value={def.description} onChange={(e) => setDef({ ...def, description: e.target.value })} />
      </Field>
      <Field label="Input schema" hint={inputParsed.error}>
        <textarea rows={5} className={cx(inputClass, "font-mono", inputParsed.error && "ring-2 ring-err")} value={input} onChange={(e) => setInput(e.target.value)} />
      </Field>
      <Field label="Output schema (optional)" hint={outputParsed.error}>
        <textarea rows={3} className={cx(inputClass, "font-mono", outputParsed.error && "ring-2 ring-err")} value={output} placeholder='{ "type": "object" }' onChange={(e) => setOutput(e.target.value)} />
      </Field>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {ANNOTATIONS.map((a) => (
          <label key={a.key} className="inline-flex items-center gap-1 text-[11px] text-fg">
            <input
              type="checkbox"
              checked={!!def.annotations?.[a.key]}
              onChange={(e) => setDef({ ...def, annotations: { ...def.annotations, [a.key]: e.target.checked || undefined } })}
            />
            <span className="font-mono">{a.label}</span>
          </label>
        ))}
      </div>
      <Field label="execute(input, options)">
        <textarea rows={8} spellCheck={false} className={cx(inputClass, "font-mono")} value={def.code} onChange={(e) => setDef({ ...def, code: e.target.value })} />
      </Field>
      <div className="flex gap-2">
        <Button variant="primary" disabled={!ready} onClick={() => submit(true)}>
          <Play className="h-3.5 w-3.5" /> Register on the page
        </Button>
        <Button disabled={!ready} onClick={() => submit(false)}>Save only</Button>
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
      <p className="text-[10px] text-faint">
        Runs inside the page through document.modelContext.registerTool(). Pages whose Content Security Policy forbids eval refuse it.
      </p>
    </div>
  );
}

function InjectedRow({ tool, onEdit }: { tool: SavedInjected; onEdit: () => void }) {
  const error = useInspector((s) => s.injectErrors[tool.id]);
  return (
    <div className="border-b border-line px-3 py-2 space-y-1">
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs font-semibold text-fg flex-1 truncate">{tool.name}</span>
        {tool.enabled ? <Badge tone="ok">on</Badge> : <Badge>off</Badge>}
        <Button variant="ghost" title={tool.enabled ? "Unregister" : "Register"} onClick={() => store.saveInjectedTool(tool, !tool.enabled)}>
          <Power className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" title="Edit" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button variant="danger" title="Delete" onClick={() => store.deleteInjectedTool(tool.id)}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      {error && <p className="text-[11px] text-err">{error}</p>}
    </div>
  );
}

export default function AuthorPanel({ snapshot }: { snapshot: PageSnapshot | null }) {
  const injected = useInspector((s) => s.injected);
  const [editing, setEditing] = useState<InjectedToolDef | null>(null);
  const [exportTool, setExportTool] = useState("");
  if (!snapshot) return <p className="p-4 text-xs text-muted">Open a page to add tools to it.</p>;

  const toolForms = snapshot.forms.filter((f) => f.toolname);
  const selectedTool = snapshot.tools.find((t) => t.name === exportTool) ?? snapshot.tools[0];
  const overrides = overridesFor(snapshot.url);
  const injectedById = new Map(injected.map((t) => [t.name, t]));

  return (
    <div>
      <SectionTitle
        right={
          !editing && (
            <Button variant="ghost" onClick={() => setEditing(blank())}>
              <Plus className="h-3.5 w-3.5" /> New script tool
            </Button>
          )
        }
      >
        Script tools
      </SectionTitle>
      {editing ? (
        <ToolEditor key={editing.id} initial={editing} onDone={() => setEditing(null)} />
      ) : injected.length ? (
        injected.map((t) => <InjectedRow key={t.id} tool={t} onEdit={() => setEditing(t)} />)
      ) : (
        <p className="px-3 pb-2 text-xs text-faint">
          Prototype a tool the site does not have yet. It is registered in the live page, so the sidebar, the prompt debugger and
          connected agents can call it.
        </p>
      )}

      <SectionTitle>Export</SectionTitle>
      <div className="space-y-3 px-3 pb-4">
        {toolForms.length > 0 && (
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-muted">Form markup for the site</p>
            {toolForms.map((f) => (
              <CodeBlock key={f.key} value={formHtmlSnippet(f)} maxHeight="10rem" />
            ))}
          </div>
        )}
        {snapshot.tools.length > 0 && selectedTool && (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <p className="text-[11px] font-medium text-muted flex-1">registerTool() code</p>
              <select className="rounded border border-line bg-panel px-1 py-0.5 text-[11px] text-fg" value={selectedTool.name} onChange={(e) => setExportTool(e.target.value)}>
                {snapshot.tools.map((t) => (
                  <option key={t.name}>{t.name}</option>
                ))}
              </select>
            </div>
            <CodeBlock value={registerToolSnippet(selectedTool, injectedById.get(selectedTool.name)?.code)} maxHeight="14rem" />
          </div>
        )}
        <div className="space-y-1">
          <p className="text-[11px] font-medium text-muted">Webfuse extension</p>
          <p className="text-[11px] text-faint">
            Applies your {overrides.length} form change{overrides.length === 1 ? "" : "s"} and {injected.filter((t) => t.enabled).length} script tool
            {injected.filter((t) => t.enabled).length === 1 ? "" : "s"} for every visitor of a Webfuse Space, without changing the site. Upload both files as an
            extension in Webfuse Studio.
          </p>
          {overrides.length + injected.length === 0 ? (
            <Notice>Make a form into a tool or add a script tool first.</Notice>
          ) : (
            <Button
              onClick={() => {
                const { content, manifest } = webfuseExtension(snapshot.url, overrides, injected.filter((t) => t.enabled));
                download("manifest.json", manifest, "application/json");
                window.setTimeout(() => download("content.js", content, "text/javascript"), 300);
              }}
            >
              <Download className="h-3.5 w-3.5" /> Download manifest.json and content.js
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
