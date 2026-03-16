import { useEffect, useState } from "react";
import {
  PlusIcon,
  PlayIcon,
  ClockIcon,
  MessageSquareIcon,
  CpuIcon,
  TagIcon,
  LoaderIcon,
} from "lucide-react";

interface SessionInfo {
  filename: string;
  path: string;
  date: string;
  id: string;
  size: number;
  label: string;
  firstUserMessage: string;
  lastUserMessage: string;
  model: string;
  messageCount: number;
  totalCost: number;
}

export interface SessionSelection {
  sessionPath?: string;
  continueSession?: boolean;
}

interface SessionPickerProps {
  agentName: string;
  onSelect: (opts: SessionSelection) => void;
}

const API_BASE = "https://pi.fcla.cc";

function formatDate(dateStr: string): string {
  try {
    const iso = dateStr.replace(
      /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-\d+Z$/,
      "$1T$2:$3:$4Z"
    );
    return new Date(iso).toLocaleString("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return dateStr;
  }
}

function timeAgo(dateStr: string): string {
  try {
    const iso = dateStr.replace(
      /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-\d+Z$/,
      "$1T$2:$3:$4Z"
    );
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return "방금";
    if (mins < 60) return `${mins}분 전`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}시간 전`;
    return `${Math.floor(hours / 24)}일 전`;
  } catch {
    return "";
  }
}

function shortModel(model: string): string {
  if (!model) return "";
  return model.replace(/^claude-/, "").replace(/-\d{8}$/, "").replace(/-\d+$/, "");
}

export const SessionPicker: React.FC<SessionPickerProps> = ({ agentName, onSelect }) => {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/agents/${encodeURIComponent(agentName)}/sessions`)
      .then((r) => r.json())
      .then((data) => {
        setSessions(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [agentName]);

  const latest = sessions[0];

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-tertiary text-13">
        <LoaderIcon className="size-4 animate-spin mr-2" />
        세션 로딩...
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-3 py-3">
      <div className="space-y-2">
        {/* New session */}
        <button
          onClick={() => onSelect({})}
          className="flex w-full items-center gap-3 rounded-lg border-2 border-dashed border-subtle p-3 hover:border-primary/30 hover:bg-layer-transparent-hover transition-all group"
        >
          <div className="flex size-8 items-center justify-center rounded-full bg-primary text-white group-hover:scale-105 transition-transform">
            <PlusIcon className="size-4" />
          </div>
          <div className="text-left">
            <div className="text-13 font-medium text-primary">새 세션</div>
            <div className="text-[11px] text-tertiary">새로운 대화 시작</div>
          </div>
        </button>

        {/* Continue last */}
        {latest && (
          <button
            onClick={() => onSelect({ continueSession: true })}
            className="flex w-full items-center gap-3 rounded-lg border border-green-500/30 bg-green-500/5 p-3 hover:border-green-500/50 hover:bg-green-500/10 transition-all group"
          >
            <div className="flex size-8 items-center justify-center rounded-full bg-green-500/20 text-green-600 group-hover:scale-105 transition-transform">
              <PlayIcon className="size-4" />
            </div>
            <div className="flex-1 text-left min-w-0">
              <div className="text-13 font-medium text-green-600">이어서 대화</div>
              {latest.label && (
                <div className="flex items-center gap-1 mt-0.5">
                  <TagIcon className="size-2.5 text-amber-500" />
                  <span className="text-[11px] text-amber-500 font-medium">{latest.label}</span>
                </div>
              )}
              <p className="text-[11px] text-secondary truncate mt-0.5">
                {latest.lastUserMessage || latest.firstUserMessage || "빈 세션"}
              </p>
              <SessionMeta s={latest} />
            </div>
          </button>
        )}

        {/* Divider */}
        {sessions.length > 0 && (
          <div className="flex items-center gap-2 pt-1">
            <div className="h-px flex-1 bg-subtle" />
            <span className="text-[10px] text-tertiary">최근 세션 ({sessions.length})</span>
            <div className="h-px flex-1 bg-subtle" />
          </div>
        )}

        {/* Session list */}
        {sessions.length === 0 ? (
          <div className="text-center text-tertiary text-13 py-6">이전 세션 없음</div>
        ) : (
          <div className="space-y-1.5">
            {sessions.map((s) => (
              <button
                key={s.id + s.path}
                onClick={() => onSelect({ sessionPath: s.path })}
                className={`flex w-full items-start gap-2.5 rounded-lg border p-2.5 transition-all text-left ${
                  s.label
                    ? "border-amber-500/20 hover:border-amber-500/40 hover:bg-amber-500/5"
                    : "border-subtle hover:bg-layer-transparent-hover"
                }`}
              >
                <ClockIcon className="size-3.5 shrink-0 text-tertiary mt-0.5" />
                <div className="flex-1 min-w-0">
                  {s.label && (
                    <div className="flex items-center gap-1 mb-0.5">
                      <TagIcon className="size-2.5 text-amber-500" />
                      <span className="text-[11px] text-amber-500 font-medium">{s.label}</span>
                    </div>
                  )}
                  <p className="text-13 font-medium text-primary truncate">
                    {s.lastUserMessage || s.firstUserMessage || "빈 세션"}
                  </p>
                  {s.firstUserMessage && s.lastUserMessage && s.firstUserMessage !== s.lastUserMessage && (
                    <p className="text-[11px] text-tertiary truncate mt-0.5">
                      시작: {s.firstUserMessage}
                    </p>
                  )}
                  <SessionMeta s={s} />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

function SessionMeta({ s }: { s: SessionInfo }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0 text-[10px] text-tertiary mt-1">
      <span>{formatDate(s.date)}</span>
      <span className="opacity-40">·</span>
      <span>{timeAgo(s.date)}</span>
      {s.messageCount > 0 && (
        <>
          <span className="opacity-40">·</span>
          <span className="flex items-center gap-0.5">
            <MessageSquareIcon className="size-2.5" /> {s.messageCount}
          </span>
        </>
      )}
      {s.model && (
        <>
          <span className="opacity-40">·</span>
          <span className="flex items-center gap-0.5">
            <CpuIcon className="size-2.5" /> {shortModel(s.model)}
          </span>
        </>
      )}
    </div>
  );
}
