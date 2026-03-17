/**
 * 📅 타임라인 뷰 — label 기반 스윔레인 Gantt
 *
 * Plane 기본 Gantt를 label별로 그룹화하여 스윔레인 형태로 표시.
 * 각 레인은 접기/펴기 가능하고 레인 내부에서 Gantt 바를 렌더링한다.
 */

import { useState, useCallback } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { ChevronDown, ChevronRight, Tag, Calendar } from "lucide-react";
import { PriorityIcon } from "@plane/propel/icons";
import type { TIssue } from "@plane/types";
import { EIssuesStoreType, EIssueServiceType } from "@plane/types";
import { Spinner, Tooltip } from "@plane/ui";
import { cn } from "@plane/utils";
import { useIssues } from "@/hooks/store/use-issues";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useLabel } from "@/hooks/store/use-label";

// ── helpers ──

function getDaysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  const now = new Date();
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

/** 타임라인 범위 (일 단위) 계산 */
function getTimelineRange(issues: TIssue[]) {
  const dates = issues.flatMap((i) => {
    const d: number[] = [];
    if (i.start_date) d.push(new Date(i.start_date).getTime());
    if (i.target_date) d.push(new Date(i.target_date).getTime());
    return d;
  });
  if (dates.length === 0) {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    const end = new Date(now);
    end.setDate(end.getDate() + 30);
    return { start, end, days: 37 };
  }
  const minMs = Math.min(...dates);
  const maxMs = Math.max(...dates);
  const start = new Date(minMs);
  start.setDate(start.getDate() - 3); // 3일 패딩
  const end = new Date(maxMs);
  end.setDate(end.getDate() + 7); // 7일 패딩
  const days = Math.max(Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)), 14);
  return { start, end, days };
}

function formatDate(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24);
}

// ── sub-components ──

/** 타임라인 헤더 — 날짜 눈금 */
const TimelineHeader = ({ start, days }: { start: Date; days: number }) => {
  const ticks: { key: string; label: string; isToday: boolean; isWeekend: boolean }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    d.setHours(0, 0, 0, 0);
    const dow = d.getDay();
    ticks.push({
      key: `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`,
      label: i % 7 === 0 || i === 0 ? formatDate(d) : "",
      isToday: d.getTime() === today.getTime(),
      isWeekend: dow === 0 || dow === 6,
    });
  }

  return (
    <div className="sticky top-0 z-10 flex h-8 border-b border-subtle bg-layer-1">
      {/* sidebar spacer */}
      <div className="w-64 shrink-0 border-r border-subtle" />
      {/* ticks */}
      <div className="flex min-w-0 flex-1">
        {ticks.map((t) => (
          <div
            key={t.key}
            className={cn(
              "min-w-[28px] flex-1 border-r border-subtle/50 text-center text-[11px] leading-8 select-none",
              t.isToday && "bg-primary-500/10 font-bold text-primary",
              t.isWeekend && !t.isToday && "bg-layer-2"
            )}
          >
            {t.label}
          </div>
        ))}
      </div>
    </div>
  );
};

/** 하나의 이슈 = Gantt 바 */
const TimelineBar = observer(function TimelineBar({
  issue,
  timelineStart,
  days,
  onClick,
}: {
  issue: TIssue;
  timelineStart: Date;
  days: number;
  onClick: () => void;
}) {
  const barStart = issue.start_date
    ? new Date(issue.start_date)
    : issue.target_date
      ? new Date(issue.target_date)
      : null;
  const barEnd = issue.target_date ? new Date(issue.target_date) : barStart;

  if (!barStart || !barEnd) {
    // 날짜 없는 이슈는 사이드바만 표시
    return (
      <button
        type="button"
        className="flex h-9 w-full cursor-pointer items-center border-b border-subtle/50 text-left transition-colors hover:bg-layer-transparent-hover"
        onClick={onClick}
      >
        <div className="flex w-64 shrink-0 items-center gap-2 border-r border-subtle px-3">
          <PriorityIcon priority={issue.priority} className="size-3.5 shrink-0" />
          <span className="flex-1 truncate text-13 text-primary">{issue.name}</span>
          <span className="text-[11px] text-placeholder">날짜 없음</span>
        </div>
        <div className="flex-1" />
      </button>
    );
  }

  const leftDays = daysBetween(timelineStart, barStart);
  const widthDays = Math.max(daysBetween(barStart, barEnd), 1);
  const leftPct = (leftDays / days) * 100;
  const widthPct = (widthDays / days) * 100;

  const daysUntil = getDaysUntil(issue.target_date);
  const isOverdue = daysUntil !== null && daysUntil < 0;

  const barColor = isOverdue
    ? "bg-red-500/80"
    : issue.priority === "urgent"
      ? "bg-red-400/70"
      : issue.priority === "high"
        ? "bg-orange-400/70"
        : issue.priority === "medium"
          ? "bg-amber-400/60"
          : "bg-blue-400/60";

  return (
    <button
      type="button"
      className="flex h-9 w-full cursor-pointer items-center border-b border-subtle/50 text-left transition-colors hover:bg-layer-transparent-hover"
      onClick={onClick}
    >
      {/* sidebar */}
      <div className="flex w-64 shrink-0 items-center gap-2 border-r border-subtle px-3">
        <PriorityIcon priority={issue.priority} className="size-3.5 shrink-0" />
        <span className="flex-1 truncate text-13 text-primary">{issue.name}</span>
      </div>
      {/* bar area */}
      <div className="relative h-full min-w-0 flex-1">
        <Tooltip tooltipContent={`${issue.start_date || "?"} → ${issue.target_date || "?"}`}>
          <div
            className={cn("absolute top-1.5 h-5 rounded-sm", barColor, "transition-opacity hover:opacity-90")}
            style={{
              left: `${Math.max(leftPct, 0)}%`,
              width: `${Math.min(widthPct, 100 - Math.max(leftPct, 0))}%`,
              minWidth: "8px",
            }}
          >
            <span className="block truncate px-1 text-[11px] leading-5 text-white">
              {daysUntil !== null && (daysUntil < 0 ? `${Math.abs(daysUntil)}일 경과` : `D-${daysUntil}`)}
            </span>
          </div>
        </Tooltip>
      </div>
    </button>
  );
});

/** 레이블 스윔레인 */
const SwimLane = observer(function SwimLane({
  label,
  issues,
  timelineStart,
  days,
  onIssueClick,
}: {
  label: { id: string; name: string; color: string } | null; // null = "라벨 없음"
  issues: TIssue[];
  timelineStart: Date;
  days: number;
  onIssueClick: (issue: TIssue) => void;
}) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="mb-1">
      {/* lane header */}
      <button
        type="button"
        className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 transition-colors select-none hover:bg-layer-transparent-hover"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? (
          <ChevronDown size={14} className="text-tertiary" />
        ) : (
          <ChevronRight size={14} className="text-tertiary" />
        )}
        {label ? (
          <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: label.color }} />
        ) : (
          <Tag size={12} className="text-tertiary" />
        )}
        <span className="text-13 font-semibold text-secondary">{label?.name || "라벨 없음"}</span>
        <span className="text-13 text-tertiary">({issues.length})</span>
      </button>
      {/* lane body */}
      {isOpen && (
        <div>
          {issues
            .sort((a, b) => {
              const da = getDaysUntil(a.target_date);
              const db = getDaysUntil(b.target_date);
              if (da === null && db === null) return 0;
              if (da === null) return 1;
              if (db === null) return -1;
              return da - db;
            })
            .map((issue) => (
              <TimelineBar
                key={issue.id}
                issue={issue}
                timelineStart={timelineStart}
                days={days}
                onClick={() => onIssueClick(issue)}
              />
            ))}
        </div>
      )}
    </div>
  );
});

// ── main ──

export const TimelineLayout = observer(function TimelineLayout() {
  const { workspaceSlug: ws, projectId: pj } = useParams();
  const workspaceSlug = ws?.toString();
  const projectId = pj?.toString();

  const { issues } = useIssues(EIssuesStoreType.PROJECT);
  const { issueMap } = useIssues();
  const { setPeekIssue, getIsIssuePeeked } = useIssueDetail(EIssueServiceType.ISSUES);
  const { projectLabels, fetchProjectLabels } = useLabel();

  const handleIssuePeekOverview = useCallback(
    (issue: TIssue) => {
      if (workspaceSlug && issue?.project_id && issue?.id && !getIsIssuePeeked(issue.id)) {
        setPeekIssue({
          workspaceSlug,
          projectId: issue.project_id,
          issueId: issue.id,
          nestingLevel: 0,
          isArchived: !!issue.archived_at,
        });
      }
    },
    [workspaceSlug, setPeekIssue, getIsIssuePeeked]
  );

  // fetch issues
  useSWR(
    workspaceSlug && projectId ? `TIMELINE_VIEW_ISSUES_${workspaceSlug}_${projectId}` : null,
    async () => {
      if (workspaceSlug && projectId) {
        await issues?.fetchIssues(workspaceSlug, projectId, "init-loader", {
          canGroup: false,
          perPageCount: 200,
        });
        await fetchProjectLabels(workspaceSlug, projectId);
      }
    },
    { revalidateIfStale: false, revalidateOnFocus: false, shouldRetryOnError: false }
  );

  // loading
  if (issues?.getIssueLoader() === "init-loader") {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }

  const allIssues: TIssue[] = Object.values(issueMap).filter(
    (i) => i && i.project_id === projectId && !i.completed_at && !i.archived_at
  );

  if (allIssues.length === 0) {
    return (
      <div className="grid h-full place-items-center">
        <div className="text-center">
          <Calendar size={48} className="mx-auto mb-4 text-placeholder" />
          <p className="text-base font-medium text-secondary">작업 항목이 없습니다</p>
          <p className="mt-1 text-13 text-tertiary">프로젝트에 작업 항목을 추가하면 타임라인에 표시됩니다</p>
        </div>
      </div>
    );
  }

  // timeline range
  const { start: timelineStart, days } = getTimelineRange(allIssues);

  // group by label → swim lanes
  const labelMap = new Map<string, { label: { id: string; name: string; color: string } | null; issues: TIssue[] }>();
  const NO_LABEL_KEY = "__no_label__";

  allIssues.forEach((issue) => {
    if (!issue.label_ids || issue.label_ids.length === 0) {
      if (!labelMap.has(NO_LABEL_KEY)) {
        labelMap.set(NO_LABEL_KEY, { label: null, issues: [] });
      }
      labelMap.get(NO_LABEL_KEY)!.issues.push(issue);
    } else {
      // 첫 번째 레이블 기준으로 그룹핑
      const labelId = issue.label_ids[0];
      if (!labelMap.has(labelId)) {
        const labelInfo = projectLabels?.find((l) => l.id === labelId);
        labelMap.set(labelId, {
          label: labelInfo
            ? { id: labelInfo.id, name: labelInfo.name, color: labelInfo.color }
            : { id: labelId, name: "알 수 없음", color: "#6b7280" },
          issues: [],
        });
      }
      labelMap.get(labelId)!.issues.push(issue);
    }
  });

  // sort lanes: labeled first (alphabetically), then "no label"
  const lanes = Array.from(labelMap.entries()).sort((a, b) => {
    if (a[0] === NO_LABEL_KEY) return 1;
    if (b[0] === NO_LABEL_KEY) return -1;
    return (a[1].label?.name || "").localeCompare(b[1].label?.name || "");
  });

  return (
    <div className="h-full overflow-auto">
      <TimelineHeader start={timelineStart} days={days} />
      <div className="min-w-[800px]">
        {lanes.map(([key, { label, issues: laneIssues }]) => (
          <SwimLane
            key={key}
            label={label}
            issues={laneIssues}
            timelineStart={timelineStart}
            days={days}
            onIssueClick={handleIssuePeekOverview}
          />
        ))}
      </div>
    </div>
  );
});
