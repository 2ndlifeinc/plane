/**
 * 📊 아이젠하워 매트릭스 뷰
 *
 * X축 (긴급도): target_date 기반 (7일 이내 or priority=urgent → 긴급)
 * Y축 (중요도): "중요도:" 접두사 라벨 기반 (레벨별 점수)
 *
 * 라벨 예시: "중요도: 최상", "중요도: 상", "중요도: 중", "중요도: 하"
 * - 최상/상 → 중요 (상단)
 * - 중/하/라벨없음 → 덜 중요 (하단)
 */

import { useCallback, useMemo } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { Flame, CalendarClock, Users, Archive, Target, Tag } from "lucide-react";
import { PriorityIcon } from "@plane/propel/icons";
import type { TIssue, IIssueLabel } from "@plane/types";
import { EIssuesStoreType, EIssueServiceType } from "@plane/types";
import { Spinner } from "@plane/ui";
import { cn } from "@plane/utils";
import { useIssues } from "@/hooks/store/use-issues";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useLabel } from "@/hooks/store/use-label";

// ── 중요도 라벨 시스템 ──

const IMPORTANCE_PREFIX = "중요도:";
const IMPORTANCE_THRESHOLD = 3; // 이 점수 이상이면 "중요"

/**
 * 라벨 이름에서 중요도 점수를 추출.
 * "중요도: 최상" → 4, "중요도: 상" → 3, "중요도: 중" → 2, "중요도: 하" → 1
 * 중요도 라벨이 아니면 null 반환.
 */
function getImportanceScore(labelName: string): number | null {
  const trimmed = labelName.trim();
  if (!trimmed.startsWith(IMPORTANCE_PREFIX)) return null;
  const level = trimmed.slice(IMPORTANCE_PREFIX.length).trim();
  const scores: Record<string, number> = {
    최상: 4,
    critical: 4,
    상: 3,
    high: 3,
    중: 2,
    medium: 2,
    하: 1,
    low: 1,
  };
  return scores[level] ?? 0;
}

/** 이슈의 중요도 라벨 정보를 가져온다 */
function getIssueImportance(issue: TIssue, labels: IIssueLabel[]): { score: number; label: IIssueLabel | null } {
  let maxScore = 0;
  let matchedLabel: IIssueLabel | null = null;

  for (const labelId of issue.label_ids ?? []) {
    const label = labels.find((l) => l.id === labelId);
    if (!label) continue;
    const score = getImportanceScore(label.name);
    if (score !== null && score > maxScore) {
      maxScore = score;
      matchedLabel = label;
    }
  }

  return { score: maxScore, label: matchedLabel };
}

// ── 긴급도/중요도 판정 ──

function getDaysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  const now = new Date();
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function isUrgent(issue: TIssue): boolean {
  // 마감 7일 이내 OR priority=urgent → 긴급
  if (issue.priority === "urgent") return true;
  const days = getDaysUntil(issue.target_date);
  if (days === null) return false;
  return days <= 7;
}

function isImportant(issue: TIssue, labels: IIssueLabel[]): boolean {
  const { score } = getIssueImportance(issue, labels);
  return score >= IMPORTANCE_THRESHOLD;
}

type Quadrant = "do-first" | "schedule" | "delegate" | "park";

function getQuadrant(issue: TIssue, labels: IIssueLabel[]): Quadrant {
  const u = isUrgent(issue);
  const i = isImportant(issue, labels);
  if (u && i) return "do-first";
  if (!u && i) return "schedule";
  if (u && !i) return "delegate";
  return "park";
}

// ── UI config ──

const QUADRANT_CONFIG: Record<
  Quadrant,
  {
    title: string;
    subtitle: string;
    icon: typeof Flame;
    headerBg: string;
    headerText: string;
  }
> = {
  "do-first": {
    title: "DO FIRST",
    subtitle: "긴급 + 중요",
    icon: Flame,
    headerBg: "bg-red-500/10",
    headerText: "text-red-500",
  },
  schedule: {
    title: "SCHEDULE",
    subtitle: "중요 · 여유",
    icon: CalendarClock,
    headerBg: "bg-blue-500/10",
    headerText: "text-blue-500",
  },
  delegate: {
    title: "DELEGATE",
    subtitle: "긴급 · 덜 중요",
    icon: Users,
    headerBg: "bg-amber-500/10",
    headerText: "text-amber-500",
  },
  park: {
    title: "PARK / DROP",
    subtitle: "여유 · 덜 중요",
    icon: Archive,
    headerBg: "bg-neutral-500/5",
    headerText: "text-tertiary",
  },
};

const IMPORTANCE_BADGE_COLORS: Record<number, string> = {
  4: "bg-red-500/15 text-red-500",
  3: "bg-orange-500/15 text-orange-500",
  2: "bg-amber-500/15 text-amber-500",
  1: "bg-neutral-500/10 text-tertiary",
};

// ── Components ──

const ImportanceBadge = ({ label, score }: { label: IIssueLabel | null; score: number }) => {
  if (!label || score === 0) return null;
  const level = label.name.slice(IMPORTANCE_PREFIX.length).trim();
  const colorCls = IMPORTANCE_BADGE_COLORS[score] || "bg-neutral-500/10 text-tertiary";
  return <span className={cn("shrink-0 rounded-sm px-1.5 py-0.5 text-[11px] font-medium", colorCls)}>{level}</span>;
};

const QuadrantCard = observer(function QuadrantCard({
  quadrant,
  issues,
  labels,
  onIssueClick,
}: {
  quadrant: Quadrant;
  issues: TIssue[];
  labels: IIssueLabel[];
  onIssueClick: (issue: TIssue) => void;
}) {
  const config = QUADRANT_CONFIG[quadrant];
  const Icon = config.icon;

  return (
    <div className={cn("flex min-h-0 flex-col overflow-hidden rounded-lg", config.headerBg)}>
      {/* header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <Icon size={14} className={config.headerText} />
        <span className={cn("text-13 font-semibold", config.headerText)}>{config.title}</span>
        <span className="text-13 text-tertiary">· {config.subtitle}</span>
        <span className={cn("ml-auto text-13 font-bold", config.headerText)}>{issues.length}</span>
      </div>
      {/* body */}
      <div className="flex-1 overflow-y-auto px-1 pb-1">
        {issues.map((issue) => {
          const importance = getIssueImportance(issue, labels);
          return (
            <button
              type="button"
              key={issue.id}
              className="flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left transition-colors hover:bg-layer-transparent-hover"
              onClick={() => onIssueClick(issue)}
            >
              <PriorityIcon priority={issue.priority} className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-13 text-primary">{issue.name}</span>
              <ImportanceBadge label={importance.label} score={importance.score} />
              {issue.target_date && (
                <span className="shrink-0 text-[11px] text-tertiary">
                  {(() => {
                    const d = getDaysUntil(issue.target_date);
                    if (d === null) return "";
                    if (d < 0) return `${Math.abs(d)}일 경과`;
                    return `D-${d}`;
                  })()}
                </span>
              )}
            </button>
          );
        })}
        {issues.length === 0 && <div className="py-6 text-center text-13 text-placeholder">항목 없음</div>}
      </div>
    </div>
  );
});

// ── 범례 ──

const Legend = ({ importanceLabels }: { importanceLabels: IIssueLabel[] }) => (
  <div className="flex items-center gap-4 px-1 py-1.5 text-[11px] text-tertiary">
    <span className="font-medium text-secondary">범례</span>
    <span>X축 긴급도: 마감 7일 이내 or priority=urgent</span>
    <span className="border-l border-subtle pl-4">Y축 중요도:</span>
    {importanceLabels.length > 0 ? (
      importanceLabels.map((l) => {
        const score = getImportanceScore(l.name) ?? 0;
        const level = l.name.slice(IMPORTANCE_PREFIX.length).trim();
        const colorCls = IMPORTANCE_BADGE_COLORS[score] || "";
        return (
          <span key={l.id} className={cn("rounded-sm px-1.5 py-0.5 font-medium", colorCls)}>
            {level}
            {score >= IMPORTANCE_THRESHOLD ? " (중요)" : ""}
          </span>
        );
      })
    ) : (
      <span className="flex items-center gap-1 text-placeholder">
        <Tag size={10} />
        &quot;중요도: 최상/상/중/하&quot; 라벨을 추가하세요
      </span>
    )}
  </div>
);

// ── Main ──

export const MatrixLayout = observer(function MatrixLayout() {
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

  useSWR(
    workspaceSlug && projectId ? `MATRIX_VIEW_ISSUES_${workspaceSlug}_${projectId}` : null,
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

  const labels = useMemo(() => projectLabels || [], [projectLabels]);

  // 중요도 라벨만 필터
  const importanceLabels = useMemo(
    () =>
      labels
        .filter((l) => getImportanceScore(l.name) !== null)
        .sort((a, b) => (getImportanceScore(b.name) ?? 0) - (getImportanceScore(a.name) ?? 0)),
    [labels]
  );

  if (issues?.getIssueLoader() === "init-loader") {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }

  const allIssues: TIssue[] = Object.values(issueMap).filter((i) => i && i.project_id === projectId);
  const active = allIssues.filter((i) => !i.completed_at && !i.archived_at);

  if (active.length === 0) {
    return (
      <div className="grid h-full place-items-center">
        <div className="text-center">
          <Target size={48} className="mx-auto mb-4 text-placeholder" />
          <p className="text-base font-medium text-secondary">작업 항목이 없습니다</p>
          <p className="mt-1 text-13 text-tertiary">프로젝트에 작업 항목을 추가하면 매트릭스 뷰에 표시됩니다</p>
        </div>
      </div>
    );
  }

  const quadrants: Record<Quadrant, TIssue[]> = {
    "do-first": [],
    schedule: [],
    delegate: [],
    park: [],
  };
  active.forEach((issue) => {
    quadrants[getQuadrant(issue, labels)].push(issue);
  });

  return (
    <div className="flex h-full flex-col overflow-hidden p-4">
      {/* 축 라벨 */}
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-13 text-tertiary">← 긴급</span>
        <span className="text-13 font-semibold text-secondary">긴급-중요 매트릭스</span>
        <span className="text-13 text-tertiary">여유 →</span>
      </div>

      {/* 2×2 그리드 */}
      <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-3">
        <QuadrantCard
          quadrant="do-first"
          issues={quadrants["do-first"]}
          labels={labels}
          onIssueClick={handleIssuePeekOverview}
        />
        <QuadrantCard
          quadrant="schedule"
          issues={quadrants.schedule}
          labels={labels}
          onIssueClick={handleIssuePeekOverview}
        />
        <QuadrantCard
          quadrant="delegate"
          issues={quadrants.delegate}
          labels={labels}
          onIssueClick={handleIssuePeekOverview}
        />
        <QuadrantCard quadrant="park" issues={quadrants.park} labels={labels} onIssueClick={handleIssuePeekOverview} />
      </div>

      {/* Y축 라벨 + 범례 */}
      <div className="mt-2 flex justify-between px-1">
        <span className="text-13 text-tertiary">↑ 중요 (중요도: 상/최상)</span>
        <span className="text-13 text-tertiary">덜 중요 (중/하/없음) ↓</span>
      </div>

      {/* 범례 */}
      <Legend importanceLabels={importanceLabels} />
    </div>
  );
});
