import type { FormAttrUpdate, InjectedToolDef } from "../shared/types";

// Storage can throw in private windows or when site data is blocked; the inspector works without it.
export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Nothing to do; the value lives for this page view only.
  }
}

const KEYS = {
  overrides: "webmcp-inspector:overrides",
  legacyOverrides: "webmcp-overrides",
  injected: "webmcp-inspector:injected",
  lastUrl: "webmcp-last-url",
  urlHistory: "webmcp-url-history",
  titles: "webmcp-page-titles",
  automationKey: "webmcp-inspector:automation-key",
  theme: "webmcp-inspector:theme",
  prefs: "webmcp-inspector:prefs",
  models: "webmcp-inspector:models",
  evals: "webmcp-inspector:evals",
};
export { KEYS as STORAGE_KEYS };

/** Pages are keyed without hash, trailing slash or query, so tracking parameters do not split them. */
export function pageKey(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return url.trim().replace(/\/+$/, "");
  }
}

export interface SavedOverride extends FormAttrUpdate {
  label?: string;
  savedAt: number;
}

type OverrideStore = Record<string, SavedOverride[]>;

interface LegacyOverride {
  formId: string;
  attributes: Record<string, string>;
  inputs: Record<string, Record<string, string>>;
}

/** Converts overrides saved by inspector 1.x, which keyed forms by id, name or action. */
function migrateLegacy(): OverrideStore {
  const legacy = readJson<Record<string, LegacyOverride[]>>(KEYS.legacyOverrides, {});
  const out: OverrideStore = {};
  for (const [url, list] of Object.entries(legacy)) {
    const converted = list.flatMap((o): SavedOverride[] => {
      if (/^Form #\d+$/.test(o.formId)) return [];
      const formKey = o.formId.startsWith("/") || o.formId.includes("://") ? `form[action="${o.formId}"]:0` : `#${o.formId}`;
      const fields: SavedOverride["fields"] = {};
      for (const [key, attrs] of Object.entries(o.inputs ?? {})) {
        if (attrs.toolparamdescription) fields[key] = { toolparamdescription: attrs.toolparamdescription };
      }
      return [{
        formKey,
        label: o.formId,
        form: {
          toolname: o.attributes.toolname ?? null,
          tooldescription: o.attributes.tooldescription ?? null,
          toolautosubmit: o.attributes.toolautosubmit ?? null,
        },
        fields,
        savedAt: Date.now(),
      }];
    });
    if (converted.length) out[pageKey(url)] = converted;
  }
  return out;
}

export function loadOverrides(): OverrideStore {
  const current = readJson<OverrideStore | null>(KEYS.overrides, null);
  if (current) return current;
  const migrated = migrateLegacy();
  writeJson(KEYS.overrides, migrated);
  return migrated;
}

export function overridesFor(url: string): SavedOverride[] {
  return loadOverrides()[pageKey(url)] ?? [];
}

export function saveOverride(url: string, override: SavedOverride) {
  const all = loadOverrides();
  const key = pageKey(url);
  const list = (all[key] ?? []).filter((o) => o.formKey !== override.formKey);
  all[key] = [...list, override];
  writeJson(KEYS.overrides, all);
}

export function removeOverride(url: string, formKey: string) {
  const all = loadOverrides();
  const key = pageKey(url);
  all[key] = (all[key] ?? []).filter((o) => o.formKey !== formKey);
  if (!all[key].length) delete all[key];
  writeJson(KEYS.overrides, all);
}

export function replaceAllOverrides(store: OverrideStore) {
  writeJson(KEYS.overrides, store);
}

export interface SavedInjected extends InjectedToolDef {
  enabled: boolean;
}

export function injectedFor(url: string): SavedInjected[] {
  return readJson<Record<string, SavedInjected[]>>(KEYS.injected, {})[pageKey(url)] ?? [];
}

export function saveInjected(url: string, list: SavedInjected[]) {
  const all = readJson<Record<string, SavedInjected[]>>(KEYS.injected, {});
  if (list.length) all[pageKey(url)] = list;
  else delete all[pageKey(url)];
  writeJson(KEYS.injected, all);
}

export const DEFAULT_URLS = [
  "https://googlechromelabs.github.io/webmcp-tools/demos/french-bistro/",
  "https://googlechromelabs.github.io/webmcp-tools/demos/react-flightsearch/",
];

export function loadUrlHistory(): string[] {
  const saved = readJson<string[]>(KEYS.urlHistory, []);
  return [...saved, ...DEFAULT_URLS.filter((u) => !saved.includes(u))];
}

export function addUrlToHistory(url: string): string[] {
  const history = [url, ...loadUrlHistory().filter((u) => u !== url)].slice(0, 50);
  writeJson(KEYS.urlHistory, history);
  return history;
}

export function loadTitles(): Record<string, string> {
  return readJson<Record<string, string>>(KEYS.titles, {});
}

export function saveTitle(url: string, title: string): Record<string, string> {
  const titles = loadTitles();
  titles[pageKey(url)] = title;
  writeJson(KEYS.titles, titles);
  return titles;
}

export function readString(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

export function writeString(key: string, value: string) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // Kept in memory only.
  }
}
