// Chat Widget Types — Pi RPC Protocol mapping

export type ConnectionStatus = "disconnected" | "connecting" | "connected";

// --- Message types for Chat UI ---

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  timestamp: number;
  // For user messages
  text?: string;
  // For assistant messages
  parts: MessagePart[];
  // Model info (assistant only)
  model?: string;
  isStreaming?: boolean;
}

export type MessagePart = TextPart | ThinkingPart | ToolCallPart;

export interface TextPart {
  type: "text";
  text: string;
  isStreaming?: boolean;
}

export interface ThinkingPart {
  type: "thinking";
  text: string;
  isStreaming?: boolean;
  duration?: number;
}

export interface ToolCallPart {
  type: "toolCall";
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  state: ToolCallState;
  result?: string;
  isError?: boolean;
}

export type ToolCallState =
  | "streaming"    // toolcall_start + delta received
  | "calling"      // toolcall_end, waiting for execution
  | "executing"    // tool_execution_start received
  | "completed"    // tool_execution_end received (success)
  | "error";       // tool_execution_end received (isError)

// --- Pi RPC event types (subset needed for chat) ---

export interface RpcEvent {
  type: string;
  [key: string]: unknown;
}

export interface MessageUpdateEvent extends RpcEvent {
  type: "message_update";
  message: {
    role: "assistant";
    content: AssistantContentBlock[];
    model?: string;
  };
  assistantMessageEvent: AssistantDelta;
}

export type AssistantContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | { type: "toolCall"; id: string; name: string; arguments: Record<string, unknown> };

export type AssistantDelta =
  | { type: "start" }
  | { type: "text_start"; contentIndex: number }
  | { type: "text_delta"; contentIndex: number; delta: string }
  | { type: "text_end"; contentIndex: number; content: string }
  | { type: "thinking_start"; contentIndex: number }
  | { type: "thinking_delta"; contentIndex: number; delta: string }
  | { type: "thinking_end"; contentIndex: number }
  | { type: "toolcall_start"; contentIndex: number; partial: { id?: string; name?: string } }
  | { type: "toolcall_delta"; contentIndex: number; delta: string }
  | { type: "toolcall_end"; contentIndex: number; toolCall: { id: string; name: string; arguments: Record<string, unknown> } }
  | { type: "done"; reason: string }
  | { type: "error"; reason: string };

export interface ToolExecutionStartEvent extends RpcEvent {
  type: "tool_execution_start";
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

export interface ToolExecutionUpdateEvent extends RpcEvent {
  type: "tool_execution_update";
  toolCallId: string;
  toolName: string;
  partialResult?: {
    content: { type: string; text: string }[];
  };
}

export interface ToolExecutionEndEvent extends RpcEvent {
  type: "tool_execution_end";
  toolCallId: string;
  toolName: string;
  result: {
    content: { type: string; text: string }[];
  };
  isError: boolean;
}
