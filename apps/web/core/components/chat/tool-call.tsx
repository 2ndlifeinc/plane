import { useState } from "react";
import {
  CheckCircleIcon,
  ChevronDownIcon,
  CircleIcon,
  ClockIcon,
  LoaderIcon,
  WrenchIcon,
  XCircleIcon,
} from "lucide-react";
import type { ToolCallPart, ToolCallState } from "./types";

interface ToolCallProps {
  part: ToolCallPart;
}

const STATE_CONFIG: Record<ToolCallState, { label: string; icon: React.ReactNode; color: string }> = {
  streaming: {
    label: "Pending",
    icon: <CircleIcon className="size-3.5" />,
    color: "text-tertiary",
  },
  calling: {
    label: "Running",
    icon: <ClockIcon className="size-3.5 animate-pulse" />,
    color: "text-amber-500",
  },
  executing: {
    label: "Executing",
    icon: <LoaderIcon className="size-3.5 animate-spin" />,
    color: "text-blue-500",
  },
  completed: {
    label: "Completed",
    icon: <CheckCircleIcon className="size-3.5" />,
    color: "text-green-600",
  },
  error: {
    label: "Error",
    icon: <XCircleIcon className="size-3.5" />,
    color: "text-red-600",
  },
};

function truncate(text: string, maxLen: number) {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + `\n... (${text.length - maxLen} chars truncated)`;
}

export const ToolCall: React.FC<ToolCallProps> = ({ part }) => {
  const [isOpen, setIsOpen] = useState(false);
  const config = STATE_CONFIG[part.state];

  // Friendly tool name display
  const displayName = part.toolName || "tool";
  const argsPreview = getArgsPreview(part.toolName, part.args);

  return (
    <div className="mb-2 rounded-md border border-subtle overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-layer-transparent-hover transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <WrenchIcon className="size-3.5 text-tertiary shrink-0" />
          <span className="text-13 font-medium truncate">{displayName}</span>
          {argsPreview && (
            <span className="text-[11px] text-tertiary truncate">{argsPreview}</span>
          )}
          {/* Status badge */}
          <span
            className={`inline-flex items-center gap-1 rounded-full border border-subtle px-1.5 py-0.5 text-[10px] font-medium ${config.color}`}
          >
            {config.icon}
            {config.label}
          </span>
        </div>
        <ChevronDownIcon
          className={`size-3.5 text-tertiary shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {/* Content */}
      {isOpen && (
        <div className="border-t border-subtle">
          {/* Parameters */}
          {Object.keys(part.args).length > 0 && (
            <div className="px-3 py-2 space-y-1">
              <div className="text-[10px] font-medium uppercase tracking-wide text-tertiary">
                Parameters
              </div>
              <pre className="overflow-x-auto rounded bg-layer-2 p-2 font-mono text-[11px] text-secondary">
                {truncate(JSON.stringify(part.args, null, 2), 2000)}
              </pre>
            </div>
          )}

          {/* Result */}
          {part.result !== undefined && (
            <div className="px-3 py-2 space-y-1 border-t border-subtle">
              <div className="text-[10px] font-medium uppercase tracking-wide text-tertiary">
                {part.isError ? "Error" : "Result"}
              </div>
              <pre
                className={`overflow-x-auto rounded p-2 font-mono text-[11px] ${
                  part.isError
                    ? "bg-red-500/10 text-red-600"
                    : "bg-layer-2 text-secondary"
                }`}
              >
                {truncate(part.result, 3000)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

function getArgsPreview(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case "Read":
    case "read":
      return typeof args.path === "string" ? args.path : "";
    case "Bash":
    case "bash":
      return typeof args.command === "string" ? args.command.slice(0, 60) : "";
    case "Edit":
    case "edit":
      return typeof args.path === "string" ? args.path : "";
    case "Write":
    case "write":
      return typeof args.path === "string" ? args.path : "";
    default:
      return "";
  }
}
