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

const WS_URL = "wss://pi.fcla.cc/api/rpc?agent=dev";
const RECONNECT_DELAY = 3000;

let messageCounter = 0;
const nextId = () => `msg-${Date.now()}-${++messageCounter}`;

export function useAgentChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [isStreaming, setIsStreaming] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const currentAssistantId = useRef<string | null>(null);

  // --- WebSocket connection ---
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    setStatus("connecting");

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => setStatus("connected");

    ws.onclose = () => {
      setStatus("disconnected");
      setIsStreaming(false);
      currentAssistantId.current = null;
      // Auto-reconnect
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

  // --- Event handler ---
  const handleEvent = useCallback((event: RpcEvent) => {
    switch (event.type) {
      case "session_started":
        // Connection confirmed
        break;

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
  }, []);

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

      // Add user message
      const userMsg: ChatMessage = {
        id: nextId(),
        role: "user",
        timestamp: Date.now(),
        text,
        parts: [],
      };
      setMessages((prev) => [...prev, userMsg]);

      // Send prompt via RPC
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

  // --- Clear messages ---
  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  // Cleanup on unmount
  useEffect(() => () => disconnect(), [disconnect]);

  return {
    messages,
    status,
    isStreaming,
    connect,
    disconnect,
    sendMessage,
    abort,
    clearMessages,
  };
}
