import { BotIcon, UserIcon } from "lucide-react";
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

/**
 * Simple markdown-like renderer without react-markdown dependency.
 * Handles code blocks, inline code, bold, and links.
 */
const TextBlock: React.FC<{ part: TextPart }> = ({ part }) => {
  if (!part.text) return null;

  return (
    <div className="text-13 text-primary">
      <SimpleMarkdown text={part.text} />
      {part.isStreaming && (
        <span className="inline-block size-1.5 rounded-full bg-blue-500 animate-pulse ml-0.5 align-middle" />
      )}
    </div>
  );
};

/** Lightweight markdown: code blocks, inline code, bold, links, paragraphs */
function SimpleMarkdown({ text }: { text: string }) {
  // Split by code blocks first
  const parts = text.split(/(```[\s\S]*?```)/g);

  return (
    <>
      {parts.map((segment, i) => {
        if (segment.startsWith("```")) {
          // Code block
          const match = segment.match(/^```(\w*)\n?([\s\S]*?)```$/);
          const lang = match?.[1] || "";
          const code = match?.[2] || segment.slice(3, -3);
          return (
            <pre
              key={i}
              className="my-2 overflow-x-auto rounded-md border border-subtle bg-layer-2 p-2.5 font-mono text-[11px] text-secondary"
            >
              {lang && (
                <div className="mb-1 text-[10px] text-tertiary uppercase">{lang}</div>
              )}
              <code>{code}</code>
            </pre>
          );
        }
        // Inline formatting
        return <InlineText key={i} text={segment} />;
      })}
    </>
  );
}

function InlineText({ text }: { text: string }) {
  // Split into paragraphs
  const paragraphs = text.split(/\n\n+/);

  return (
    <>
      {paragraphs.map((para, i) => {
        if (!para.trim()) return null;
        return (
          <p key={i} className="my-1 whitespace-pre-wrap break-words leading-relaxed">
            {formatInline(para)}
          </p>
        );
      })}
    </>
  );
}

function formatInline(text: string): React.ReactNode[] {
  // Bold, inline code, links
  const regex = /(\*\*.*?\*\*|`[^`]+`|\[([^\]]+)\]\(([^)]+)\))/g;
  const result: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      result.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      result.push(<strong key={match.index}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      result.push(
        <code key={match.index} className="rounded bg-layer-2 px-1 py-0.5 font-mono text-[12px]">
          {token.slice(1, -1)}
        </code>
      );
    } else if (match[2] && match[3]) {
      result.push(
        <a key={match.index} href={match[3]} className="text-blue-500 underline" target="_blank" rel="noreferrer">
          {match[2]}
        </a>
      );
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) {
    result.push(text.slice(lastIndex));
  }
  return result;
}
