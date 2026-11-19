import { describe, expect, it } from "vitest";
import { formHtmlSnippet, registerToolSnippet, webfuseExtension } from "../app/exporters";
import type { FormInfo, InspectedTool } from "../shared/types";

const tool: InspectedTool = {
  name: "getTitle",
  description: "Returns the page title",
  inputSchema: { type: "object", properties: {} },
  annotations: { readOnlyHint: true },
  source: "injected",
  schemaOrigin: "registry",
};

describe("exporters", () => {
  it("writes a registerTool call that parses", () => {
    const code = registerToolSnippet(tool, "return document.title;");
    expect(() => new Function(code)).not.toThrow();
    expect(code).toContain('"name": "getTitle"');
    expect(code).toContain("return document.title;");
  });

  it("escapes form attribute values", () => {
    const form: FormInfo = {
      key: "#f", label: "f", action: "/go", method: "POST", toolname: "go", tooldescription: 'Say "hi"',
      toolautosubmit: false, hasSubmitButton: true, augmented: true, registered: true,
      fields: [{ key: "q", tag: "input", type: "text", name: "q", id: "", required: true, label: "", toolparamdescription: "Query", toolparamtitle: "", ariaDescription: "", options: [], augmented: true }],
    };
    const html = formHtmlSnippet(form);
    expect(html).toContain('tooldescription="Say &quot;hi&quot;"');
    expect(html).toContain('<input type="text" name="q" toolparamdescription="Query" required>');
  });

  it("generates an extension whose script parses", () => {
    const { content, manifest } = webfuseExtension(
      "https://shop.example.com/cart/",
      [{ formKey: "#f", form: { toolname: "go", tooldescription: "Go", toolautosubmit: null }, fields: {}, savedAt: 0 }],
      [{ id: "1", name: "getTitle", description: "d", code: "return document.title;" }],
    );
    expect(() => new Function(content)).not.toThrow();
    expect(JSON.parse(manifest).content_scripts[0].matches).toEqual(["https://shop.example.com/*"]);
  });
});
