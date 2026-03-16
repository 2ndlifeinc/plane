/**
 * 📊 아이젠하워 매트릭스 뷰
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { Flame, CalendarClock, Users, Archive, Target } from "lucide-react";
import { PriorityIcon } from "@plane/propel/icons";
import type { TIssue } from "@plane/types";
import { EIssuesStoreType, EIssueServiceType } from "@plane/types";
import { Spinner } from "@plane/ui";
import { cn } from "@plane/utils";
import { useIssues } from "@/hooks/store/use-issues";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";

function getDaysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  const now = new Date();
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function isUrgent(issue: TIssue): boolean {
  const days = getDaysUntil(issue.target_date);
  if (days === null) return false;
  return days <= 7;
}

function isImportant(issue: TIssue): boolean {
  return issue.priority === "urgent" || issue.priority === "high";
}

type Quadrant = "do-first" | "schedule" | "delegate" | "park";

function getQuadrant(issue: TIssue): Quadrant {
  const u = isUrgent(issue);
  const i = isImportant(issue);
  if (u && i) return "do-first";
  if (!u && i) return "schedule";
  if (u && !i) return "delegate";
  return "park";
}

const QUADRANT_CONFIG: Record<Quadrant, {
  title: string; subtitle: string; icon: any;
  border: string; headerBg: string; headerText: string;
}> = {
  "do-first": {
    title: "DO FIRST",
    subtitle: "긴급 + 중요",
    icon: Flame,
    border: "border-red-500/30",
    headerBg: "bg-red-500/10",
    headerText: "text-red-500",
  },
  schedule: {
    title: "SCHEDULE",
    subtitle: "중요 · 여유",
    icon: CalendarClock,
    border: "border-blue-500/30",
    headerBg: "bg-blue-500/10",
    headerText: "text-blue-500",
  },
  delegate: {
    title: "DELEGATE",
    subtitle: "긴급 · 덜 중요",
    icon: Users,
    border: "border-amber-500/30",
    headerBg: "bg-amber-500/10",
    headerText: "text-amber-500",
  },
  park: {
    title: "PARK / DROP",
    subtitle: "여유 · 덜 중요",
    icon: Archive,
    border: "border-neutral-500/20",
    headerBg: "bg-neutral-500/5",
    headerText: "text-tertiary",
  },
};

const QuadrantCard = observer(function QuadrantCard({
  quadrant, issues, onIssueClick,
}: {
  quadrant: Quadrant; issues: TIssue[]; onIssueClick: (issue: TIssue) => void;
}) {
  const config = QUADRANT_CONFIG[quadrant];
  const Icon = config.icon;

  return (
    <div className={cn("rounded-lg flex flex-col min-h-0 overflow-hidden", config.headerBg)}>
      {/* header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <Icon size={14} className={config.headerText} />
        <span className={cn("text-13 font-semibold", config.headerText)}>{config.title}</span>
        <span className="text-13 text-tertiary">· {config.subtitle}</span>
        <span className={cn("ml-auto text-13 font-bold", config.headerText)}>{issues.length}</span>
      </div>
      {/* body */}
      <div className="flex-1 overflow-y-auto px-1 pb-1">
        {issues.map((issue) => (
          <div
            key={issue.id}
            className="flex items-center gap-2 min-h-9 px-2 rounded-md cursor-pointer transition-colors hover:bg-layer-transparent-hover"
            onClick={() => onIssueClick(issue)}
          >
            <PriorityIcon priority={issue.priority} className="size-3.5 shrink-0" />
            <span className="flex-1 min-w-0 text-13 text-primary truncate">{issue.name}</span>
            {issue.target_date && (
              <span className="text-13 text-tertiary shrink-0">
                {(() => {
                  const d = getDaysUntil(issue.target_date);
                  if (d === null) return "";
                  if (d < 0) return `${Math.abs(d)}일 경과`;
                  return `D-${d}`;
                })()}
              </span>
            )}
          </div>
        ))}
        {issues.length === 0 && (
          <div className="text-13 text-placeholder text-center py-6">항목 없음</div>
        )}
      </div>
    </div>
  );
});

export const MatrixLayout = observer(function MatrixLayout() {
  const { workspaceSlug: ws, projectId: pj } = useParams();
  const workspaceSlug = ws?.toString();
  const projectId = pj?.toString();

  const { issues } = useIssues(EIssuesStoreType.PROJECT);
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
        await issues?.fetchIssues(workspaceSlug, projectId, "init-loader", {
          canGroup: false,
          perPageCount: 200,
        });
      }
    },
    { revalidateIfStale: false, revalidateOnFocus: false, shouldRetryOnError: false }
  );

  if (issues?.getIssueLoader() === "init-loader") {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner className="size-6" />
      </div>
    );
  }

  const allIssues: TIssue[] = Object.values(issueMap).filter(
    (i) => i && i.project_id === projectId
  );
  const active = allIssues.filter((i) => !i.completed_at && !i.archived_at);

  if (active.length === 0) {
    return (
      <div className="grid place-items-center h-full">
        <div className="text-center">
          <Target size={48} className="mx-auto mb-4 text-placeholder" />
          <p className="text-base font-medium text-secondary">작업 항목이 없습니다</p>
          <p className="text-13 text-tertiary mt-1">프로젝트에 작업 항목을 추가하면 매트릭스 뷰에 표시됩니다</p>
        </div>
      </div>
    );
  }

  const quadrants: Record<Quadrant, TIssue[]> = {
    "do-first": [], schedule: [], delegate: [], park: [],
  };
  active.forEach((issue) => { quadrants[getQuadrant(issue)].push(issue); });

  return (
    <div className="h-full flex flex-col p-4 overflow-hidden">
      {/* 축 라벨 */}
      <div className="flex items-center justify-between mb-3 px-1">
        <span className="text-13 text-tertiary">← 긴급</span>
        <span className="text-13 font-semibold text-secondary">긴급-중요 매트릭스</span>
        <span className="text-13 text-tertiary">여유 →</span>
      </div>

      {/* 2×2 그리드 */}
      <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-3 min-h-0">
        <QuadrantCard quadrant="do-first" issues={quadrants["do-first"]} onIssueClick={handleIssuePeekOverview} />
        <QuadrantCard quadrant="schedule" issues={quadrants.schedule} onIssueClick={handleIssuePeekOverview} />
        <QuadrantCard quadrant="delegate" issues={quadrants.delegate} onIssueClick={handleIssuePeekOverview} />
        <QuadrantCard quadrant="park" issues={quadrants.park} onIssueClick={handleIssuePeekOverview} />
      </div>

      {/* Y축 라벨 */}
      <div className="flex justify-between mt-2 px-1">
        <span className="text-13 text-tertiary">↑ 중요</span>
        <span className="text-13 text-tertiary">덜 중요 ↓</span>
      </div>
    </div>
  );
});
