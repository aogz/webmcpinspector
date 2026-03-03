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

declare global {
  interface Window {
    webfuse: Webfuse;
  }
  const webfuse: Webfuse;
}

export {};
