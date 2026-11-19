import type { FormField, FormInfo, JsonSchema } from "../shared/types";

export const FIELD_SELECTOR = "input, select, textarea";
const SKIPPED_TYPES = new Set(["hidden", "submit", "reset", "button", "image", "file"]);
export const AUGMENTED_ATTR = "data-webmcp-inspector";

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export function fieldType(field: Field): string {
  if (field instanceof HTMLSelectElement) return field.multiple ? "select-multiple" : "select";
  if (field instanceof HTMLTextAreaElement) return "textarea";
  return (field.getAttribute("type") || "text").toLowerCase();
}

function fillableFields(form: HTMLFormElement): Field[] {
  return Array.from(form.querySelectorAll<Field>(FIELD_SELECTOR)).filter((f) => !SKIPPED_TYPES.has(fieldType(f)));
}

export function labelFor(field: Element): string {
  const id = field.getAttribute("id");
  if (id) {
    const label = field.ownerDocument.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (label?.textContent) return label.textContent.replace(/\s+/g, " ").trim().slice(0, 120);
  }
  const wrapping = field.closest("label");
  if (wrapping?.textContent) return wrapping.textContent.replace(/\s+/g, " ").trim().slice(0, 120);
  const labelledBy = field.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((ref) => field.ownerDocument.getElementById(ref)?.textContent ?? "")
      .join(" ")
      .trim();
    if (text) return text.slice(0, 120);
  }
  return field.getAttribute("aria-label") ?? "";
}

/**
 * A key that survives re-renders and reloads, so saved augmentations find their form again.
 * Prefer attributes authors control; fall back to position among similar forms.
 */
export function formKey(form: HTMLFormElement, forms: HTMLFormElement[]): string {
  if (form.id) return `#${form.id}`;
  const name = form.getAttribute("name");
  if (name) return `form[name="${name}"]`;
  const toolname = form.getAttribute("toolname");
  if (toolname && !form.hasAttribute(AUGMENTED_ATTR)) return `form[toolname="${toolname}"]`;
  const action = form.getAttribute("action") || "";
  const siblings = forms.filter((f) => (f.getAttribute("action") || "") === action && !f.id && !f.getAttribute("name"));
  return `form[action="${action}"]:${siblings.indexOf(form)}`;
}

export function findForm(key: string): HTMLFormElement | null {
  const forms = Array.from(document.querySelectorAll("form"));
  return forms.find((f) => formKey(f, forms) === key) ?? null;
}

function fieldKey(field: Field, index: number): string {
  return field.name || field.id || `#${index}`;
}

/** One entry per parameter: radio buttons and same-name checkboxes collapse into one field. */
export function readFields(form: HTMLFormElement): FormField[] {
  const out: FormField[] = [];
  const grouped = new Map<string, FormField>();
  fillableFields(form).forEach((field, index) => {
    const type = fieldType(field);
    const key = fieldKey(field, index);
    const groupable = (type === "radio" || type === "checkbox") && field.name;
    const existing = groupable ? grouped.get(`${type}:${field.name}`) : undefined;
    if (existing) {
      existing.options.push((field as HTMLInputElement).value);
      if (!existing.toolparamdescription) {
        existing.toolparamdescription = field.getAttribute("toolparamdescription") ?? "";
      }
      return;
    }
    const entry: FormField = {
      key,
      tag: field.tagName.toLowerCase(),
      type,
      name: field.name || "",
      id: field.id || "",
      required: field.required,
      label: labelFor(field),
      toolparamdescription: field.getAttribute("toolparamdescription") ?? "",
      toolparamtitle: field.getAttribute("toolparamtitle") ?? "",
      ariaDescription: field.getAttribute("aria-description") ?? "",
      options:
        field instanceof HTMLSelectElement
          ? Array.from(field.options).map((o) => o.value).filter(Boolean)
          : groupable
            ? [(field as HTMLInputElement).value]
            : [],
      augmented: field.hasAttribute(`${AUGMENTED_ATTR}-toolparamdescription`),
    };
    out.push(entry);
    if (groupable) grouped.set(`${type}:${field.name}`, entry);
  });
  return out;
}

export function formLabel(form: HTMLFormElement, index: number): string {
  return (
    form.getAttribute("toolname") ||
    form.id ||
    form.getAttribute("name") ||
    form.getAttribute("aria-label") ||
    form.querySelector("h1, h2, h3, legend")?.textContent?.trim().slice(0, 60) ||
    form.getAttribute("action") ||
    `Form ${index + 1}`
  );
}

export function readForm(form: HTMLFormElement, forms: HTMLFormElement[], registered: Set<string>): FormInfo {
  const toolname = form.getAttribute("toolname") ?? "";
  return {
    key: formKey(form, forms),
    label: formLabel(form, forms.indexOf(form)),
    action: form.getAttribute("action") ?? "",
    method: (form.getAttribute("method") || "GET").toUpperCase(),
    toolname,
    tooldescription: form.getAttribute("tooldescription") ?? "",
    toolautosubmit: form.hasAttribute("toolautosubmit") && form.getAttribute("toolautosubmit") !== "false",
    hasSubmitButton: !!form.querySelector('button:not([type]), button[type="submit"], input[type="submit"], input[type="image"]'),
    fields: readFields(form),
    augmented: form.hasAttribute(AUGMENTED_ATTR),
    registered: !!toolname && registered.has(toolname),
  };
}

const TEXT_FORMATS: Record<string, string> = {
  email: "email",
  url: "uri",
  date: "date",
  time: "time",
  "datetime-local": "date-time",
};

/**
 * The inspector's estimate of the schema a browser derives from a form, following the declarative
 * explainer and the Webfuse polyfill. Used only when the browser does not list the form as a tool.
 */
export function estimateFormSchema(form: HTMLFormElement): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  const required = new Set<string>();
  const fields = fillableFields(form);
  for (const field of fields) {
    if (!field.name) continue;
    const type = fieldType(field);
    const description =
      field.getAttribute("toolparamdescription") || labelFor(field) || field.getAttribute("aria-description") || undefined;
    let prop: JsonSchema;
    if (type === "radio") {
      if (properties[field.name]) {
        properties[field.name].enum?.push((field as HTMLInputElement).value);
        if (field.required) required.add(field.name);
        continue;
      }
      prop = { type: "string", enum: [(field as HTMLInputElement).value] };
    } else if (type === "checkbox") {
      const group = fields.filter((f) => f.name === field.name && fieldType(f) === "checkbox");
      if (group.length > 1) {
        if (properties[field.name]) continue;
        prop = {
          type: "array",
          items: { type: "string", enum: group.map((f) => (f as HTMLInputElement).value) },
          uniqueItems: true,
        };
      } else {
        prop = { type: "boolean" };
      }
    } else if (type === "select" || type === "select-multiple") {
      const values = Array.from((field as HTMLSelectElement).options).map((o) => o.value).filter(Boolean);
      prop = type === "select" ? { type: "string", enum: values } : { type: "array", items: { type: "string", enum: values } };
    } else if (type === "number" || type === "range") {
      const input = field as HTMLInputElement;
      const step = input.step && input.step !== "any" ? Number(input.step) : undefined;
      prop = { type: step !== undefined && Number.isInteger(step) ? "integer" : "number" };
      if (input.min) prop.minimum = Number(input.min);
      if (input.max) prop.maximum = Number(input.max);
      if (step && step !== 1) prop.multipleOf = step;
    } else {
      prop = { type: "string" };
      if (TEXT_FORMATS[type]) prop.format = TEXT_FORMATS[type];
      const input = field as HTMLInputElement;
      if (input.minLength > 0) prop.minLength = input.minLength;
      if (input.maxLength > 0) prop.maxLength = input.maxLength;
      if (input.pattern) prop.pattern = input.pattern;
    }
    if (description) prop.description = description;
    if ((field as HTMLInputElement).placeholder) prop.examples = [(field as HTMLInputElement).placeholder];
    properties[field.name] = prop;
    if (field.required) required.add(field.name);
  }
  return { type: "object", properties, ...(required.size ? { required: Array.from(required) } : {}) };
}

/** Sets a value the way a user would, so React and other frameworks see the change. */
function setNativeValue(field: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(field, value);
  else field.value = value;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
}

function setChecked(field: HTMLInputElement, checked: boolean) {
  if (field.checked === checked) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked")?.set;
  if (setter) setter.call(field, checked);
  else field.checked = checked;
  field.dispatchEvent(new Event("click", { bubbles: true }));
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Fallback for forms the browser does not list as tools: fill like a user, then submit only if allowed. */
export function fillForm(form: HTMLFormElement, args: Record<string, unknown>) {
  const filled: string[] = [];
  for (const field of fillableFields(form)) {
    if (!field.name || !(field.name in args)) continue;
    const value = args[field.name];
    const type = fieldType(field);
    if (type === "checkbox") {
      const input = field as HTMLInputElement;
      setChecked(input, Array.isArray(value) ? value.map(String).includes(input.value) : Boolean(value));
    } else if (type === "radio") {
      const input = field as HTMLInputElement;
      if (String(value) === input.value) setChecked(input, true);
    } else if (field instanceof HTMLSelectElement) {
      const wanted = Array.isArray(value) ? value.map(String) : [String(value)];
      Array.from(field.options).forEach((o) => (o.selected = wanted.includes(o.value)));
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      setNativeValue(field, value === null || value === undefined ? "" : String(value));
    }
    if (!filled.includes(field.name)) filled.push(field.name);
  }
  const autosubmit = form.hasAttribute("toolautosubmit") && form.getAttribute("toolautosubmit") !== "false";
  if (!autosubmit) {
    const submit = form.querySelector<HTMLElement>('button:not([type]), button[type="submit"], input[type="submit"]');
    submit?.focus();
    return { filled, submitted: false, note: "Fields filled. toolautosubmit is not set, so the user has to submit." };
  }
  if (!form.reportValidity()) return { filled, submitted: false, note: "The form failed its own validation." };
  form.requestSubmit();
  return { filled, submitted: true };
}
