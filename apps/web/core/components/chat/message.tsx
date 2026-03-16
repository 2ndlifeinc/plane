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

/** Lightweight markdown: code blocks, tables, inline code, bold, links, paragraphs */
function SimpleMarkdown({ text }: { text: string }) {
  // Split by code blocks first
  const parts = text.split(/(```[\s\S]*?```)/g);

  return (
    <>
      {parts.map((segment, i) => {
        if (segment.startsWith("```")) {
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
        return <BlockContent key={i} text={segment} />;
      })}
    </>
  );
}

/** Parse block-level elements: tables, headings, lists, paragraphs */
function BlockContent({ text }: { text: string }) {
  const blocks = text.split(/\n\n+/);
  const result: React.ReactNode[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i].trim();
    if (!block) continue;

    // Table detection: lines starting with |
    const lines = block.split("\n");
    if (lines.length >= 2 && lines[0].includes("|") && lines[1].match(/^\|?\s*[-:]+/)) {
      result.push(<MarkdownTable key={i} lines={lines} />);
      continue;
    }

    // Heading detection
    const headingMatch = block.match(/^(#{1,4})\s+(.+)$/m);
    if (headingMatch && block.split("\n").length === 1) {
      const level = headingMatch[1].length;
      const cls = level <= 2 ? "text-[14px] font-semibold" : "text-13 font-medium";
      result.push(
        <div key={i} className={`my-1.5 ${cls} text-primary`}>
          {formatInline(headingMatch[2])}
        </div>
      );
      continue;
    }

    // List detection
    if (lines.every((l) => l.match(/^\s*[-*•]\s|^\s*\d+[.)]\s/) || !l.trim())) {
      result.push(
        <ul key={i} className="my-1 ml-4 space-y-0.5 list-disc">
          {lines
            .filter((l) => l.trim())
            .map((l, j) => (
              <li key={j} className="text-13 leading-relaxed">
                {formatInline(l.replace(/^\s*[-*•]\s|^\s*\d+[.)]\s/, ""))}
              </li>
            ))}
        </ul>
      );
      continue;
    }

    // Regular paragraph
    result.push(
      <p key={i} className="my-1 whitespace-pre-wrap break-words leading-relaxed">
        {formatInline(block)}
      </p>
    );
  }

  return <>{result}</>;
}

/** Render a markdown table */
function MarkdownTable({ lines }: { lines: string[] }) {
  const parseRow = (line: string) =>
    line
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());

  const headers = parseRow(lines[0]);
  // Skip separator line (lines[1])
  const rows = lines.slice(2).map(parseRow);

  return (
    <div className="my-2 overflow-x-auto rounded-md border border-subtle">
      <table className="w-full text-13">
        <thead>
          <tr className="border-b border-subtle bg-layer-2">
            {headers.map((h, i) => (
              <th
                key={i}
                className="px-2.5 py-1.5 text-left text-[11px] font-medium uppercase tracking-wide text-tertiary"
              >
                {formatInline(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-subtle last:border-b-0 hover:bg-layer-transparent-hover">
              {row.map((cell, j) => (
                <td key={j} className="px-2.5 py-1.5 text-primary">
                  {formatInline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
