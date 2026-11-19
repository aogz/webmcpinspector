import type { InspectedTool, JsonSchema, ToolAnnotations } from "./types";
import {
  CUSTOM_TOOL_PREFIX,
  PAGE_DESCRIPTION_PREFIX,
  RESERVED_MCP_TOOL_NAMES,
  WEBFUSE_TOOL_NAME_RE,
} from "./webfuse";

export interface AdvertisedTool {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  annotations?: ToolAnnotations;
}

export interface AgentViewEntry {
  tool: InspectedTool;
  advertised?: AdvertisedTool;
  dropped?: string;
  changes: string[];
}

const SESSION_ID_PROPERTY: JsonSchema = { type: "string", description: "Webfuse Session ID" };

/** Removes "null" from type unions, which several MCP clients reject. */
export function stripNullFromTypeUnions(schema: JsonSchema): { schema: JsonSchema; stripped: number } {
  let stripped = 0;
  const walk = (node: JsonSchema): JsonSchema => {
    const out: JsonSchema = { ...node };
    if (Array.isArray(out.type) && out.type.includes("null") && out.type.length > 1) {
      const rest = out.type.filter((t) => t !== "null");
      out.type = rest.length === 1 ? rest[0] : rest;
      stripped++;
    }
    if (out.properties) {
      out.properties = Object.fromEntries(Object.entries(out.properties).map(([k, v]) => [k, walk(v)]));
    }
    if (out.items) out.items = walk(out.items);
    for (const key of ["anyOf", "oneOf", "allOf"] as const) {
      if (Array.isArray(out[key])) out[key] = (out[key] as JsonSchema[]).map(walk);
    }
    return out;
  };
  return { schema: walk(schema), stripped };
}

/** What an MCP client connected to the Webfuse Session MCP Server (dynamic mode) receives for a page tool. */
export function webfuseAgentView(tool: InspectedTool, isTopFrame = true): AgentViewEntry {
  const changes: string[] = [];
  if (!isTopFrame) return { tool, changes, dropped: "Only tools in the top frame are advertised." };
  if (RESERVED_MCP_TOOL_NAMES.has(tool.name)) {
    return { tool, changes, dropped: `"${tool.name}" is a reserved Webfuse tool name, so the page's tool is dropped.` };
  }
  if (!WEBFUSE_TOOL_NAME_RE.test(tool.name)) {
    return { tool, changes, dropped: "The name must start with a letter and use only letters, digits, _ . or -." };
  }

  const base: JsonSchema = tool.inputSchema ?? { type: "object", properties: {} };
  if (base.type !== undefined && base.type !== "object") {
    return { tool, changes, dropped: `The input schema's top-level type is "${String(base.type)}"; it must be "object".` };
  }
  if (!tool.inputSchema) changes.push("No input schema, so an empty object schema is used.");

  const { schema: cleaned, stripped } = stripNullFromTypeUnions(base);
  if (stripped) changes.push(`Removed "null" from ${stripped} type union${stripped > 1 ? "s" : ""}.`);

  const properties = { ...(cleaned.properties ?? {}) };
  if (properties.session_id) changes.push('The tool\'s own "session_id" parameter is replaced by Webfuse\'s.');
  properties.session_id = SESSION_ID_PROPERTY;
  const required = Array.from(new Set([...(cleaned.required ?? []), "session_id"]));
  changes.push('Added a required "session_id" parameter.');

  const pageDescription = `${PAGE_DESCRIPTION_PREFIX} ${tool.description || tool.title || ""}`.trim();
  const description = `${CUSTOM_TOOL_PREFIX} ${pageDescription}`;
  changes.push(`Description prefixed with "${CUSTOM_TOOL_PREFIX} ${PAGE_DESCRIPTION_PREFIX}".`);

  const annotations: ToolAnnotations = {};
  if (tool.annotations.readOnlyHint !== undefined) annotations.readOnlyHint = tool.annotations.readOnlyHint;
  const lost = ["untrustedContentHint", "consequentialHint", "debugging"].filter((k) => tool.annotations[k]);
  if (lost.length) changes.push(`MCP has no field for ${lost.join(", ")}, so ${lost.length > 1 ? "they are" : "it is"} dropped.`);
  if (tool.outputSchema) changes.push("The output schema is not forwarded.");
  if (tool.title) changes.push("The title is not forwarded; agents see only the name and description.");

  return {
    tool,
    changes,
    advertised: {
      name: tool.name,
      description,
      inputSchema: { ...cleaned, type: "object", properties, required },
      annotations: Object.keys(annotations).length ? annotations : undefined,
    },
  };
}

/** What a browser agent reading the spec API gets: the tool as registered. */
export function specView(tool: InspectedTool): Record<string, unknown> {
  const out: Record<string, unknown> = { name: tool.name };
  if (tool.title) out.title = tool.title;
  out.description = tool.description;
  if (tool.inputSchema) out.inputSchema = tool.inputSchema;
  if (tool.outputSchema) out.outputSchema = tool.outputSchema;
  const ann = Object.fromEntries(Object.entries(tool.annotations).filter(([, v]) => v !== undefined));
  if (Object.keys(ann).length) out.annotations = ann;
  return out;
}
