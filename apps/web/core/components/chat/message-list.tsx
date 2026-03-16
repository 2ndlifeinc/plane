import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "./types";
import { Message } from "./message";

interface MessageListProps {
  messages: ChatMessage[];
}

export const MessageList: React.FC<MessageListProps> = ({ messages }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll when new messages arrive or content updates
  useEffect(() => {
    if (!autoScroll || !containerRef.current) return;
    containerRef.current.scrollTop = containerRef.current.scrollHeight;
  }, [messages, autoScroll]);

  // Detect user scroll
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  }, []);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-tertiary text-13">
        <div className="text-center space-y-1">
          <div className="text-2xl">📋</div>
          <div>할일 등록 · 현황 확인</div>
          <div className="text-[11px]">Plane 이슈 조회 · 생성 · 수정 · 현황 요약</div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto"
    >
      <div className="py-2 space-y-1">
        {messages.map((msg) => (
          <Message key={msg.id} message={msg} />
        ))}
      </div>
      {/* Scroll anchor */}
      {!autoScroll && (
        <button
          onClick={() => {
            setAutoScroll(true);
            containerRef.current?.scrollTo({
              top: containerRef.current.scrollHeight,
              behavior: "smooth",
            });
          }}
          className="sticky bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-[11px] text-white shadow-raised-100 hover:bg-primary/90 transition-colors"
        >
          ↓ Scroll to bottom
        </button>
      )}
    </div>
  );
};
