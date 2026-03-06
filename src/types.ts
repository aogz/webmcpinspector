export interface FormInput {
  index: number;
  tag: string;
  type: string;
  name: string;
  id: string;
  required: boolean;
  toolparamdescription: string;
  toolparamtitle: string;
  label: string;
  webfuseApplied: boolean;
}

export interface FormTool {
  index: number;
  formId: string;
  action: string;
  method: string;
  toolname: string;
  tooldescription: string;
  toolautosubmit: string;
  hasWebMCP: boolean;
  inputCount: number;
  inputs: FormInput[];
  webfuseApplied: boolean;
}

export interface ImperativeTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface SavedFormOverride {
  formId: string;
  attributes: Record<string, string>;
  inputs: Record<string, Record<string, string>>; // keyed by input name||id
}

export interface SavedPageOverrides {
  [url: string]: SavedFormOverride[];
}

export interface SchemaResponse {
  formIndex: number;
  schema: {
    name: string;
    description: string;
    inputSchema: {
      type: string;
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}
