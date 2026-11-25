// Drives a Webfuse session embedded straight from its Space link, without the Webfuse widget.
// The session page answers the same postMessage API the widget uses (see cobro's
// assets/js/jsapi/widgetSession.ts and src/session_ui/app/postmessageui/), and because the
// inspector owns the iframe, it can grant the `tools` permission Chrome needs for WebMCP.

export interface SessionTab {
  ssid: number;
  url: string;
  title?: string;
  active?: boolean;
  isMediaSharing?: boolean;
}

interface Incoming {
  type?: string;
  params?: Record<string, unknown> & { event_type?: string; msg?: unknown; target?: string };
}

type Listener = (params: Record<string, unknown>) => void;

// `tools` lets the page use the browser's own WebMCP; the rest matches what the widget grants.
export const SESSION_FRAME_ALLOW =
  "tools *; clipboard-read; clipboard-write; fullscreen; microphone; camera; display-capture; encrypted-media; autoplay";

const READY_TIMEOUT_MS = 30_000;
const REQUEST_TIMEOUT_MS = 15_000;

export class SessionFrame {
  readonly spaceUrl: string;
  readonly origin: string;
  sessionId = "";
  private frame: HTMLIFrameElement | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private onWindowMessage = (event: MessageEvent) => this.receive(event);

  constructor(spaceUrl: string) {
    this.spaceUrl = spaceUrl;
    this.origin = new URL(spaceUrl).origin;
  }

  get sessionLink(): string {
    return this.sessionId ? new URL(`/${this.sessionId}`, this.origin).href : this.spaceUrl;
  }

  get slug(): string {
    return decodeURIComponent((new URL(this.spaceUrl).pathname.match(/\+([^/]+)/) ?? [])[1] ?? "");
  }

  on(event: string, listener: Listener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
    return () => this.listeners.get(event)?.delete(listener);
  }

  private emit(event: string, params: Record<string, unknown>) {
    this.listeners.get(event)?.forEach((l) => l(params));
  }

  /** Loads the Space link into `frame`, which starts a new session, and resolves once it answers. */
  async start(frame: HTMLIFrameElement): Promise<void> {
    this.frame = frame;
    window.addEventListener("message", this.onWindowMessage);
    frame.allow = SESSION_FRAME_ALLOW;
    frame.src = this.spaceUrl;
    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const info = await this.request<{ sessionId?: string }>(
        "get_session_info",
        {},
        (m) => m.type === "widget_message" && m.params?.msg === "get_session_info",
        (m) => (m.params?.sessionInfo ?? {}) as { sessionId?: string },
        700,
      ).catch(() => null);
      if (info?.sessionId) {
        this.sessionId = info.sessionId;
        return;
      }
    }
    throw new Error("The Webfuse session did not start.");
  }

  stop() {
    window.removeEventListener("message", this.onWindowMessage);
    this.listeners.clear();
  }

  private post(data: Record<string, unknown>) {
    this.frame?.contentWindow?.postMessage({ sessionId: this.sessionId || undefined, ...data }, this.origin);
  }

  private request<T>(
    cmd: string,
    params: Record<string, unknown>,
    matches: (m: Incoming) => boolean,
    pick: (m: Incoming) => T,
    timeoutMs = REQUEST_TIMEOUT_MS,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        window.removeEventListener("message", handler);
        reject(new Error(`No answer to ${cmd}`));
      }, timeoutMs);
      const handler = (event: MessageEvent) => {
        if (!this.isFromSession(event)) return;
        const data = (event.data ?? {}) as Incoming;
        if (!matches(data)) return;
        window.clearTimeout(timer);
        window.removeEventListener("message", handler);
        resolve(pick(data));
      };
      window.addEventListener("message", handler);
      this.post({ type: "api_request", params: { cmd, ...params } });
    });
  }

  private isFromSession(event: MessageEvent) {
    return !!this.frame && event.source === this.frame.contentWindow && event.origin === this.origin;
  }

  private receive(event: MessageEvent) {
    if (!this.isFromSession(event)) return;
    const data = (event.data ?? {}) as Incoming;
    const params = data.params ?? {};
    if (data.type === "widget_message" && params.target === "user") {
      this.emit("message", params);
    } else if ((data.type === "cobro_event" || data.type === "widget_event") && typeof params.event_type === "string") {
      this.emit(params.event_type, params);
    }
  }

  getTabs(): Promise<SessionTab[]> {
    return this.request(
      "get_session_tabs",
      {},
      (m) => m.type === "widget_message" && m.params?.msg === "get_session_tabs",
      (m) => ((m.params?.tabs as SessionTab[] | undefined) ?? []),
    );
  }

  openTab(url: string): Promise<unknown> {
    return this.request("open_tab", { url }, (m) => m.params?.event_type === "tab_opened", (m) => m.params);
  }

  relocateTab(url: string, ssid?: number): Promise<unknown> {
    return this.request("relocate_tab", { url, ssid }, (m) => m.params?.event_type === "tab_relocated", (m) => m.params);
  }

  closeTab(ssid: number) {
    this.post({ type: "api_request", params: { cmd: "close_tab", ssid } });
  }

  activateTab(ssid: number) {
    this.post({ type: "api_request", params: { cmd: "activate_tab", ssid } });
  }

  end() {
    this.post({ type: "api_request", params: { cmd: "end" } });
  }

  /** Delivers `message` to the page's `webfuse.currentSession.on("message")` listeners. */
  sendMessage(message: unknown) {
    this.post({
      type: "widget_message",
      params: { target: "user", msg: message, srcOrigin: window.location.origin, targetOrigin: "*" },
    });
  }
}
