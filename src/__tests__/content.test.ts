// @vitest-environment happy-dom
// @vitest-environment-options {"settings": {"disableIframePageLoading": true, "disableJavaScriptFileLoading": true}}
import { beforeAll, describe, expect, it } from "vitest";
import type { PageSnapshot } from "../shared/types";

type Msg = Record<string, unknown> & { type: string };

const sent: Msg[] = [];
let onMessage: (...args: unknown[]) => void = () => {};

class FakeModelContext extends EventTarget {
  tools = new Map<string, { name: string; description: string; inputSchema?: object; execute: (i: unknown) => unknown; annotations?: object }>();
  registerTool(tool: { name: string; description: string; execute: (i: unknown) => unknown }, options?: { signal?: AbortSignal }) {
    this.tools.set(tool.name, tool);
    options?.signal?.addEventListener("abort", () => {
      this.tools.delete(tool.name);
      this.dispatchEvent(new Event("toolchange"));
    });
    this.dispatchEvent(new Event("toolchange"));
    return Promise.resolve();
  }
  async getTools() {
    return Array.from(this.tools.values()).map(({ name, description, inputSchema, annotations }) => ({
      name,
      description,
      inputSchema: inputSchema ? JSON.stringify(inputSchema) : "",
      annotations,
    }));
  }
  async executeTool(tool: { name: string }, input: unknown) {
    return JSON.stringify(await this.tools.get(tool.name)!.execute(input));
  }
}

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const last = (type: string) => [...sent].reverse().find((m) => m.type === type);

beforeAll(async () => {
  document.body.innerHTML = `
    <form id="search" toolname="searchRecipes" tooldescription="Search recipes by ingredient">
      <input name="ingredient" required><button>Go</button>
    </form>
    <form action="/newsletter"><input name="email" type="email"></form>
    <iframe src="https://other.example/widget"></iframe>`;
  const mc = new FakeModelContext();
  Object.defineProperty(document, "modelContext", { value: mc, configurable: true });
  const controller = new AbortController();
  void mc.registerTool(
    {
      name: "getCart",
      description: "Returns the items in the cart",
      execute: () => ({ items: 2 }),
      annotations: { readOnlyHint: true },
    } as never,
    { signal: controller.signal },
  );
  (window as unknown as { __abortCart: () => void }).__abortCart = () => controller.abort();
  (window as unknown as { webfuse: unknown }).webfuse = {
    isInsideSession: true,
    initSpace: async () => ({}),
    currentSession: {
      sendMessage: (m: Msg) => sent.push(m),
      on: (event: string, cb: (...args: unknown[]) => void) => {
        if (event === "message") onMessage = cb;
      },
    },
  };
  await import("../extension/content");
  await tick(50);
});

describe("content script", () => {
  it("reports registry tools, forms and frames with the protocol version", () => {
    const msg = last("webmcp:snapshot")!;
    expect(msg.v).toBe(2);
    const snapshot = msg.snapshot as PageSnapshot;
    expect(snapshot.runtime.api).toBe("document.modelContext");
    expect(snapshot.tools.map((t) => t.name).sort()).toEqual(["getCart", "searchRecipes"]);
    const cart = snapshot.tools.find((t) => t.name === "getCart")!;
    expect(cart.source).toBe("imperative");
    expect(cart.annotations).toEqual({ readOnlyHint: true });
    const search = snapshot.tools.find((t) => t.name === "searchRecipes")!;
    expect(search.source).toBe("declarative");
    expect(search.schemaOrigin).toBe("inspector");
    expect(snapshot.forms.map((f) => f.key)).toEqual(["#search", 'form[action="/newsletter"]:0']);
    expect(snapshot.frames).toEqual([{ src: "https://other.example/widget", origin: "https://other.example", crossOrigin: true, allowTools: false }]);
  });

  it("runs a tool through document.modelContext.executeTool()", async () => {
    onMessage({ data: { message: { type: "webmcp:execute", v: 2, requestId: "r1", toolName: "getCart", args: {}, timeoutMs: 1000 } } });
    await tick(20);
    const outcome = (last("webmcp:execute-result")!.outcome) as Record<string, unknown>;
    expect(outcome).toMatchObject({ requestId: "r1", ok: true, result: { items: 2 }, via: "document.modelContext.executeTool()" });
  });

  it("notices a tool removed by its AbortSignal", async () => {
    (window as unknown as { __abortCart: () => void }).__abortCart();
    await tick(300);
    const events = sent.filter((m) => m.type === "webmcp:lifecycle").flatMap((m) => m.events as { kind: string; tool: string }[]);
    expect(events).toContainEqual(expect.objectContaining({ kind: "unregistered", tool: "getCart" }));
    expect((last("webmcp:snapshot")!.snapshot as PageSnapshot).tools.map((t) => t.name)).toEqual(["searchRecipes"]);
  });

  it("applies augmentations to a plain form", async () => {
    onMessage({
      type: "webmcp:set-attrs",
      v: 2,
      augmented: true,
      updates: [{ formKey: 'form[action="/newsletter"]:0', form: { toolname: "subscribe", tooldescription: "Subscribe to the newsletter" }, fields: { email: { toolparamdescription: "Email address" } } }],
    });
    await tick(300);
    const form = document.querySelector('form[action="/newsletter"]')!;
    expect(form.getAttribute("toolname")).toBe("subscribe");
    expect(form.hasAttribute("data-webmcp-inspector")).toBe(true);
    expect(form.querySelector("input")!.getAttribute("toolparamdescription")).toBe("Email address");
  });

  it("registers and removes an injected script tool", async () => {
    onMessage({
      type: "webmcp:inject-tool",
      v: 2,
      tool: { id: "t1", name: "pageTitle", description: "Returns the title", code: "return { title: 'Fixture' };" },
    });
    await tick(300);
    expect(last("webmcp:inject-result")).toMatchObject({ id: "t1", ok: true });
    const snapshot = last("webmcp:snapshot")!.snapshot as PageSnapshot;
    expect(snapshot.tools.find((t) => t.name === "pageTitle")?.source).toBe("injected");
    onMessage({ type: "webmcp:remove-injected", v: 2, id: "t1" });
    await tick(300);
    expect((last("webmcp:snapshot")!.snapshot as PageSnapshot).tools.some((t) => t.name === "pageTitle")).toBe(false);
  });

  it("cancels a running call", async () => {
    const mc = (document as unknown as { modelContext: FakeModelContext }).modelContext;
    void mc.registerTool({ name: "slow", description: "Never finishes", execute: () => new Promise(() => {}) });
    await tick(300);
    onMessage({ type: "webmcp:execute", v: 2, requestId: "r2", toolName: "slow", args: {}, timeoutMs: 5000 });
    await tick(10);
    onMessage({ type: "webmcp:cancel", v: 2, requestId: "r2" });
    await tick(10);
    expect(last("webmcp:execute-result")!.outcome).toMatchObject({ requestId: "r2", ok: false, aborted: true });
  });
});
