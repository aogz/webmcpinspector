// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { isWebfusePage } from "../app/store";

describe("isWebfusePage", () => {
  it("recognizes the Automation app's start page and other session pages", () => {
    expect(isWebfusePage("https://webfu.se/s20C9w/internal_app_scripts/automation/index.html", "https://webfu.se")).toBe(true);
    expect(isWebfusePage("https://webfu.se/s20C9w", "https://webfu.se")).toBe(true);
    expect(isWebfusePage("https://other.example/internal_app_scripts/x", "")).toBe(true);
  });

  it("leaves inspected pages alone", () => {
    expect(isWebfusePage("https://googlechromelabs.github.io/webmcp-tools/demos/french-bistro/", "https://webfu.se")).toBe(false);
    expect(isWebfusePage("not a url", "https://webfu.se")).toBe(false);
  });
});
