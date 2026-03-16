import { useState, useEffect, useRef } from "react";
import { BrainIcon, ChevronDownIcon } from "lucide-react";
import type { ThinkingPart } from "./types";

interface ReasoningProps {
  part: ThinkingPart;
}

export const Reasoning: React.FC<ReasoningProps> = ({ part }) => {
  const [isOpen, setIsOpen] = useState(part.isStreaming ?? false);
  const [hasAutoClosed, setHasAutoClosed] = useState(false);
  const startTime = useRef<number | null>(null);
  const [duration, setDuration] = useState<number | undefined>(undefined);

  // Track duration
  useEffect(() => {
    if (part.isStreaming) {
      if (startTime.current === null) startTime.current = Date.now();
      setIsOpen(true);
    } else if (startTime.current !== null) {
      setDuration(Math.ceil((Date.now() - startTime.current) / 1000));
      startTime.current = null;
    }
  }, [part.isStreaming]);

  // Auto-close after streaming ends
  useEffect(() => {
    if (!part.isStreaming && isOpen && !hasAutoClosed) {
      const timer = setTimeout(() => {
        setIsOpen(false);
        setHasAutoClosed(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [part.isStreaming, isOpen, hasAutoClosed]);

  const label = part.isStreaming
    ? "Thinking..."
    : duration !== undefined
      ? `Thought ${duration}s`
      : "Thought";

  return (
    <div className="mb-2">
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-tertiary transition-colors hover:bg-layer-transparent-hover"
      >
        <BrainIcon className="size-3" />
        {part.isStreaming ? (
          <span className="animate-pulse">{label}</span>
        ) : (
          <span>{label}</span>
        )}
        <ChevronDownIcon
          className={`size-2.5 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>
      {isOpen && (
        <div className="mt-1.5 max-h-48 overflow-y-auto rounded-md border border-subtle bg-layer-2 p-2.5 text-[11px] leading-relaxed text-tertiary whitespace-pre-wrap">
          {part.text || (part.isStreaming ? "..." : "")}
        </div>
      )}
    </div>
  );
};
