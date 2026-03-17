/**
 * 📋 브레인덤프 리스트 뷰 — 커스텀 필터 칩 + 리스트
 *
 * Plane 기본 리스트에 braindump 전용 필터 칩 UI를 상단에 추가.
 * 카테고리(label), 우선순위, 상태, 마감일 기반 빠른 필터링.
 */

import { useState, useMemo, useCallback } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { AlertTriangle, Clock, Tag, Filter, X, ListFilter, CheckCircle2, Circle, Archive } from "lucide-react";
import { PriorityIcon } from "@plane/propel/icons";
import type { TIssue, IIssueLabel } from "@plane/types";
import { EIssuesStoreType, EIssueServiceType } from "@plane/types";
import { Spinner } from "@plane/ui";
import { cn } from "@plane/utils";
import { useIssues } from "@/hooks/store/use-issues";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useLabel } from "@/hooks/store/use-label";
import { useProjectState } from "@/hooks/store/use-project-state";

function getDaysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  const now = new Date();
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

// ── Filter types ──

type QuickFilter =
  | "all"
  | "overdue"
  | "this-week"
  | "urgent"
  | "high"
  | "in-progress"
  | "backlog"
  | "completed"
  | "stale";

type LabelFilter = string | null; // label id or null for "all"

const QUICK_FILTERS: { key: QuickFilter; label: string; icon: any; color: string }[] = [
  { key: "all", label: "전체", icon: ListFilter, color: "text-tertiary" },
  { key: "overdue", label: "기한 경과", icon: AlertTriangle, color: "text-red-500" },
  { key: "this-week", label: "이번 주", icon: Clock, color: "text-amber-500" },
  { key: "urgent", label: "긴급", icon: AlertTriangle, color: "text-red-500" },
  { key: "high", label: "높음", icon: AlertTriangle, color: "text-orange-500" },
  { key: "in-progress", label: "진행중", icon: Circle, color: "text-blue-500" },
  { key: "backlog", label: "백로그", icon: Circle, color: "text-tertiary" },
  { key: "completed", label: "완료", icon: CheckCircle2, color: "text-green-500" },
  { key: "stale", label: "방치", icon: Archive, color: "text-neutral-400" },
];

// ── Sub-components ──

const FilterChip = ({
  label,
  icon: Icon,
  color,
  isActive,
  count,
  onClick,
}: {
  label: string;
  icon: any;
  color: string;
  isActive: boolean;
  count?: number;
  onClick: () => void;
}) => (
  <button
    type="button"
    className={cn(
      "flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-13 font-medium transition-all select-none",
      isActive
        ? "bg-primary-500/10 border-primary-500/30 text-primary"
        : "border-subtle bg-layer-2 text-secondary hover:bg-layer-transparent-hover"
    )}
    onClick={onClick}
  >
    <Icon size={12} className={isActive ? "text-primary" : color} />
    <span>{label}</span>
    {count !== undefined && <span className="text-[11px] text-tertiary">({count})</span>}
  </button>
);

const LabelChip = ({
  label,
  isActive,
  count,
  onClick,
}: {
  label: IIssueLabel | null;
  isActive: boolean;
  count: number;
  onClick: () => void;
}) => (
  <button
    type="button"
    className={cn(
      "flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-13 font-medium transition-all select-none",
      isActive
        ? "bg-primary-500/10 border-primary-500/30 text-primary"
        : "border-subtle bg-layer-2 text-secondary hover:bg-layer-transparent-hover"
    )}
    onClick={onClick}
  >
    {label ? (
      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: label.color }} />
    ) : (
      <Tag size={11} className="text-tertiary" />
    )}
    <span>{label?.name || "전체 카테고리"}</span>
    {count > 0 && <span className="text-[11px] text-tertiary">({count})</span>}
  </button>
);

const DeadlineBadge = ({ targetDate }: { targetDate: string | null | undefined }) => {
  const days = getDaysUntil(targetDate);
  if (days === null) return null;
  if (days < 0)
    return (
      <span className="bg-red-500/10 text-red-500 rounded-sm px-1.5 py-0.5 text-[11px] font-medium">
        경과 {Math.abs(days)}일
      </span>
    );
  if (days <= 7)
    return (
      <span className="bg-amber-500/10 text-amber-500 rounded-sm px-1.5 py-0.5 text-[11px] font-medium">D-{days}</span>
    );
  return <span className="rounded-sm px-1.5 py-0.5 text-[11px] text-tertiary">D-{days}</span>;
};

const StateBadge = ({ stateGroup }: { stateGroup: string | undefined }) => {
  if (!stateGroup) return null;
  const config: Record<string, { label: string; cls: string }> = {
    started: { label: "진행중", cls: "bg-blue-500/10 text-blue-500" },
    unstarted: { label: "대기", cls: "bg-neutral-500/10 text-tertiary" },
    backlog: { label: "백로그", cls: "bg-neutral-500/5 text-placeholder" },
    completed: { label: "완료", cls: "bg-green-500/10 text-green-500" },
    cancelled: { label: "취소", cls: "bg-red-500/10 text-red-400" },
  };
  const c = config[stateGroup];
  if (!c) return null;
  return <span className={cn("rounded-sm px-1.5 py-0.5 text-[11px] font-medium", c.cls)}>{c.label}</span>;
};

const IssueRow = observer(function IssueRow({
  issue,
  labels,
  stateGroup,
  onClick,
}: {
  issue: TIssue;
  labels: IIssueLabel[];
  stateGroup: string | undefined;
  onClick: () => void;
}) {
  const issueLabels = labels.filter((l) => issue.label_ids?.includes(l.id));
  return (
    <button
      type="button"
      className="flex min-h-11 w-full cursor-pointer items-center gap-3 border-b border-subtle px-4 py-1 text-left transition-colors last:border-b-0 hover:bg-layer-transparent-hover"
      onClick={onClick}
    >
      <PriorityIcon priority={issue.priority} className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate text-13 font-medium text-primary">{issue.name}</span>
      {/* labels */}
      <div className="flex shrink-0 items-center gap-1">
        {issueLabels.map((l) => (
          <span
            key={l.id}
            className="flex items-center gap-1 rounded-sm bg-layer-2 px-1.5 py-0.5 text-[11px] text-secondary"
          >
            <span className="size-1.5 rounded-full" style={{ backgroundColor: l.color }} />
            {l.name}
          </span>
        ))}
      </div>
      <StateBadge stateGroup={stateGroup} />
      <DeadlineBadge targetDate={issue.target_date} />
    </button>
  );
});

// ── Main ──

export const BraindumpListLayout = observer(function BraindumpListLayout() {
  const { workspaceSlug: ws, projectId: pj } = useParams();
  const workspaceSlug = ws?.toString();
  const projectId = pj?.toString();

  const { issues } = useIssues(EIssuesStoreType.PROJECT);
  const { issueMap } = useIssues();
  const { setPeekIssue, getIsIssuePeeked } = useIssueDetail(EIssueServiceType.ISSUES);
  const { projectLabels, fetchProjectLabels } = useLabel();
  const { projectStates } = useProjectState();

  const [activeFilter, setActiveFilter] = useState<QuickFilter>("all");
  const [activeLabelFilter, setActiveLabelFilter] = useState<LabelFilter>(null);

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

  // fetch
  useSWR(
    workspaceSlug && projectId ? `BRAINDUMP_LIST_ISSUES_${workspaceSlug}_${projectId}` : null,
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

  if (issues?.getIssueLoader() === "init-loader") {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }

  const allIssues: TIssue[] = Object.values(issueMap).filter((i) => i && i.project_id === projectId);

  const getStateGroup = useCallback(
    (issue: TIssue) => {
      const state = projectStates?.find((s) => s.id === issue.state_id);
      return state?.group;
    },
    [projectStates]
  );

  // 빠른 필터 적용
  const quickFiltered = useMemo(() => {
    switch (activeFilter) {
      case "overdue":
        return allIssues.filter(
          (i) => !i.completed_at && !i.archived_at && i.target_date && getDaysUntil(i.target_date)! < 0
        );
      case "this-week":
        return allIssues.filter((i) => {
          if (i.completed_at || i.archived_at) return false;
          const d = getDaysUntil(i.target_date);
          return d !== null && d >= 0 && d <= 7;
        });
      case "urgent":
        return allIssues.filter((i) => !i.completed_at && !i.archived_at && i.priority === "urgent");
      case "high":
        return allIssues.filter((i) => !i.completed_at && !i.archived_at && i.priority === "high");
      case "in-progress":
        return allIssues.filter((i) => !i.completed_at && !i.archived_at && getStateGroup(i) === "started");
      case "backlog":
        return allIssues.filter((i) => !i.completed_at && !i.archived_at && getStateGroup(i) === "backlog");
      case "completed":
        return allIssues.filter((i) => !!i.completed_at);
      case "stale":
        return allIssues.filter((i) => {
          if (i.completed_at || i.archived_at) return false;
          const d = getDaysUntil(i.updated_at);
          return d !== null && d < -14;
        });
      default:
        return allIssues.filter((i) => !i.completed_at && !i.archived_at);
    }
  }, [allIssues, activeFilter, getStateGroup]);

  // 라벨 필터 적용
  const filtered = useMemo(() => {
    if (!activeLabelFilter) return quickFiltered;
    return quickFiltered.filter((i) => i.label_ids?.includes(activeLabelFilter));
  }, [quickFiltered, activeLabelFilter]);

  // 정렬: 우선순위 > 마감일
  const sorted = useMemo(() => {
    const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
    return [...filtered].sort((a, b) => {
      const pa = priorityOrder[a.priority || "none"] ?? 4;
      const pb = priorityOrder[b.priority || "none"] ?? 4;
      if (pa !== pb) return pa - pb;
      const da = getDaysUntil(a.target_date);
      const db = getDaysUntil(b.target_date);
      if (da === null && db === null) return 0;
      if (da === null) return 1;
      if (db === null) return -1;
      return da - db;
    });
  }, [filtered]);

  // 빠른 필터별 카운트
  const filterCounts = useMemo(() => {
    const active = allIssues.filter((i) => !i.completed_at && !i.archived_at);
    return {
      all: active.length,
      overdue: active.filter((i) => i.target_date && getDaysUntil(i.target_date)! < 0).length,
      "this-week": active.filter((i) => {
        const d = getDaysUntil(i.target_date);
        return d !== null && d >= 0 && d <= 7;
      }).length,
      urgent: active.filter((i) => i.priority === "urgent").length,
      high: active.filter((i) => i.priority === "high").length,
      "in-progress": active.filter((i) => getStateGroup(i) === "started").length,
      backlog: active.filter((i) => getStateGroup(i) === "backlog").length,
      completed: allIssues.filter((i) => !!i.completed_at).length,
      stale: active.filter((i) => {
        const d = getDaysUntil(i.updated_at);
        return d !== null && d < -14;
      }).length,
    };
  }, [allIssues, getStateGroup]);

  // 라벨별 카운트 (현재 quick filter 기준)
  const labelCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    quickFiltered.forEach((i) => {
      if (i.label_ids) {
        i.label_ids.forEach((lid) => {
          counts[lid] = (counts[lid] || 0) + 1;
        });
      }
    });
    return counts;
  }, [quickFiltered]);

  const labels = projectLabels || [];

  if (allIssues.length === 0) {
    return (
      <div className="grid h-full place-items-center">
        <div className="text-center">
          <ListFilter size={48} className="mx-auto mb-4 text-placeholder" />
          <p className="text-base font-medium text-secondary">작업 항목이 없습니다</p>
          <p className="mt-1 text-13 text-tertiary">프로젝트에 작업 항목을 추가하면 리스트에 표시됩니다</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* 필터 바 */}
      <div className="shrink-0 space-y-2 border-b border-subtle bg-layer-1 px-4 pt-3 pb-2">
        {/* 빠른 필터 */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          <Filter size={14} className="mr-1 shrink-0 text-tertiary" />
          {QUICK_FILTERS.map((f) => (
            <FilterChip
              key={f.key}
              label={f.label}
              icon={f.icon}
              color={f.color}
              isActive={activeFilter === f.key}
              count={filterCounts[f.key]}
              onClick={() => setActiveFilter(f.key)}
            />
          ))}
        </div>
        {/* 카테고리 (라벨) 필터 */}
        {labels.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            <Tag size={14} className="mr-1 shrink-0 text-tertiary" />
            <LabelChip
              label={null}
              isActive={!activeLabelFilter}
              count={quickFiltered.length}
              onClick={() => setActiveLabelFilter(null)}
            />
            {labels.map((l) => (
              <LabelChip
                key={l.id}
                label={l}
                isActive={activeLabelFilter === l.id}
                count={labelCounts[l.id] || 0}
                onClick={() => setActiveLabelFilter(activeLabelFilter === l.id ? null : l.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 결과 요약 */}
      <div className="flex items-center justify-between border-b border-subtle bg-layer-2 px-4 py-1.5 text-13 text-tertiary">
        <span>{sorted.length}건 표시</span>
        {(activeFilter !== "all" || activeLabelFilter) && (
          <button
            type="button"
            className="flex cursor-pointer items-center gap-1 text-13 text-tertiary transition-colors hover:text-secondary"
            onClick={() => {
              setActiveFilter("all");
              setActiveLabelFilter(null);
            }}
          >
            <X size={12} />
            필터 초기화
          </button>
        )}
      </div>

      {/* 이슈 리스트 */}
      <div className="flex-1 overflow-y-auto">
        {sorted.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-13 text-placeholder">조건에 맞는 항목이 없습니다</p>
          </div>
        ) : (
          <div className="mx-4 my-3 rounded-lg border border-subtle bg-layer-2 shadow-raised-100">
            {sorted.map((issue) => (
              <IssueRow
                key={issue.id}
                issue={issue}
                labels={labels}
                stateGroup={getStateGroup(issue)}
                onClick={() => handleIssuePeekOverview(issue)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
