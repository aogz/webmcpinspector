interface WebfuseTab {
  ssid: number;
  url: string;
  title: string;
}

interface WebfuseSession {
  sessionLink: string;
  started: boolean;
  node: HTMLIFrameElement;
  start(selector?: string): Promise<void>;
  openTab(url: string): Promise<WebfuseTab>;
  closeTab(ssid: number): void;
  getTabs(): Promise<WebfuseTab[]>;
  getActiveTab(): Promise<WebfuseTab>;
  relocateTab(newUrl: string, ssid?: number): void;
  end(redirectUrl?: string): void;
  on(eventName: string, callback: (...args: unknown[]) => void): WebfuseSession;
  sendMessage(message: unknown, targetOrigin: string): void;
  broadcastMessage(message: unknown): void;
}

interface WebfuseSpace {
  id: string;
  slug: string;
  session(options?: object, link?: string, sessionId?: string): WebfuseSession;
  button(settings?: { position?: string }): object;
}

interface Webfuse {
  isInsideSession: boolean;
  currentSession: WebfuseSession | null;
  initSpace(
    widgetKey: string,
    spaceId: string,
    integrationSettings?: object
  ): Promise<WebfuseSpace>;
  listSessions(): WebfuseSession[];
  on(eventName: string, callback: (...args: unknown[]) => void): Webfuse;
}

interface LanguageModelSession {
  prompt(input: string, options?: { signal?: AbortSignal }): Promise<string>;
  promptStreaming(input: string, options?: { signal?: AbortSignal }): ReadableStream<string>;
  destroy(): void;
}

interface LanguageModelPrompt {
  role: "system" | "user" | "assistant";
  content: string;
}

interface LanguageModelCreateOptions {
  initialPrompts?: LanguageModelPrompt[];
  temperature?: number;
  topK?: number;
  expectedInputs?: Array<{ type: string; languages?: string[] }>;
  expectedOutputs?: Array<{ type: string; languages?: string[] }>;
}

interface LanguageModelAPI {
  availability(options?: LanguageModelCreateOptions): Promise<"available" | "downloadable" | "downloading" | "unavailable">;
  create(options?: LanguageModelCreateOptions): Promise<LanguageModelSession>;
}

declare global {
  interface Window {
    webfuse: Webfuse;
  }
  const webfuse: Webfuse;
  const LanguageModel: LanguageModelAPI;
}

export {};
