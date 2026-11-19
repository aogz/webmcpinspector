import { describe, expect, it } from "vitest";
import { composePrompt, dynamicUrl, LINKS, serverNameFor, suggestTask, type AgentContext } from "../app/agentLinks";

const ctx: AgentContext = {
  sessionId: "s123",
  key: "ak_test",
  mcpUrl: "https://session-mcp.webfu.se/mcp",
  serverName: serverNameFor("webmcp-inspector"),
  task: "Book a table",
  toolNames: ["bookTable"],
  pageUrl: "https://example.com/",
};

describe("agent links", () => {
  it("names the server after the Space", () => {
    expect(serverNameFor("My Space!")).toBe("webfuse-my-space");
    expect(serverNameFor("")).toBe("webfuse-webmcp-inspector");
  });

  it("points agents at dynamic mode so page tools are listed", () => {
    expect(dynamicUrl(ctx.mcpUrl)).toBe("https://session-mcp.webfu.se/mcp?dynamic=true");
    const prompt = composePrompt("claude", ctx);
    expect(prompt).toContain("connectToSession");
    expect(prompt).toContain("Session ID: s123");
    expect(prompt).toContain("claude mcp add --transport http --scope user webfuse-webmcp-inspector");
    expect(prompt).toContain("bookTable");
    expect(prompt.endsWith("Task: Book a table")).toBe(true);
  });

  it("never tells the agent a page has no tools, because the inspector's list can be incomplete", () => {
    const prompt = composePrompt("desktop", { ...ctx, toolNames: [] });
    expect(prompt).not.toMatch(/declares no WebMCP tools/);
    expect(prompt).toContain("call tools/list");
    expect(prompt).toContain("[Custom Tool] [Page-declared");
  });

  it("suggests using the page's tools, not designing new ones", () => {
    for (const names of [[], ["searchFlights"], ["a", "b"]]) {
      const task = suggestTask(names, ctx.pageUrl);
      expect(task).toMatch(/^Use the WebMCP tools/);
      expect(task).not.toMatch(/would make good/);
    }
  });

  it("gives each agent its own setup line", () => {
    expect(composePrompt("codex", ctx)).toContain("[mcp_servers.webfuse-webmcp-inspector]");
    expect(composePrompt("cursor", ctx)).toContain("~/.cursor/mcp.json");
    expect(composePrompt("zed", ctx)).toContain("context_servers");
  });

  it("builds the app deep links", () => {
    expect(LINKS.desktop("hi there")).toBe("claude://code/new?q=hi%20there");
    expect(LINKS.claude("x")).toBe("claude-cli://open?q=x");
    expect(LINKS.codex("x")).toBe("codex://threads/new?prompt=x");
    expect(LINKS.cursor("x")).toBe("cursor://anysphere.cursor-deeplink/prompt?text=x");
    expect(LINKS.zed("x")).toBe("zed://agent?prompt=x");
  });
});
