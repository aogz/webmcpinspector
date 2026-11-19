// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { store } from "../app/store";
import AgentViewPanel from "../components/AgentViewPanel";
import BuildPanel from "../components/BuildPanel";
import PromptPanel from "../components/PromptPanel";
import ScorePanel from "../components/ScorePanel";
import ToolsPanel from "../components/ToolsPanel";
import type { PageSnapshot } from "../shared/types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Chrome returns a Promise from scrollIntoView(); happy-dom returns undefined, which hid a crash on unmount.
Element.prototype.scrollIntoView = function () {
  return Promise.resolve() as unknown as void;
};

const snapshot: PageSnapshot = {
  instance: "i1",
  url: "https://webmcpinspector.com/inspect/fixtures/kitchen-sink.html",
  title: "Kitchen sink",
  runtime: {
    api: "document.modelContext",
    implementation: "webfuse-polyfill",
    hasGetTools: false,
    hasExecuteTool: false,
    hasTestingApi: true,
    legacyNavigatorApi: false,
    userAgent: "x",
  },
  tools: [
    {
      name: "reserveTable",
      description: "Reserve a table.",
      inputSchema: { type: "object", properties: { name: { type: "string" } } },
      annotations: {},
      source: "declarative",
      formKey: "#reserve",
      schemaOrigin: "inspector",
    },
    {
      name: "getMenu",
      description: "Lists every dish.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
      source: "imperative",
      schemaOrigin: "registry",
    },
  ],
  forms: [
    {
      key: "#reserve",
      label: "reserveTable",
      action: "/reserve",
      method: "POST",
      toolname: "reserveTable",
      tooldescription: "Reserve a table.",
      toolautosubmit: false,
      hasSubmitButton: true,
      augmented: false,
      registered: false,
      fields: [
        {
          key: "name", tag: "input", type: "text", name: "name", id: "", required: true, label: "Name",
          toolparamdescription: "", toolparamtitle: "", ariaDescription: "", options: [], augmented: false,
        },
      ],
    },
    {
      key: "#contact", label: "contact", action: "/contact", method: "POST", toolname: "", tooldescription: "",
      toolautosubmit: false, hasSubmitButton: true, augmented: false, registered: false, fields: [],
    },
  ],
  frames: [],
  scannedAt: 0,
};

describe("panels", () => {
  it.each([
    ["Tools", ToolsPanel],
    ["Score", ScorePanel],
    ["Agent view", AgentViewPanel],
    ["Build", BuildPanel],
    ["Prompt", PromptPanel],
  ])("%s mounts and unmounts cleanly", async (_name, Panel) => {
    (store as unknown as { set: (p: object) => void }).set({ status: "live", extension: "ok", snapshot });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(createElement(Panel as never, { snapshot, onConnect: () => {} })));
    await act(async () => root.unmount());
    expect(errors.mock.calls.map((c) => String(c[0]))).toEqual([]);
    errors.mockRestore();
  });
});

describe("app", () => {
  it("switches between every tab without crashing", async () => {
    const { default: App } = await import("../App");
    (store as unknown as { set: (p: object) => void }).set({ status: "live", extension: "ok", snapshot, sessionId: "s1", sessionOrigin: "https://webfu.se" });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(createElement(App)));
    const tab = (label: string) =>
      Array.from(host.querySelectorAll('[role="tab"]')).find((t) => t.textContent?.startsWith(label)) as HTMLElement;
    for (const label of ["Score", "Build", "Tools", "Agent view", "Prompt", "Tools", "Build", "Prompt", "Score", "Tools"]) {
      await act(async () => tab(label).click());
      expect(host.textContent?.length, `after ${label}`).toBeGreaterThan(50);
    }
    await act(async () => root.unmount());
    expect(errors.mock.calls.map((c) => String(c[0]).slice(0, 300))).toEqual([]);
    errors.mockRestore();
  });
});
