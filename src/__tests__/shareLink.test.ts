// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { inspectLink, syncAddressBar, urlFromSearch } from "../app/shareLink";

describe("share links", () => {
  it("reads the page to inspect from ?url=", () => {
    expect(urlFromSearch("?url=https%3A%2F%2Fexample.com%2Fa%3Fb%3D1")).toBe("https://example.com/a?b=1");
    expect(urlFromSearch("?url=example.com")).toBe("example.com");
    expect(urlFromSearch("")).toBe("");
    expect(urlFromSearch("?other=1")).toBe("");
  });

  it("builds a link that round-trips through ?url=", () => {
    const target = "https://shop.example/cart?item=4&ref=x#top";
    const link = inspectLink(target, { origin: "https://webmcpinspector.com", pathname: "/inspect/" });
    expect(link.startsWith("https://webmcpinspector.com/inspect/?url=")).toBe(true);
    expect(urlFromSearch(new URL(link).search)).toBe(target);
  });

  it("puts the inspected page in the address bar", () => {
    syncAddressBar("https://example.com/");
    expect(urlFromSearch(window.location.search)).toBe("https://example.com/");
  });
});
