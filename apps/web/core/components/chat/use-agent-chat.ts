import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ChatMessage,
  ConnectionStatus,
  MessagePart,
  MessageUpdateEvent,
  RpcEvent,
  ToolCallPart,
  ToolExecutionEndEvent,
  ToolExecutionStartEvent,
  ToolExecutionUpdateEvent,
} from "./types";

const WS_BASE = "wss://pi.fcla.cc/api/rpc?agent=team-todo";
const RECONNECT_DELAY = 3000;

let messageCounter = 0;
const nextId = () => `msg-${Date.now()}-${++messageCounter}`;

/**
 * Convert Pi RPC AgentMessage[] (from get_messages) to ChatMessage[]
 */
function convertRpcMessages(rpcMessages: unknown[]): ChatMessage[] {
  const result: ChatMessage[] = [];

  for (const msg of rpcMessages) {
    const m = msg as Record<string, unknown>;
    const role = m.role as string;
    const ts = (m.timestamp as number) || Date.now();

    if (role === "user") {
      const content = m.content;
      const text = typeof content === "string"
        ? content
        : Array.isArray(content)
          ? (content as { type: string; text?: string }[]).filter((c) => c.type === "text").map((c) => c.text).join("")
          : "";
      result.push({ id: nextId(), role: "user", timestamp: ts, text, parts: [] });
    } else if (role === "assistant") {
      const contentBlocks = (m.content as unknown[]) || [];
      const parts: MessagePart[] = [];
      for (const block of contentBlocks) {
        const b = block as Record<string, unknown>;
        if (b.type === "text" && b.text) {
          parts.push({ type: "text", text: b.text as string });
        } else if (b.type === "thinking" && b.thinking) {
          parts.push({ type: "thinking", text: b.thinking as string });
        } else if (b.type === "toolCall") {
          parts.push({
            type: "toolCall",
            toolCallId: (b.id as string) || "",
            toolName: (b.name as string) || "",
            args: (b.arguments as Record<string, unknown>) || {},
            state: "completed",
          });
        }
      }
      result.push({
        id: nextId(),
        role: "assistant",
        timestamp: ts,
        parts,
        model: m.model as string | undefined,
      });
    } else if (role === "toolResult") {
      // Attach result to the last matching tool call
      const toolCallId = m.toolCallId as string;
      const content = m.content as { type: string; text: string }[] | undefined;
      const text = content?.map((c) => c.text).join("") ?? "";
      const isError = m.isError as boolean;
      // Find last assistant message with this toolCallId
      for (let i = result.length - 1; i >= 0; i--) {
        const am = result[i];
        if (am.role !== "assistant") continue;
        const tc = am.parts.find(
          (p) => p.type === "toolCall" && (p as ToolCallPart).toolCallId === toolCallId
        ) as ToolCallPart | undefined;
        if (tc) {
          tc.result = text;
          tc.state = isError ? "error" : "completed";
          tc.isError = isError;
          break;
        }
      }
    }
  }
  return result;
}

export function useAgentChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionResumed, setSessionResumed] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const currentAssistantId = useRef<string | null>(null);
  const hasLoadedHistory = useRef(false);

  // --- Load session history via get_messages ---
  const loadSessionHistory = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || hasLoadedHistory.current) return;
    hasLoadedHistory.current = true;
    ws.send(JSON.stringify({ id: "load-history", type: "get_messages" }));
  }, []);

  // --- WebSocket connection (always continue=true) ---
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    setStatus("connecting");
    hasLoadedHistory.current = false;

    const ws = new WebSocket(`${WS_BASE}&continue=true`);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("connected");
    };

    ws.onclose = () => {
      setStatus("disconnected");
      setIsStreaming(false);
      currentAssistantId.current = null;
      reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY);
    };

    ws.onerror = () => ws.close();

    ws.onmessage = (ev) => {
      const lines = (ev.data as string).split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const event: RpcEvent = JSON.parse(line);
          handleEvent(event);
        } catch {
          // ignore non-JSON lines
        }
      }
    };
  }, []);

  const disconnect = useCallback(() => {
    clearTimeout(reconnectTimer.current);
    wsRef.current?.close();
    wsRef.current = null;
    setStatus("disconnected");
  }, []);

  // --- New session ---
  const newSession = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "new_session" }));
    setMessages([]);
    setSessionResumed(false);
    hasLoadedHistory.current = false;
  }, []);

  // --- Event handler ---
  const handleEvent = useCallback((event: RpcEvent) => {
    switch (event.type) {
      case "session_started":
        // Connection confirmed — load history
        loadSessionHistory();
        break;

      case "response": {
        const resp = event as RpcEvent & { command?: string; success?: boolean; data?: unknown };
        // Handle get_messages response
        if (resp.command === "get_messages" && resp.success && resp.data) {
          const data = resp.data as { messages?: unknown[] };
          if (data.messages && data.messages.length > 0) {
            const history = convertRpcMessages(data.messages);
            if (history.length > 0) {
              setMessages(history);
              setSessionResumed(true);
            }
          }
        }
        break;
      }

      case "agent_start":
        setIsStreaming(true);
        break;

      case "agent_end":
        setIsStreaming(false);
        currentAssistantId.current = null;
        break;

      case "message_start": {
        const msg = event.message as MessageUpdateEvent["message"];
        if (msg?.role === "assistant") {
          const id = nextId();
          currentAssistantId.current = id;
          setMessages((prev) => [
            ...prev,
            {
              id,
              role: "assistant",
              timestamp: Date.now(),
              parts: [],
              model: msg.model,
              isStreaming: true,
            },
          ]);
        }
        break;
      }

      case "message_end": {
        const assistantId = currentAssistantId.current;
        if (assistantId) {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, isStreaming: false } : m))
          );
        }
        break;
      }

      case "message_update": {
        const { assistantMessageEvent } = event as MessageUpdateEvent;
        if (!assistantMessageEvent || !currentAssistantId.current) break;
        const assistantId = currentAssistantId.current;

        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== assistantId) return m;
            const parts = [...m.parts];
            applyDelta(parts, assistantMessageEvent);
            return { ...m, parts };
          })
        );
        break;
      }

      case "tool_execution_start": {
        const { toolCallId } = event as ToolExecutionStartEvent;
        updateToolCall(toolCallId, { state: "executing" });
        break;
      }

      case "tool_execution_update": {
        const { toolCallId, partialResult } = event as ToolExecutionUpdateEvent;
        if (partialResult?.content?.length) {
          const text = partialResult.content.map((c) => c.text).join("");
          updateToolCall(toolCallId, { result: text });
        }
        break;
      }

      case "tool_execution_end": {
        const { toolCallId, result, isError } = event as ToolExecutionEndEvent;
        const text = result?.content?.map((c) => c.text).join("") ?? "";
        updateToolCall(toolCallId, {
          state: isError ? "error" : "completed",
          result: text,
          isError,
        });
        break;
      }
    }
  }, [loadSessionHistory]);

  // --- Delta application ---
  function applyDelta(parts: MessagePart[], delta: MessageUpdateEvent["assistantMessageEvent"]) {
    switch (delta.type) {
      case "text_start":
        parts.push({ type: "text", text: "", isStreaming: true });
        break;
      case "text_delta": {
        const last = parts.findLast((p) => p.type === "text");
        if (last && last.type === "text") last.text += delta.delta;
        break;
      }
      case "text_end": {
        const last = parts.findLast((p) => p.type === "text");
        if (last && last.type === "text") {
          last.text = delta.content;
          last.isStreaming = false;
        }
        break;
      }
      case "thinking_start":
        parts.push({ type: "thinking", text: "", isStreaming: true });
        break;
      case "thinking_delta": {
        const last = parts.findLast((p) => p.type === "thinking");
        if (last && last.type === "thinking") last.text += delta.delta;
        break;
      }
      case "thinking_end": {
        const last = parts.findLast((p) => p.type === "thinking");
        if (last && last.type === "thinking") last.isStreaming = false;
        break;
      }
      case "toolcall_start":
        parts.push({
          type: "toolCall",
          toolCallId: delta.partial?.id ?? "",
          toolName: delta.partial?.name ?? "",
          args: {},
          state: "streaming",
        });
        break;
      case "toolcall_end": {
        const tc = delta.toolCall;
        const last = parts.findLast((p) => p.type === "toolCall") as ToolCallPart | undefined;
        if (last) {
          last.toolCallId = tc.id;
          last.toolName = tc.name;
          last.args = tc.arguments;
          last.state = "calling";
        }
        break;
      }
    }
  }

  // --- Tool call state updater ---
  function updateToolCall(toolCallId: string, update: Partial<ToolCallPart>) {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.role !== "assistant") return m;
        const hasMatch = m.parts.some(
          (p) => p.type === "toolCall" && (p as ToolCallPart).toolCallId === toolCallId
        );
        if (!hasMatch) return m;
        return {
          ...m,
          parts: m.parts.map((p) =>
            p.type === "toolCall" && (p as ToolCallPart).toolCallId === toolCallId
              ? { ...p, ...update }
              : p
          ),
        };
      })
    );
  }

  // --- Send message ---
  const sendMessage = useCallback(
    (text: string) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

      const userMsg: ChatMessage = {
        id: nextId(),
        role: "user",
        timestamp: Date.now(),
        text,
        parts: [],
      };
      setMessages((prev) => [...prev, userMsg]);

      const cmd = isStreaming
        ? { type: "prompt", message: text, streamingBehavior: "followUp" }
        : { type: "prompt", message: text };
      wsRef.current.send(JSON.stringify(cmd));
    },
    [isStreaming]
  );

  // --- Abort ---
  const abort = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "abort" }));
  }, []);

  // --- Clear messages (new session) ---
  const clearMessages = useCallback(() => {
    newSession();
  }, [newSession]);

  // Cleanup on unmount
  useEffect(() => () => disconnect(), [disconnect]);

  return {
    messages,
    status,
    isStreaming,
    sessionResumed,
    connect,
    disconnect,
    sendMessage,
    abort,
    clearMessages,
    newSession,
  };
}
