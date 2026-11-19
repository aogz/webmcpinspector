export type JsonSchema = {
  type?: string | string[];
  title?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  const?: unknown;
  default?: unknown;
  examples?: unknown[];
  format?: string;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  additionalProperties?: boolean | JsonSchema;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  [key: string]: unknown;
};

export interface ToolAnnotations {
  readOnlyHint?: boolean;
  untrustedContentHint?: boolean;
  consequentialHint?: boolean;
  debugging?: boolean;
  [key: string]: unknown;
}

export type ToolSource = "imperative" | "declarative" | "injected";

export interface InspectedTool {
  name: string;
  title?: string;
  description: string;
  inputSchema?: JsonSchema;
  outputSchema?: JsonSchema;
  annotations: ToolAnnotations;
  source: ToolSource;
  formKey?: string;
  exposedTo?: string[];
  /** Where the schema came from: the browser or polyfill registry, or the inspector's own reading of a form. */
  schemaOrigin: "registry" | "inspector";
  /** Registered through the deprecated navigator.modelContext instead of document.modelContext. */
  legacyApi?: boolean;
  injectedId?: string;
}

export interface FormField {
  key: string;
  tag: string;
  type: string;
  name: string;
  id: string;
  required: boolean;
  label: string;
  toolparamdescription: string;
  /** No longer part of WebMCP; reported so the linter can flag it. */
  toolparamtitle: string;
  ariaDescription: string;
  options: string[];
  augmented: boolean;
}

export interface FormInfo {
  key: string;
  label: string;
  action: string;
  method: string;
  toolname: string;
  tooldescription: string;
  toolautosubmit: boolean;
  hasSubmitButton: boolean;
  fields: FormField[];
  augmented: boolean;
  /** The browser or polyfill lists a tool for this form. */
  registered: boolean;
}

export interface FrameInfo {
  src: string;
  origin: string;
  crossOrigin: boolean;
  allowTools: boolean;
}

export type ApiLocation = "document.modelContext" | "navigator.modelContext" | "none";
export type Implementation = "native" | "webfuse-polyfill" | "unknown";

export interface RuntimeInfo {
  api: ApiLocation;
  implementation: Implementation;
  hasGetTools: boolean;
  hasExecuteTool: boolean;
  hasTestingApi: boolean;
  legacyNavigatorApi: boolean;
  /** False when the frame's permissions policy disallows the `tools` feature, so native WebMCP rejects every call. */
  toolsAllowed?: boolean;
  userAgent: string;
}

export interface PageSnapshot {
  /** Changes every time the content script starts, so a reload of the same URL is noticed. */
  instance: string;
  url: string;
  title: string;
  runtime: RuntimeInfo;
  tools: InspectedTool[];
  forms: FormInfo[];
  frames: FrameInfo[];
  scannedAt: number;
}

export type LifecycleKind =
  | "registered"
  | "unregistered"
  | "toolactivated"
  | "toolcancel"
  | "agent-submit"
  | "respond-with"
  | "navigated";

export interface LifecycleEvent {
  at: number;
  kind: LifecycleKind;
  tool?: string;
  detail?: string;
}

export interface FormAttrUpdate {
  formKey: string;
  form: Partial<Record<"toolname" | "tooldescription" | "toolautosubmit", string | null>>;
  fields: Record<string, Partial<Record<"toolparamdescription", string | null>>>;
}

export interface InjectedToolDef {
  id: string;
  name: string;
  title?: string;
  description: string;
  inputSchema?: JsonSchema;
  outputSchema?: JsonSchema;
  annotations?: ToolAnnotations;
  /** Body of `async function execute(input, options) { … }`. */
  code: string;
}

export interface ExecuteOutcome {
  requestId: string;
  toolName: string;
  ok: boolean;
  result?: unknown;
  raw?: string;
  error?: string;
  aborted?: boolean;
  durationMs: number;
  via: string;
}
