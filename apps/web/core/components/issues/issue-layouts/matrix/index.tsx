/**
 * 📊 아이젠하워 매트릭스 뷰
 * 긴급-중요 2×2 사분면에 이슈 배치
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { Flame, CalendarClock, Users, Archive, Target } from "lucide-react";
// plane imports
import type { TIssue } from "@plane/types";
import { EIssuesStoreType, EIssueServiceType } from "@plane/types";
import { Spinner } from "@plane/ui";
// hooks
import { useIssues } from "@/hooks/store/use-issues";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";

function getDaysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  const now = new Date();
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function getPriorityColor(priority: string | null): string {
  switch (priority) {
    case "urgent": return "#ef4444";
    case "high": return "#f97316";
    case "medium": return "#eab308";
    case "low": return "#22c55e";
    default: return "#6b7280";
  }
}

/** 긴급도: target_date 기반. 경과/7일이내 = true */
function isUrgent(issue: TIssue): boolean {
  const days = getDaysUntil(issue.target_date);
  if (days === null) return false;
  return days <= 7; // 경과(음수) 또는 7일 이내
}

/** 중요도: priority 기반. urgent+high = true */
function isImportant(issue: TIssue): boolean {
  return issue.priority === "urgent" || issue.priority === "high";
}

type Quadrant = "do-first" | "schedule" | "delegate" | "park";

function getQuadrant(issue: TIssue): Quadrant {
  const urgent = isUrgent(issue);
  const important = isImportant(issue);
  if (urgent && important) return "do-first";
  if (!urgent && important) return "schedule";
  if (urgent && !important) return "delegate";
  return "park";
}

const QUADRANT_CONFIG: Record<Quadrant, { title: string; subtitle: string; icon: any; bgColor: string; borderColor: string; textColor: string }> = {
  "do-first": {
    title: "DO FIRST",
    subtitle: "긴급 + 중요",
    icon: Flame,
    bgColor: "bg-red-500/5",
    borderColor: "border-red-500/20",
    textColor: "text-red-400",
  },
  schedule: {
    title: "SCHEDULE",
    subtitle: "중요 · 여유 있음",
    icon: CalendarClock,
    bgColor: "bg-blue-500/5",
    borderColor: "border-blue-500/20",
    textColor: "text-blue-400",
  },
  delegate: {
    title: "DELEGATE",
    subtitle: "긴급 · 덜 중요",
    icon: Users,
    bgColor: "bg-amber-500/5",
    borderColor: "border-amber-500/20",
    textColor: "text-amber-400",
  },
  park: {
    title: "PARK / DROP",
    subtitle: "여유 · 덜 중요",
    icon: Archive,
    bgColor: "bg-neutral-500/5",
    borderColor: "border-neutral-500/20",
    textColor: "text-neutral-400",
  },
};

const QuadrantCard = observer(function QuadrantCard({
  quadrant,
  issues,
  onIssueClick,
}: {
  quadrant: Quadrant;
  issues: TIssue[];
  onIssueClick: (issue: TIssue) => void;
}) {
  const config = QUADRANT_CONFIG[quadrant];
  const Icon = config.icon;

  return (
    <div className={`rounded-lg border ${config.borderColor} ${config.bgColor} p-4 flex flex-col min-h-0 overflow-hidden`}>
      <div className="flex items-center gap-2 mb-3">
        <Icon size={16} className={config.textColor} />
        <div>
          <h3 className={`text-sm font-bold ${config.textColor}`}>{config.title}</h3>
          <p className="text-xs text-custom-text-400">{config.subtitle}</p>
        </div>
        <span className={`ml-auto text-lg font-bold ${config.textColor}`}>{issues.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto space-y-1">
        {issues.map((issue) => (
          <div
            key={issue.id}
            className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-custom-background-90 transition-colors cursor-pointer"
            onClick={() => onIssueClick(issue)}
          >
            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: getPriorityColor(issue.priority) }} />
            <span className="text-sm truncate text-custom-text-100 flex-1">{issue.name}</span>
            {issue.target_date && (
              <span className="text-xs text-custom-text-400 shrink-0">
                {(() => {
                  const d = getDaysUntil(issue.target_date);
                  if (d === null) return "";
                  if (d < 0) return `${Math.abs(d)}d 경과`;
                  return `D-${d}`;
                })()}
              </span>
            )}
          </div>
        ))}
        {issues.length === 0 && (
          <div className="text-xs text-custom-text-400 text-center py-4">항목 없음</div>
        )}
      </div>
    </div>
  );
});

export const MatrixLayout = observer(function MatrixLayout() {
  const { workspaceSlug: ws, projectId: pj } = useParams();
  const workspaceSlug = ws?.toString();
  const projectId = pj?.toString();

  const { issues, issuesFilter } = useIssues(EIssuesStoreType.PROJECT);
  const { issueMap } = useIssues();
  const { setPeekIssue, getIsIssuePeeked } = useIssueDetail(EIssueServiceType.ISSUES);

  const handleIssuePeekOverview = (issue: TIssue) => {
    if (workspaceSlug && issue?.project_id && issue?.id && !getIsIssuePeeked(issue.id)) {
      setPeekIssue({
        workspaceSlug,
        projectId: issue.project_id,
        issueId: issue.id,
        nestingLevel: 0,
        isArchived: !!issue.archived_at,
      });
    }
  };

  useSWR(
    workspaceSlug && projectId ? `MATRIX_VIEW_ISSUES_${workspaceSlug}_${projectId}` : null,
    async () => {
      if (workspaceSlug && projectId) {
        await issuesFilter?.fetchFilters(workspaceSlug, projectId);
        await issues?.fetchIssues(workspaceSlug, projectId, "init-loader", {
          canGroup: false,
          perPageCount: 200,
        });
      }
    },
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  if (issues?.getIssueLoader() === "init-loader") {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  const allIssues: TIssue[] = Object.values(issueMap).filter(
    (i) => i && i.project_id === projectId
  );

  const active = allIssues.filter((i) => !i.completed_at && !i.archived_at);

  if (active.length === 0) {
    return (
      <div className="text-center py-20 text-custom-text-400">
        <Target size={48} className="mx-auto mb-4 opacity-30" />
        <p className="text-lg">작업 항목이 없습니다</p>
        <p className="text-sm mt-1">프로젝트에 작업 항목을 추가하면 매트릭스 뷰에 표시됩니다</p>
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
    quadrants[getQuadrant(issue)].push(issue);
  });

  return (
    <div className="h-full flex flex-col p-6 overflow-hidden">
      {/* 축 라벨 */}
      <div className="flex items-center justify-center mb-2 gap-4">
        <span className="text-xs text-custom-text-400 uppercase tracking-wider">긴급 ←</span>
        <span className="text-xs font-bold text-custom-text-200">긴급-중요 매트릭스</span>
        <span className="text-xs text-custom-text-400 uppercase tracking-wider">→ 여유</span>
      </div>

      {/* 2×2 그리드 */}
      <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-3 min-h-0">
        {/* Row 1: 중요 높음 */}
        <QuadrantCard quadrant="do-first" issues={quadrants["do-first"]} onIssueClick={handleIssuePeekOverview} />
        <QuadrantCard quadrant="schedule" issues={quadrants.schedule} onIssueClick={handleIssuePeekOverview} />
        {/* Row 2: 중요 낮음 */}
        <QuadrantCard quadrant="delegate" issues={quadrants.delegate} onIssueClick={handleIssuePeekOverview} />
        <QuadrantCard quadrant="park" issues={quadrants.park} onIssueClick={handleIssuePeekOverview} />
      </div>

      {/* Y축 라벨 */}
      <div className="flex justify-between mt-2">
        <span className="text-xs text-custom-text-400">↑ 중요</span>
        <span className="text-xs text-custom-text-400">덜 중요 ↓</span>
      </div>
    </div>
  );
});
