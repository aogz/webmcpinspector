import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Code2,
  Crosshair,
  FileText,
  Play,
  RefreshCw,
  Search,
  Square,
  Wand2,
  X,
} from "lucide-react";
import { DEFAULT_TIMEOUT_MS, store, useInspector } from "../app/store";
import { validate } from "../shared/jsonSchema";
import type { FormAttrUpdate, FormInfo, InspectedTool, PageSnapshot, RuntimeInfo } from "../shared/types";
import ArgEditor from "./ArgEditor";
import ResultView from "./ResultView";
import { Badge, Button, CodeBlock, Field, Notice, SectionTitle, Tabs } from "./ui";
import { inputClass } from "./uiUtils";

const SOURCE_LABEL: Record<InspectedTool["source"], string> = {
  imperative: "Script",
  declarative: "Form",
  injected: "Added here",
};

export function AnnotationBadges({ tool }: { tool: InspectedTool }) {
  const a = tool.annotations;
  return (
    <>
      {a.readOnlyHint && <Badge tone="ok" title="readOnlyHint: the tool does not change anything">read-only</Badge>}
      {a.consequentialHint && (
        <Badge tone="warn" title="consequentialHint: agents should confirm with the user before calling it">
          consequential
        </Badge>
      )}
      {a.untrustedContentHint && (
        <Badge tone="info" title="untrustedContentHint: the result may contain untrusted content">untrusted output</Badge>
      )}
      {a.debugging && <Badge title="debugging: meant for developers">debugging</Badge>}
    </>
  );
}

function ToolCard({ tool }: { tool: InspectedTool }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"run" | "input" | "output" | "raw">("run");
  const [args, setArgs] = useState<Record<string, unknown>>({});
  const [timeout, setTimeoutMs] = useState(DEFAULT_TIMEOUT_MS);
  const calls = useInspector((s) => s.calls);
  const lastCall = calls.find((c) => c.toolName === tool.name);
  const errors = useMemo(() => validate(args, tool.inputSchema), [args, tool.inputSchema]);

  return (
    <div className="border-b border-line">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-panel-2 cursor-pointer"
      >
        {open ? <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-faint" /> : <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-faint" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-xs font-semibold text-fg break-all">{tool.name}</span>
            <Badge tone={tool.source === "declarative" ? "accent" : tool.source === "injected" ? "info" : "neutral"}>
              {SOURCE_LABEL[tool.source]}
            </Badge>
            <AnnotationBadges tool={tool} />
            {tool.legacyApi && <Badge tone="warn" title="Registered on navigator.modelContext">legacy API</Badge>}
            {lastCall && !lastCall.pending && (
              <span className={`h-1.5 w-1.5 rounded-full ${lastCall.outcome?.ok ? "bg-ok" : "bg-err"}`} />
            )}
          </div>
          {tool.title && <div className="text-xs text-fg mt-0.5">{tool.title}</div>}
          <p className="mt-0.5 text-[11px] text-muted line-clamp-2">{tool.description || <em>No description</em>}</p>
        </div>
      </button>
      {open && (
        <div className="space-y-2 px-3 pb-3">
          <Tabs
            value={view}
            onChange={setView}
            tabs={[
              { id: "run", label: "Run" },
              { id: "input", label: "Input schema" },
              { id: "output", label: "Output schema" },
              { id: "raw", label: "Details" },
            ]}
          />
          {view === "run" && (
            <div className="space-y-2">
              {tool.annotations.consequentialHint && (
                <Notice tone="warn" icon={<AlertTriangle className="h-3.5 w-3.5" />}>
                  This tool says it has consequences. Running it here acts on the real site.
                </Notice>
              )}
              <ArgEditor schema={tool.inputSchema} value={args} onChange={setArgs} errors={errors} idPrefix={`arg-${tool.name}`} />
              <div className="flex items-center gap-2">
                {lastCall?.pending ? (
                  <Button variant="danger" onClick={() => store.cancel(lastCall.requestId)}>
                    <Square className="h-3.5 w-3.5" /> Cancel
                  </Button>
                ) : (
                  <Button variant="primary" onClick={() => void store.execute(tool.name, args, { timeoutMs: timeout })}>
                    <Play className="h-3.5 w-3.5" /> Run
                  </Button>
                )}
                {tool.formKey && (
                  <Button variant="ghost" onClick={() => store.highlight(tool.formKey!)} title="Show the form on the page">
                    <Crosshair className="h-3.5 w-3.5" /> Locate
                  </Button>
                )}
                <label className="ml-auto flex items-center gap-1 text-[10px] text-faint">
                  Timeout
                  <select
                    className="rounded border border-line bg-panel px-1 py-0.5 text-[10px] text-fg"
                    value={timeout}
                    onChange={(e) => setTimeoutMs(Number(e.target.value))}
                  >
                    {[5, 15, 30, 60, 120].map((s) => (
                      <option key={s} value={s * 1000}>
                        {s}s
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {lastCall && <ResultView call={lastCall} />}
            </div>
          )}
          {view === "input" &&
            (tool.inputSchema ? (
              <>
                {tool.schemaOrigin === "inspector" && (
                  <p className="text-[10px] text-warn">The browser does not list this form, so this is the inspector's estimate.</p>
                )}
                <CodeBlock value={tool.inputSchema} />
              </>
            ) : (
              <p className="text-xs text-faint">No input schema.</p>
            ))}
          {view === "output" &&
            (tool.outputSchema ? <CodeBlock value={tool.outputSchema} /> : <p className="text-xs text-faint">No output schema. Results are not checked.</p>)}
          {view === "raw" && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
              <dt className="text-faint">Source</dt>
              <dd className="text-fg">{SOURCE_LABEL[tool.source]}</dd>
              <dt className="text-faint">Schema from</dt>
              <dd className="text-fg">{tool.schemaOrigin === "registry" ? "the browser's tool registry" : "the inspector's reading of the form"}</dd>
              <dt className="text-faint">Exposed to</dt>
              <dd className="text-fg">{tool.exposedTo?.length ? tool.exposedTo.join(", ") : "this origin only"}</dd>
              <dt className="text-faint">Annotations</dt>
              <dd className="font-mono text-fg">{JSON.stringify(tool.annotations)}</dd>
            </dl>
          )}
        </div>
      )}
    </div>
  );
}

function FormCard({ form }: { form: FormInfo }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => ({
    toolname: form.toolname,
    tooldescription: form.tooldescription,
    toolautosubmit: form.toolautosubmit,
    fields: Object.fromEntries(form.fields.map((f) => [f.name || f.id, f.toolparamdescription])),
  }));
  const isTool = !!form.toolname;
  const nameError = draft.toolname && !/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(draft.toolname)
    ? "Start with a letter; use letters, digits, _ . or - (max 128)."
    : "";

  const save = () => {
    const update: FormAttrUpdate = {
      formKey: form.key,
      form: {
        toolname: draft.toolname || null,
        tooldescription: draft.tooldescription || null,
        toolautosubmit: draft.toolautosubmit ? "true" : null,
      },
      fields: Object.fromEntries(
        Object.entries(draft.fields).map(([key, value]) => [key, { toolparamdescription: value || null }]),
      ),
    };
    store.saveFormEdit(form, update);
  };

  return (
    <div className="border-b border-line">
      <div className="flex items-start gap-2 px-3 py-2">
        <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex-1 min-w-0 flex items-start gap-2 text-left cursor-pointer">
          {open ? <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-faint" /> : <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-faint" />}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-faint" />
              <span className="text-xs font-medium text-fg truncate">{form.label}</span>
              <Badge>{form.method}</Badge>
              {isTool && <Badge tone="accent">{form.augmented ? "Augmented" : "Tool"}</Badge>}
            </div>
            <p className="mt-0.5 text-[10px] text-faint">
              {form.fields.length} field{form.fields.length === 1 ? "" : "s"}
              {form.action ? ` · ${form.action}` : ""}
            </p>
          </div>
        </button>
        <Button variant="ghost" title="Show the form on the page" onClick={() => store.highlight(form.key)}>
          <Crosshair className="h-3.5 w-3.5" />
        </Button>
      </div>
      {open && (
        <div className="space-y-2 px-3 pb-3">
          <Field label="toolname" hint={nameError || "The tool's name, as agents see it."}>
            <input className={inputClass} value={draft.toolname} placeholder="searchFlights" onChange={(e) => setDraft({ ...draft, toolname: e.target.value })} />
          </Field>
          <Field label="tooldescription">
            <textarea
              rows={2}
              className={inputClass}
              value={draft.tooldescription}
              placeholder="What the form does and what the agent gets back"
              onChange={(e) => setDraft({ ...draft, tooldescription: e.target.value })}
            />
          </Field>
          <label className="flex items-center gap-2 text-xs text-fg">
            <input type="checkbox" checked={draft.toolautosubmit} onChange={(e) => setDraft({ ...draft, toolautosubmit: e.target.checked })} />
            toolautosubmit
            <span className="text-[10px] text-faint">Lets an agent submit without the user confirming.</span>
          </label>
          {form.fields.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[11px] font-medium text-muted">Parameters (toolparamdescription)</span>
              {form.fields.map((field) => {
                const key = field.name || field.id;
                return (
                  <div key={field.key} className="space-y-0.5">
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <span className="font-mono text-fg">{field.name || <em className="text-warn">no name</em>}</span>
                      <span className="text-faint">{field.type}</span>
                      {field.required && <span className="text-err">*</span>}
                      {field.toolparamtitle && <Badge tone="warn" title="toolparamtitle is not part of WebMCP">toolparamtitle</Badge>}
                    </div>
                    <input
                      className={inputClass}
                      disabled={!key}
                      value={draft.fields[key] ?? ""}
                      placeholder={field.label || field.ariaDescription || "Describe this parameter"}
                      onChange={(e) => setDraft({ ...draft, fields: { ...draft.fields, [key]: e.target.value } })}
                    />
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="primary" onClick={save} disabled={!!nameError || (!!draft.toolname && !draft.tooldescription)}>
              <Wand2 className="h-3.5 w-3.5" /> {isTool ? "Save" : "Make it a tool"}
            </Button>
            {form.augmented && (
              <Button variant="danger" onClick={() => store.clearFormEdit(form)}>
                <X className="h-3.5 w-3.5" /> Remove my changes
              </Button>
            )}
          </div>
          <p className="text-[10px] text-faint">Saved in this browser and re-applied whenever you open this page here.</p>
        </div>
      )}
    </div>
  );
}

function RuntimeNotice({ runtime }: { runtime: RuntimeInfo }) {
  const impl =
    runtime.implementation === "native"
      ? "the browser's own WebMCP"
      : runtime.implementation === "webfuse-polyfill"
        ? "Webfuse's WebMCP polyfill, so no browser flag is needed"
        : "an unknown implementation";
  if (runtime.api === "none") {
    return (
      <Notice tone="warn" icon={<AlertTriangle className="h-3.5 w-3.5" />}>
        This page has no WebMCP API, so only forms can be read. Make sure the Space has the Automation app installed.
      </Notice>
    );
  }
  return (
    <p className="px-3 text-[10px] text-faint">
      <code>{runtime.api}</code> from {impl}.
      {!runtime.hasGetTools && !runtime.hasTestingApi && " The page offers no way to list tools, so only those registered after the inspector loaded are shown."}
    </p>
  );
}

export default function ToolsPanel({ snapshot }: { snapshot: PageSnapshot | null }) {
  const [query, setQuery] = useState("");
  const status = useInspector((s) => s.status);
  const extension = useInspector((s) => s.extension);

  if (status !== "live") {
    return (
      <div className="p-4 space-y-3 text-xs text-muted">
        <p>Open a page to see its WebMCP tools: script tools from <code>document.modelContext.registerTool()</code> and forms with <code>toolname</code>.</p>
        <p>Inside the inspector, pages get Webfuse's WebMCP polyfill, so this works in any browser without flags.</p>
      </div>
    );
  }
  if (extension === "outdated") {
    return (
      <div className="p-3">
        <Notice tone="warn" icon={<AlertTriangle className="h-3.5 w-3.5" />}>
          The Space runs an older version of the inspector extension. Build it with <code>npm run build:extension</code> and upload
          <code> dist/extension</code> to the Space in Webfuse Studio.
        </Notice>
      </div>
    );
  }
  if (!snapshot) {
    return (
      <div className="p-4 text-xs text-muted flex items-center gap-2">
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        {extension === "missing" ? "The page did not answer. It may still be loading, or block the inspector." : "Reading the page…"}
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const matches = (text: string) => !q || text.toLowerCase().includes(q);
  const tools = snapshot.tools.filter((t) => matches(`${t.name} ${t.title ?? ""} ${t.description}`));
  const plainForms = snapshot.forms.filter((f) => !f.toolname && matches(`${f.label} ${f.action}`));
  const toolForms = snapshot.forms.filter((f) => f.toolname && matches(`${f.label} ${f.toolname}`));

  return (
    <div>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-line">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
          <input
            className={`${inputClass} pl-7`}
            placeholder="Filter tools and forms"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filter tools and forms"
          />
        </div>
        <Button variant="ghost" title="Scan the page again (R)" onClick={() => store.rescan(true)}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="pt-2">
        <RuntimeNotice runtime={snapshot.runtime} />
      </div>
      <SectionTitle right={<span className="text-[10px] text-faint">{snapshot.tools.length}</span>}>
        <span className="inline-flex items-center gap-1"><Code2 className="h-3 w-3" /> Tools</span>
      </SectionTitle>
      {tools.length ? (
        tools.map((tool) => <ToolCard key={`${tool.source}:${tool.name}`} tool={tool} />)
      ) : (
        <p className="px-3 pb-2 text-xs text-faint">
          {snapshot.tools.length ? "No tool matches the filter." : "No tools yet. Make a form below into a tool, or add a script tool under Author."}
        </p>
      )}
      {toolForms.length > 0 && (
        <>
          <SectionTitle>Tool forms</SectionTitle>
          {toolForms.map((form) => <FormCard key={`${form.key}:${form.toolname}:${form.tooldescription}`} form={form} />)}
        </>
      )}
      {plainForms.length > 0 && (
        <>
          <SectionTitle right={<span className="text-[10px] text-faint">{plainForms.length}</span>}>Other forms</SectionTitle>
          {plainForms.map((form) => <FormCard key={`${form.key}:plain`} form={form} />)}
        </>
      )}
    </div>
  );
}
