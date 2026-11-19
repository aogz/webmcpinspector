/** The page to inspect, from `?url=` in the inspector's own address. */
export function urlFromSearch(search: string): string {
  return (new URLSearchParams(search).get("url") ?? "").trim();
}

/** A link that opens the inspector already inspecting `target`. */
export function inspectLink(target: string, location: Pick<Location, "origin" | "pathname">): string {
  return `${location.origin}${location.pathname}?url=${encodeURIComponent(target)}`;
}

/** Keeps the address bar pointing at the page being inspected, so it can be copied and shared. */
export function syncAddressBar(target: string) {
  try {
    const next = inspectLink(target, window.location);
    if (next !== window.location.href) window.history.replaceState(window.history.state, "", next);
  } catch {
    // Sandboxed or opaque origins can refuse history changes; the link still works without it.
  }
}
