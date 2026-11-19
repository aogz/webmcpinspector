import { useState } from "react";
import { Braces, ListPlus, Sparkles, Trash2 } from "lucide-react";
import { exampleFor, primaryType, type SchemaError } from "../shared/jsonSchema";
import type { JsonSchema } from "../shared/types";
import { Button } from "./ui";
import { cx, inputClass } from "./uiUtils";

type Value = unknown;

const INPUT_TYPES: Record<string, string> = {
  date: "date",
  time: "time",
  "date-time": "datetime-local",
  email: "email",
  uri: "url",
  url: "url",
};

function ValueInput({
  schema,
  value,
  onChange,
  id,
}: {
  schema: JsonSchema;
  value: Value;
  onChange: (v: Value) => void;
  id: string;
}) {
  const type = primaryType(schema);

  if (Array.isArray(schema.enum) && schema.enum.length) {
    return (
      <select
        id={id}
        className={inputClass}
        value={value === undefined ? "" : JSON.stringify(value)}
        onChange={(e) => onChange(e.target.value === "" ? undefined : JSON.parse(e.target.value))}
      >
        <option value="">—</option>
        {schema.enum.map((option) => (
          <option key={JSON.stringify(option)} value={JSON.stringify(option)}>
            {String(option)}
          </option>
        ))}
      </select>
    );
  }

  if (type === "boolean") {
    return (
      <select
        id={id}
        className={inputClass}
        value={value === undefined ? "" : String(value)}
        onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value === "true")}
      >
        <option value="">—</option>
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }

  if (type === "number" || type === "integer") {
    return (
      <input
        id={id}
        type="number"
        className={inputClass}
        min={schema.minimum}
        max={schema.maximum}
        step={type === "integer" ? 1 : schema.multipleOf ?? "any"}
        value={value === undefined || value === null ? "" : String(value)}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      />
    );
  }

  if (type === "object" && schema.properties) {
    const obj = (value && typeof value === "object" ? value : {}) as Record<string, Value>;
    return (
      <div className="space-y-2 rounded-md border border-line p-2">
        {Object.entries(schema.properties).map(([key, child]) => (
          <PropertyRow
            key={key}
            name={key}
            schema={child}
            required={schema.required?.includes(key) ?? false}
            value={obj[key]}
            onChange={(v) => {
              const next = { ...obj };
              if (v === undefined) delete next[key];
              else next[key] = v;
              onChange(Object.keys(next).length ? next : undefined);
            }}
            idPrefix={id}
          />
        ))}
      </div>
    );
  }

  if (type === "array" && schema.items) {
    const items = Array.isArray(value) ? value : [];
    const itemSchema = schema.items;
    if (Array.isArray(itemSchema.enum) && primaryType(itemSchema) === "string") {
      return (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {itemSchema.enum.map((option) => (
            <label key={String(option)} className="inline-flex items-center gap-1 text-xs text-fg">
              <input
                type="checkbox"
                checked={items.includes(option)}
                onChange={(e) => {
                  const next = e.target.checked ? [...items, option] : items.filter((i) => i !== option);
                  onChange(next.length ? next : undefined);
                }}
              />
              {String(option)}
            </label>
          ))}
        </div>
      );
    }
    return (
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-1">
            <div className="flex-1 min-w-0">
              <ValueInput
                id={`${id}-${i}`}
                schema={itemSchema}
                value={item}
                onChange={(v) => onChange(items.map((old, j) => (j === i ? v : old)))}
              />
            </div>
            <Button variant="ghost" title="Remove item" onClick={() => onChange(items.filter((_, j) => j !== i))}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <Button variant="ghost" onClick={() => onChange([...items, exampleFor(itemSchema)])}>
          <ListPlus className="h-3.5 w-3.5" /> Add item
        </Button>
      </div>
    );
  }

  if (type === "string") {
    const long = (schema.maxLength ?? 0) > 200 || /message|body|comment|notes|description/i.test(id);
    const common = {
      id,
      className: inputClass,
      placeholder: Array.isArray(schema.examples) ? String(schema.examples[0] ?? "") : "",
      value: value === undefined || value === null ? "" : String(value),
    };
    return long ? (
      <textarea {...common} rows={3} onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)} />
    ) : (
      <input
        {...common}
        type={INPUT_TYPES[schema.format ?? ""] ?? "text"}
        minLength={schema.minLength}
        maxLength={schema.maxLength}
        onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
      />
    );
  }

  return <JsonInput value={value} onChange={onChange} id={id} />;
}

function JsonInput({ value, onChange, id }: { value: Value; onChange: (v: Value) => void; id: string }) {
  const [text, setText] = useState(() => (value === undefined ? "" : JSON.stringify(value, null, 2)));
  const [error, setError] = useState("");
  return (
    <div>
      <textarea
        id={id}
        rows={3}
        className={cx(inputClass, "font-mono")}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (!e.target.value.trim()) {
            setError("");
            onChange(undefined);
            return;
          }
          try {
            onChange(JSON.parse(e.target.value));
            setError("");
          } catch (err) {
            setError(err instanceof Error ? err.message : "Invalid JSON");
          }
        }}
      />
      {error && <p className="text-[10px] text-err">{error}</p>}
    </div>
  );
}

function PropertyRow({
  name,
  schema,
  required,
  value,
  onChange,
  idPrefix,
}: {
  name: string;
  schema: JsonSchema;
  required: boolean;
  value: Value;
  onChange: (v: Value) => void;
  idPrefix: string;
}) {
  const id = `${idPrefix}-${name}`;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="flex items-baseline gap-1.5 text-[11px]">
        <span className="font-mono font-medium text-fg">{name}</span>
        {required && <span className="text-err" title="Required">*</span>}
        <span className="text-faint">{primaryType(schema)}{schema.format ? ` · ${schema.format}` : ""}</span>
      </label>
      {schema.description && <p className="text-[10px] text-muted">{schema.description}</p>}
      <ValueInput id={id} schema={schema} value={value} onChange={onChange} />
    </div>
  );
}

export default function ArgEditor({
  schema,
  value,
  onChange,
  errors,
  idPrefix,
}: {
  schema: JsonSchema | undefined;
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
  errors: SchemaError[];
  idPrefix: string;
}) {
  const [mode, setMode] = useState<"form" | "json">("form");
  const [jsonKey, setJsonKey] = useState(0);
  const properties = schema?.properties ?? {};
  const hasParams = Object.keys(properties).length > 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        <span className="text-[11px] font-medium text-muted flex-1">{hasParams ? "Arguments" : "No parameters"}</span>
        {hasParams && (
          <Button
            variant="ghost"
            title="Fill every parameter with an example value"
            onClick={() => {
              onChange((exampleFor(schema) as Record<string, unknown>) ?? {});
              setJsonKey((k) => k + 1);
            }}
          >
            <Sparkles className="h-3.5 w-3.5" /> Example
          </Button>
        )}
        <Button
          variant="ghost"
          title={mode === "form" ? "Edit the arguments as JSON" : "Edit the arguments in a form"}
          onClick={() => {
            setMode(mode === "form" ? "json" : "form");
            setJsonKey((k) => k + 1);
          }}
        >
          <Braces className="h-3.5 w-3.5" /> {mode === "form" ? "JSON" : "Form"}
        </Button>
      </div>
      {mode === "json" ? (
        <JsonInput
          key={jsonKey}
          id={`${idPrefix}-json`}
          value={value}
          onChange={(v) => onChange(v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {})}
        />
      ) : (
        Object.entries(properties).map(([key, child]) => (
          <PropertyRow
            key={key}
            name={key}
            schema={child}
            required={schema?.required?.includes(key) ?? false}
            value={value[key]}
            idPrefix={idPrefix}
            onChange={(v) => {
              const next = { ...value };
              if (v === undefined) delete next[key];
              else next[key] = v;
              onChange(next);
            }}
          />
        ))
      )}
      {errors.length > 0 && (
        <ul className="space-y-0.5 text-[10px] text-warn">
          {errors.map((e, i) => (
            <li key={i}>
              <span className="font-mono">{e.path}</span> {e.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
