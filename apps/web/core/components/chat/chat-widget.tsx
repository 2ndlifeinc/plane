import { useState, useEffect } from "react";
import { BotIcon, XIcon, CircleIcon, Trash2Icon } from "lucide-react";
import { useAgentChat } from "./use-agent-chat";
import { MessageList } from "./message-list";
import { ChatInput } from "./chat-input";
import type { ConnectionStatus } from "./types";

const STATUS_LABELS: Record<ConnectionStatus, { label: string; color: string }> = {
  disconnected: { label: "Disconnected", color: "bg-red-500" },
  connecting: { label: "Connecting...", color: "bg-amber-500 animate-pulse" },
  connected: { label: "Connected", color: "bg-green-500" },
};

export const ChatWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { messages, status, isStreaming, connect, disconnect, sendMessage, abort, clearMessages } =
    useAgentChat();

  // Connect when panel opens
  useEffect(() => {
    if (isOpen && status === "disconnected") {
      connect();
    }
  }, [isOpen, status, connect]);

  // Keyboard shortcut: Ctrl+Shift+K to toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "K") {
        e.preventDefault();
        setIsOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const statusConfig = STATUS_LABELS[status];

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-5 right-5 z-[9999] flex size-12 items-center justify-center rounded-full bg-primary text-white shadow-lg hover:bg-primary/90 transition-all hover:scale-105 active:scale-95"
          title="Chat with Dev Agent (Ctrl+Shift+K)"
        >
          <BotIcon className="size-5" />
          {isStreaming && (
            <span className="absolute -top-0.5 -right-0.5 flex size-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex size-3 rounded-full bg-blue-500" />
            </span>
          )}
        </button>
      )}

      {/* Chat Panel */}
      {isOpen && (
        <div className="fixed bottom-5 right-5 z-[9999] flex flex-col w-[420px] h-[600px] rounded-xl border border-subtle bg-layer-1 shadow-lg overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-subtle bg-layer-2">
            <div className="flex items-center gap-2">
              <div className="flex size-6 items-center justify-center rounded-full bg-blue-500 text-white">
                <BotIcon className="size-3.5" />
              </div>
              <div>
                <div className="text-13 font-medium text-primary">Dev Agent</div>
                <div className="flex items-center gap-1.5 text-[10px] text-tertiary">
                  <span className={`inline-block size-1.5 rounded-full ${statusConfig.color}`} />
                  {statusConfig.label}
                  {isStreaming && (
                    <span className="text-blue-500 font-medium">• Streaming</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {/* Clear button */}
              <button
                onClick={clearMessages}
                className="flex size-7 items-center justify-center rounded-md text-tertiary hover:bg-layer-transparent-hover hover:text-secondary transition-colors"
                title="Clear messages"
              >
                <Trash2Icon className="size-3.5" />
              </button>
              {/* Reconnect button */}
              {status === "disconnected" && (
                <button
                  onClick={connect}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-tertiary hover:bg-layer-transparent-hover hover:text-secondary transition-colors"
                >
                  <CircleIcon className="size-2.5" />
                  Reconnect
                </button>
              )}
              {/* Close button */}
              <button
                onClick={() => setIsOpen(false)}
                className="flex size-7 items-center justify-center rounded-md text-tertiary hover:bg-layer-transparent-hover hover:text-secondary transition-colors"
                title="Close (Ctrl+Shift+K)"
              >
                <XIcon className="size-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <MessageList messages={messages} />

          {/* Input */}
          <ChatInput
            onSend={sendMessage}
            onAbort={abort}
            isStreaming={isStreaming}
            disabled={status !== "connected"}
          />
        </div>
      )}
    </>
  );
};
