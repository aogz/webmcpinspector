const env = import.meta.env as ImportMetaEnv & Record<string, string | undefined>;

// The old *_DEV names still work in `npm run dev`, so existing local .env files keep working.
const dev = (name: string) => (import.meta.env.DEV ? env[`${name}_DEV`] : undefined);

/** The Space link the inspector embeds; opening it starts a new session. */
export const SPACE_URL = env.VITE_SPACE_URL || dev("VITE_SPACE_URL") || "https://webfu.se/+webmcpinspector/";
// The extension running inside the page still uses the widget API, which needs these.
export const WIDGET_KEY = env.VITE_WIDGET_KEY || dev("VITE_WIDGET_KEY") || "wk_tqCYlFrDmS_UGqhLcI_Wn6Y1DDTMaTSQ";
export const SPACE_ID = env.VITE_SPACE_ID || dev("VITE_SPACE_ID") || "1798";
export const AUTOMATION_KEY = (env.VITE_AUTOMATION_KEY || "").trim();
export const MCP_URL_OVERRIDE = (env.VITE_MCP_URL || "").trim();
export const REPO_URL = "https://github.com/aogz/webmcpinspector";
