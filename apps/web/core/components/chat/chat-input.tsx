import { useRef, useState, type KeyboardEvent } from "react";
import { SendIcon, SquareIcon } from "lucide-react";

interface ChatInputProps {
  onSend: (text: string) => void;
  onAbort: () => void;
  isStreaming: boolean;
  disabled: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  onAbort,
  isStreaming,
  disabled,
}) => {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    // Reset textarea height
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  };

  return (
    <div className="flex items-end gap-2 border-t border-subtle px-3 py-2 bg-layer-1">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        placeholder={disabled ? "Connecting..." : "Message dev agent..."}
        disabled={disabled}
        rows={1}
        className="flex-1 resize-none rounded-md border border-subtle bg-layer-2 px-3 py-2 text-13 text-primary placeholder:text-placeholder focus:outline-none focus:border-primary transition-colors disabled:opacity-50"
      />
      {isStreaming ? (
        <button
          onClick={onAbort}
          className="flex size-8 items-center justify-center rounded-md bg-red-500 text-white hover:bg-red-600 transition-colors shrink-0"
          title="Stop"
        >
          <SquareIcon className="size-3.5" />
        </button>
      ) : (
        <button
          onClick={handleSend}
          disabled={disabled || !value.trim()}
          className="flex size-8 items-center justify-center rounded-md bg-primary text-white hover:bg-primary/90 transition-colors shrink-0 disabled:opacity-30"
          title="Send"
        >
          <SendIcon className="size-3.5" />
        </button>
      )}
    </div>
  );
};
