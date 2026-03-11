import { useState, useRef, useCallback, useEffect } from "react";
import { Send, Bot, User, Wrench, AlertTriangle, Loader2, X } from "lucide-react";
import { track } from "../analytics";
import type { FormTool, ImperativeTool } from "../types";

interface ToolCallParsed {
  name: string;
  args: Record<string, unknown>;
}

interface ChatMessage {
  role: "user" | "assistant" | "tool_call" | "tool_result" | "error";
  content: string;
  toolName?: string;
}

interface PromptPanelProps {
  forms: FormTool[];
  imperativeTools: ImperativeTool[];
  executeToolAsync: (toolName: string, args: Record<string, unknown>) => Promise<unknown>;
}

function buildSystemPrompt(forms: FormTool[], imperativeTools: ImperativeTool[]): string {
  const toolDefs: string[] = [];

  for (const form of forms) {
    if (!form.toolname) continue;
    const params: Record<string, unknown> = {};
    for (const input of form.inputs) {
      const name = input.toolparamtitle || input.name || input.id || `field_${input.index}`;
      params[name] = {
        type: input.type === "number" ? "number" : input.type === "checkbox" ? "boolean" : "string",
        description: input.toolparamdescription || input.label || name,
        required: input.required,
      };
    }
    toolDefs.push(
      `- ${form.toolname}: ${form.tooldescription || "No description"}\n` +
      `  Parameters: ${JSON.stringify(params)}`
    );
  }

  for (const tool of imperativeTools) {
    toolDefs.push(
      `- ${tool.name}: ${tool.description || "No description"}\n` +
      `  Input schema: ${JSON.stringify(tool.inputSchema)}`
    );
  }

  const toolList = toolDefs.length > 0
    ? toolDefs.join("\n\n")
    : "(No tools currently available)";

  return `You are a tool execution agent. Your ONLY job is to use the available WebMCP tools to fulfill user requests. You must NOT answer questions, have conversations, or do anything other than call tools.

Available tools:
${toolList}

When you use a tool, respond with EXACTLY this format:
<tool_call>{"name": "tool_name", "args": {"param1": "value1"}}</tool_call>

After a tool is executed, you will receive the result. You may then call another tool or briefly summarize the result.

If no available tool can fulfill the request, respond ONLY with: "No suitable tool found on this page for that request."

Do NOT answer questions from your own knowledge. Do NOT make up tool names. Only use the tools listed above.`;
}

function parseToolCall(text: string): ToolCallParsed | null {
  const match = text.match(/<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    if (typeof parsed.name === "string") {
      return { name: parsed.name, args: parsed.args || {} };
    }
  } catch { /* ignore parse errors */ }
  return null;
}

function stripToolCallTags(text: string): string {
  return text.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "").trim();
}

export default function PromptPanel({
  forms,
  imperativeTools,
  executeToolAsync,
}: PromptPanelProps) {
  const [available, setAvailable] = useState<"checking" | "available" | "downloadable" | "downloading" | "unavailable">("checking");
  const [debugInfo, setDebugInfo] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const sessionRef = useRef<LanguageModelSession | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Check Prompt API availability
  useEffect(() => {
    (async () => {
      try {
        if (typeof LanguageModel === "undefined") {
          setDebugInfo("LanguageModel global not found");
          setAvailable("unavailable");
          return;
        }
        const status = await LanguageModel.availability();
        setAvailable(status);
        if (status === "unavailable") {
          setDebugInfo("LanguageModel.availability() returned 'unavailable'");
        }
      } catch (err) {
        setDebugInfo(err instanceof Error ? err.message : String(err));
        setAvailable("unavailable");
      }
    })();
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Recreate session when tools change
  useEffect(() => {
    if (sessionRef.current) {
      sessionRef.current.destroy();
      sessionRef.current = null;
    }
  }, [forms, imperativeTools]);

  const ensureSession = useCallback(async () => {
    if (sessionRef.current) return sessionRef.current;
    const systemPrompt = buildSystemPrompt(forms, imperativeTools);
    const session = await LanguageModel.create({
      initialPrompts: [{ role: "system", content: systemPrompt }],
    });
    sessionRef.current = session;
    return session;
  }, [forms, imperativeTools]);

  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const handleSubmit = useCallback(async () => {
    const prompt = input.trim();
    if (!prompt || running) return;

    setInput("");
    setRunning(true);
    addMessage({ role: "user", content: prompt });
    track("Prompt Sent");

    try {
      const session = await ensureSession();

      let currentPrompt = prompt;
      let maxTurns = 5;

      while (maxTurns-- > 0) {
        const response = await session.prompt(currentPrompt);
        const toolCall = parseToolCall(response);
        const textPart = stripToolCallTags(response);

        if (textPart) {
          addMessage({ role: "assistant", content: textPart });
        }

        if (!toolCall) break;

        addMessage({
          role: "tool_call",
          content: JSON.stringify(toolCall.args, null, 2),
          toolName: toolCall.name,
        });

        try {
          const result = await executeToolAsync(toolCall.name, toolCall.args);
          const resultStr = JSON.stringify(result, null, 2) ?? "undefined";
          addMessage({
            role: "tool_result",
            content: resultStr,
            toolName: toolCall.name,
          });
          track("Prompt Tool Executed", { tool: toolCall.name });
          currentPrompt = `Tool "${toolCall.name}" returned:\n${resultStr}\n\nContinue responding to the user.`;
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          addMessage({
            role: "error",
            content: errMsg,
            toolName: toolCall.name,
          });
          currentPrompt = `Tool "${toolCall.name}" failed with error: ${errMsg}\n\nLet the user know and suggest alternatives.`;
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      addMessage({ role: "error", content: errMsg });
    } finally {
      setRunning(false);
    }
  }, [input, running, ensureSession, executeToolAsync, addMessage]);

  const handleClear = useCallback(() => {
    setMessages([]);
    if (sessionRef.current) {
      sessionRef.current.destroy();
      sessionRef.current = null;
    }
  }, []);

  if (available === "checking") {
    return (
      <div className="px-4 py-3 text-xs text-gray-400 flex items-center gap-1.5">
        <Loader2 className="w-3 h-3 animate-spin" /> Checking Prompt API...
      </div>
    );
  }

  if (available === "unavailable") {
    return (
      <div className="px-4 py-3 space-y-1.5">
        <div className="flex items-start gap-1.5 text-xs text-amber-600 bg-amber-50 rounded-md px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <div>
            <div>Chrome Prompt API not available.</div>
            <div className="mt-1 text-[10px] text-amber-500">Enable <code className="bg-amber-100 px-1 rounded">chrome://flags/#prompt-api-for-gemini-nano</code></div>
            {debugInfo && (
              <div className="mt-1 text-[10px] text-amber-400 font-mono">{debugInfo}</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (available === "downloadable" || available === "downloading") {
    return (
      <div className="px-4 py-3">
        <div className="flex items-start gap-1.5 text-xs text-blue-600 bg-blue-50 rounded-md px-3 py-2">
          {available === "downloading" ? (
            <>
              <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin mt-0.5" />
              <span>Downloading Gemini Nano model... This may take a few minutes.</span>
            </>
          ) : (
            <>
              <Bot className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <div>
                <div>Gemini Nano model needs to be downloaded.</div>
                <button
                  onClick={async () => {
                    setAvailable("downloading");
                    try {
                      const session = await LanguageModel.create();
                      session.destroy();
                      setAvailable("available");
                    } catch (err) {
                      setDebugInfo(err instanceof Error ? err.message : String(err));
                      setAvailable("unavailable");
                    }
                  }}
                  className="mt-1.5 px-3 py-1 text-[11px] font-medium bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors cursor-pointer"
                >
                  Download Model
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  const toolCount = forms.filter((f) => f.toolname).length + imperativeTools.length;

  return (
    <div className="flex flex-col border-t border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-indigo-50 border-b border-gray-100">
        <div className="flex items-center gap-1.5">
          <Bot className="w-3.5 h-3.5 text-indigo-600" />
          <span className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">
            Prompt API
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-600 font-medium">
            {toolCount} {toolCount === 1 ? "tool" : "tools"}
          </span>
        </div>
        {messages.length > 0 && (
          <button
            onClick={handleClear}
            className="text-[10px] text-gray-400 hover:text-gray-600 cursor-pointer flex items-center gap-0.5"
            title="Clear conversation"
          >
            <X className="w-3 h-3" /> Clear
          </button>
        )}
      </div>

      {/* Chat messages */}
      {messages.length > 0 && (
        <div className="max-h-48 overflow-y-auto px-3 py-2 space-y-2">
          {messages.map((msg, i) => (
            <MessageBubble key={i} message={msg} />
          ))}
          {running && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <Loader2 className="w-3 h-3 animate-spin" /> Thinking...
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      )}

      {/* Input */}
      <div className="px-3 py-2">
        <div className="flex gap-1.5">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder={toolCount > 0 ? "Ask Gemini to use the tools..." : "No tools available yet"}
            disabled={running}
            rows={2}
            className="flex-1 min-w-0 px-2.5 py-1.5 text-[11px] border border-gray-200 rounded-md resize-none focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 disabled:opacity-50"
          />
          <button
            onClick={handleSubmit}
            disabled={running || !input.trim()}
            className="self-end shrink-0 p-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Message Bubble ──────────────────────────────────────────────────

function MessageBubble({ message }: { message: ChatMessage }) {
  switch (message.role) {
    case "user":
      return (
        <div className="flex items-start gap-1.5">
          <User className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-gray-700">{message.content}</p>
        </div>
      );
    case "assistant":
      return (
        <div className="flex items-start gap-1.5">
          <Bot className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
          <p className="text-[11px] text-gray-700 whitespace-pre-wrap">{message.content}</p>
        </div>
      );
    case "tool_call":
      return (
        <div className="ml-5 flex items-start gap-1.5 bg-purple-50 rounded px-2 py-1.5">
          <Wrench className="w-3 h-3 text-purple-500 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="text-[10px] font-medium text-purple-700">{message.toolName}</div>
            <pre className="text-[10px] text-purple-600 overflow-x-auto">{message.content}</pre>
          </div>
        </div>
      );
    case "tool_result":
      return (
        <div className="ml-5 bg-green-50 border border-green-100 rounded px-2 py-1.5">
          <div className="text-[10px] font-medium text-green-700 mb-0.5">
            {message.toolName} result
          </div>
          <pre className="text-[10px] text-green-800 overflow-x-auto max-h-24 overflow-y-auto">
            {message.content}
          </pre>
        </div>
      );
    case "error":
      return (
        <div className="ml-5 bg-red-50 border border-red-100 rounded px-2 py-1.5">
          <div className="text-[10px] font-medium text-red-600 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            {message.toolName ? `${message.toolName} error` : "Error"}
          </div>
          <pre className="text-[10px] text-red-700 overflow-x-auto">{message.content}</pre>
        </div>
      );
  }
}
