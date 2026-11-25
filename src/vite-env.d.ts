/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SPACE_URL?: string;
  readonly VITE_WIDGET_KEY?: string;
  readonly VITE_SPACE_ID?: string;
  readonly VITE_AUTOMATION_KEY?: string;
  readonly VITE_MCP_URL?: string;
  readonly VITE_PLAUSIBLE_DOMAIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
