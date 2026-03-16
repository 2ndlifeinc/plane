import { BotIcon, UserIcon } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { ChatMessage, TextPart, ThinkingPart, ToolCallPart } from "./types";
import { Reasoning } from "./reasoning";
import { ToolCall } from "./tool-call";

interface MessageProps {
  message: ChatMessage;
}

export const Message: React.FC<MessageProps> = ({ message }) => {
  if (message.role === "user") {
    return <UserMessage message={message} />;
  }
  return <AssistantMessage message={message} />;
};

const UserMessage: React.FC<MessageProps> = ({ message }) => (
  <div className="flex gap-2.5 px-3 py-2">
    <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-white">
      <UserIcon className="size-3.5" />
    </div>
    <div className="min-w-0 flex-1 pt-0.5">
      <div className="text-13 text-primary whitespace-pre-wrap break-words">
        {message.text}
      </div>
    </div>
  </div>
);

const AssistantMessage: React.FC<MessageProps> = ({ message }) => (
  <div className="flex gap-2.5 px-3 py-2">
    <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-blue-500 text-white">
      <BotIcon className="size-3.5" />
    </div>
    <div className="min-w-0 flex-1 pt-0.5 space-y-1">
      {message.parts.map((part, i) => {
        switch (part.type) {
          case "thinking":
            return <Reasoning key={i} part={part as ThinkingPart} />;
          case "text":
            return <TextBlock key={i} part={part as TextPart} />;
          case "toolCall":
            return <ToolCall key={i} part={part as ToolCallPart} />;
          default:
            return null;
        }
      })}
      {message.isStreaming && message.parts.length === 0 && (
        <div className="flex items-center gap-1.5 text-[11px] text-tertiary">
          <span className="inline-block size-1.5 rounded-full bg-blue-500 animate-pulse" />
          Thinking...
        </div>
      )}
    </div>
  </div>
);

const TextBlock: React.FC<{ part: TextPart }> = ({ part }) => {
  if (!part.text) return null;

  return (
    <div className="text-13 text-primary prose prose-sm max-w-none prose-pre:bg-layer-2 prose-pre:border prose-pre:border-subtle prose-pre:text-[11px] prose-code:text-[12px] prose-code:before:content-none prose-code:after:content-none">
      <ReactMarkdown>{part.text}</ReactMarkdown>
      {part.isStreaming && (
        <span className="inline-block size-1.5 rounded-full bg-blue-500 animate-pulse ml-0.5 align-middle" />
      )}
    </div>
  );
};
