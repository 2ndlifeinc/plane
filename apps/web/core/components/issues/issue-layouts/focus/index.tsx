/**
 * 🎯 포커스 대시보드 뷰
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { AlertTriangle, Clock, TrendingUp, BarChart3, Target, ChevronDown, ChevronRight } from "lucide-react";
import { PriorityIcon } from "@plane/propel/icons";
import type { TIssue } from "@plane/types";
import { EIssuesStoreType, EIssueServiceType } from "@plane/types";
import { Spinner } from "@plane/ui";
import { cn } from "@plane/utils";
import { useIssues } from "@/hooks/store/use-issues";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProjectState } from "@/hooks/store/use-project-state";

function getDaysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  const now = new Date();
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

const StatCard = ({ label, count, color, icon: Icon }: { label: string; count: number; color: string; icon: any }) => (
  <div className="rounded-lg border border-subtle bg-layer-2 p-4 flex-1 min-w-0">
    <div className="flex items-center gap-2 mb-1">
      <Icon size={14} style={{ color }} />
      <span className="text-13 text-tertiary">{label}</span>
    </div>
    <div className="text-2xl font-bold text-primary" style={{ color }}>{count}</div>
  </div>
);

const DeadlineBadge = ({ targetDate }: { targetDate: string | null | undefined }) => {
  const days = getDaysUntil(targetDate);
  if (days === null) return null;
  if (days < 0)
    return <span className="px-1.5 py-0.5 rounded-sm text-13 font-medium bg-red-500/10 text-red-500">경과 {Math.abs(days)}일</span>;
  if (days <= 7)
    return <span className="px-1.5 py-0.5 rounded-sm text-13 font-medium bg-amber-500/10 text-amber-500">D-{days}</span>;
  return <span className="px-1.5 py-0.5 rounded-sm text-13 text-tertiary">D-{days}</span>;
};

const IssueRow = ({ issue, onClick }: { issue: TIssue; onClick: () => void }) => (
  <div
    className="flex items-center gap-3 min-h-11 px-3 transition-colors cursor-pointer hover:bg-layer-transparent-hover border-b border-subtle last:border-b-0"
    onClick={onClick}
  >
    <PriorityIcon priority={issue.priority} className="size-3.5 shrink-0" />
    <span className="flex-1 min-w-0 text-13 font-medium text-primary truncate">{issue.name}</span>
    <DeadlineBadge targetDate={issue.target_date} />
  </div>
);

const Section = ({ title, icon: Icon, children, count, color = "text-tertiary", defaultOpen = true }: {
  title: string; icon: any; children: React.ReactNode; count?: number; color?: string; defaultOpen?: boolean;
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="mb-4">
      <button
        type="button"
        className="flex w-full items-center gap-2 py-2 cursor-pointer select-none"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen
          ? <ChevronDown size={14} className="text-tertiary" />
          : <ChevronRight size={14} className="text-tertiary" />
        }
        <Icon size={14} className={color} />
        <h3 className="text-13 font-semibold text-secondary uppercase tracking-wider">{title}</h3>
        {count !== undefined && <span className="text-13 text-tertiary">({count})</span>}
      </button>
      {isOpen && (
        <div className="rounded-lg border border-subtle bg-layer-2 shadow-raised-100">
          {children}
        </div>
      )}
    </div>
  );
};

export const FocusLayout = observer(function FocusLayout() {
  const { workspaceSlug: ws, projectId: pj } = useParams();
  const workspaceSlug = ws?.toString();
  const projectId = pj?.toString();

  const { issues } = useIssues(EIssuesStoreType.PROJECT);
  const { issueMap } = useIssues();
  const { projectStates } = useProjectState();
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
    workspaceSlug && projectId ? `FOCUS_VIEW_ISSUES_${workspaceSlug}_${projectId}` : null,
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

  if (allIssues.length === 0) {
    return (
      <div className="grid place-items-center h-full">
        <div className="text-center">
          <Target size={48} className="mx-auto mb-4 text-placeholder" />
          <p className="text-base font-medium text-secondary">작업 항목이 없습니다</p>
          <p className="text-13 text-tertiary mt-1">프로젝트에 작업 항목을 추가하면 포커스 뷰에 표시됩니다</p>
        </div>
      </div>
    );
  }

  const active = allIssues.filter((i) => !i.completed_at && !i.archived_at);
  const overdue = active
    .filter((i) => i.target_date && getDaysUntil(i.target_date)! < 0)
    .sort((a, b) => getDaysUntil(a.target_date)! - getDaysUntil(b.target_date)!);
  const thisWeek = active
    .filter((i) => i.target_date && getDaysUntil(i.target_date)! >= 0 && getDaysUntil(i.target_date)! <= 7)
    .sort((a, b) => getDaysUntil(a.target_date)! - getDaysUntil(b.target_date)!);
  const urgent = active.filter((i) => i.priority === "urgent");
  const highPri = active.filter((i) => i.priority === "high");
  const inProgress = active.filter((i) => {
    const state = projectStates?.find((s) => s.id === i.state_id);
    return state?.group === "started";
  });
  const completed = allIssues.filter((i) => i.completed_at);
  const stale = active.filter((i) => {
    const days = getDaysUntil(i.updated_at);
    return days !== null && days < -14;
  });

  return (
    <div className="max-w-4xl mx-auto px-6 py-5 overflow-y-auto h-full">
      <div className="flex gap-3 mb-5">
        <StatCard label="긴급" count={urgent.length} color="#ef4444" icon={AlertTriangle} />
        <StatCard label="진행중" count={inProgress.length} color="#3b82f6" icon={TrendingUp} />
        <StatCard label="활성" count={active.length} color="#6b7280" icon={Target} />
        <StatCard label="완료" count={completed.length} color="#22c55e" icon={BarChart3} />
      </div>

      {overdue.length > 0 && (
        <Section title="기한 경과" icon={AlertTriangle} count={overdue.length} color="text-red-500">
          {overdue.map((i) => <IssueRow key={i.id} issue={i} onClick={() => handleIssuePeekOverview(i)} />)}
        </Section>
      )}
      {thisWeek.length > 0 && (
        <Section title="이번 주 마감" icon={Clock} count={thisWeek.length} color="text-amber-500">
          {thisWeek.map((i) => <IssueRow key={i.id} issue={i} onClick={() => handleIssuePeekOverview(i)} />)}
        </Section>
      )}
      {urgent.length > 0 && (
        <Section title="긴급" icon={AlertTriangle} count={urgent.length} color="text-red-500">
          {urgent.map((i) => <IssueRow key={i.id} issue={i} onClick={() => handleIssuePeekOverview(i)} />)}
        </Section>
      )}
      {highPri.length > 0 && (
        <Section title="높은 우선순위" icon={TrendingUp} count={highPri.length} color="text-orange-500">
          {highPri.slice(0, 10).map((i) => <IssueRow key={i.id} issue={i} onClick={() => handleIssuePeekOverview(i)} />)}
          {highPri.length > 10 && <div className="text-13 text-tertiary px-3 py-2">+{highPri.length - 10}건 더</div>}
        </Section>
      )}
      {inProgress.length > 0 && (
        <Section title="진행중" icon={TrendingUp} count={inProgress.length} color="text-blue-500">
          {inProgress.slice(0, 8).map((i) => <IssueRow key={i.id} issue={i} onClick={() => handleIssuePeekOverview(i)} />)}
          {inProgress.length > 8 && <div className="text-13 text-tertiary px-3 py-2">+{inProgress.length - 8}건 더</div>}
        </Section>
      )}
      {stale.length > 0 && (
        <Section title="방치 경고" icon={Clock} count={stale.length} color="text-neutral-400" defaultOpen={false}>
          {stale.slice(0, 5).map((i) => <IssueRow key={i.id} issue={i} onClick={() => handleIssuePeekOverview(i)} />)}
          {stale.length > 5 && <div className="text-13 text-tertiary px-3 py-2">+{stale.length - 5}건 더</div>}
        </Section>
      )}
    </div>
  );
});
