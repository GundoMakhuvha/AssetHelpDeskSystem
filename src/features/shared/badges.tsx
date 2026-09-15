import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { AssetCondition, TicketPriority, TicketStatus } from "@/lib/types";

export function ConditionBadge({ value }: { value: AssetCondition | null }) {
  if (!value) return <Badge variant="secondary">—</Badge>;
  const map: Record<AssetCondition, string> = {
    Good: "bg-success text-success-foreground",
    Fair: "bg-info text-info-foreground",
    Poor: "bg-warning text-warning-foreground",
    Damaged: "bg-destructive text-destructive-foreground",
  };
  return <span className={cn("px-2 py-0.5 rounded-md text-xs font-medium", map[value])}>{value}</span>;
}

export function PriorityBadge({ value }: { value: TicketPriority }) {
  const map: Record<TicketPriority, string> = {
    Low: "bg-muted text-muted-foreground",
    Medium: "bg-info text-info-foreground",
    High: "bg-warning text-warning-foreground",
    Critical: "bg-destructive text-destructive-foreground",
  };
  return <span className={cn("px-2 py-0.5 rounded-md text-xs font-medium", map[value])}>{value}</span>;
}

export function StatusBadge({ value }: { value: TicketStatus }) {
  const map: Record<TicketStatus, string> = {
    Open: "bg-info text-info-foreground",
    "In Progress": "bg-primary text-primary-foreground",
    "On Hold": "bg-warning text-warning-foreground",
    Resolved: "bg-success text-success-foreground",
    Closed: "bg-muted text-muted-foreground",
  };
  return <span className={cn("px-2 py-0.5 rounded-md text-xs font-medium", map[value])}>{value}</span>;
}

export function VerifiedBadge({ date }: { date: string | null }) {
  if (!date) return <Badge variant="destructive">Never</Badge>;
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
  if (days <= 1) return <span className="px-2 py-0.5 rounded-md text-xs bg-success text-success-foreground">Today</span>;
  if (days <= 30) return <span className="px-2 py-0.5 rounded-md text-xs bg-info text-info-foreground">{days}d ago</span>;
  if (days <= 90) return <span className="px-2 py-0.5 rounded-md text-xs bg-warning text-warning-foreground">{days}d ago</span>;
  return <span className="px-2 py-0.5 rounded-md text-xs bg-destructive text-destructive-foreground">Overdue</span>;
}
