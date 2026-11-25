import type {
  ExecuteOutcome,
  FormAttrUpdate,
  InjectedToolDef,
  LifecycleEvent,
  PageSnapshot,
} from "./types";

/** Bump when a message changes shape. The app warns when the Space runs an older extension. */
export const PROTOCOL_VERSION = 2;

export type AppToPage =
  | { type: "webmcp:hello" }
  | { type: "webmcp:scan"; animate?: boolean }
  | { type: "webmcp:highlight"; formKey: string }
  | { type: "webmcp:set-attrs"; updates: FormAttrUpdate[]; augmented: boolean }
  | { type: "webmcp:execute"; requestId: string; toolName: string; args: Record<string, unknown>; timeoutMs: number }
  | { type: "webmcp:cancel"; requestId: string }
  | { type: "webmcp:inject-tool"; tool: InjectedToolDef }
  | { type: "webmcp:remove-injected"; id: string }
  | { type: "webmcp:session-info" };

export type PageToApp =
  | { type: "webmcp:snapshot"; snapshot: PageSnapshot }
  | { type: "webmcp:lifecycle"; events: LifecycleEvent[] }
  | { type: "webmcp:execute-result"; outcome: ExecuteOutcome }
  | { type: "webmcp:inject-result"; id: string; ok: boolean; error?: string }
  | { type: "webmcp:session-info"; sessionId: string };

export type Envelope<T> = T & { v: number };

export function envelope<T extends { type: string }>(msg: T): Envelope<T> {
  return { ...msg, v: PROTOCOL_VERSION };
}

/** The Widget API and the in-session API wrap messages differently; find ours wherever it sits. */
export function unwrapMessage(args: unknown[]): Record<string, unknown> | null {
  const queue: unknown[] = [...args];
  for (let depth = 0; queue.length && depth < 12; depth++) {
    const item = queue.shift();
    if (typeof item === "string") {
      if (item.startsWith("{") && item.includes("webmcp:")) {
        try {
          queue.push(JSON.parse(item));
        } catch {
          // Not ours.
        }
      }
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    if (typeof obj.type === "string" && obj.type.startsWith("webmcp:")) return obj;
    for (const key of ["data", "message", "payload", "msg"]) {
      if (obj[key] !== undefined) queue.push(obj[key]);
    }
  }
  return null;
}
