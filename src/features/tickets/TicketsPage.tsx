import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { useTicketCategories, useHelpdeskSettings } from "@/lib/setup-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { PriorityBadge, StatusBadge } from "../shared/badges";
import {
  CATEGORIES, DEPARTMENTS, PRIORITIES, STATUSES,
  type Department, type Profile, type Ticket, type TicketCategory, type TicketComment,
  type TicketPriority, type TicketStatus,
} from "@/lib/types";
import {
  Plus, Paperclip, Search, LifeBuoy, AlertOctagon, CheckCircle2, Clock, Download,
  Inbox, UserX, UserCheck, Timer, ChevronDown, ChevronUp, Gauge, X,
} from "lucide-react";
import { sendTicketNotificationEmail } from "@/lib/ticket-notifications.functions";
import { toast } from "sonner";
import { format, formatDistanceToNowStrict } from "date-fns";
import { cn } from "@/lib/utils";

interface SlaRow {
  priority: TicketPriority;
  response_minutes: number;
  resolution_minutes: number;
}

const FALLBACK_SLA: Record<TicketPriority, number> = {
  Critical: 240,
  High: 480,
  Medium: 1440,
  Low: 4320,
};

const OPEN_STATUSES: TicketStatus[] = ["Open", "In Progress", "On Hold"];
const isOpen = (t: Ticket) => OPEN_STATUSES.includes(t.status);

type ViewKey = "all" | "unassigned" | "mine" | "assigned" | "breached" | "resolved";

const VIEWS: { key: ViewKey; label: string; icon: React.ReactNode }[] = [
  { key: "all", label: "All open requests", icon: <Inbox className="h-4 w-4" /> },
  { key: "unassigned", label: "Unassigned", icon: <UserX className="h-4 w-4" /> },
  { key: "assigned", label: "Assigned to me", icon: <UserCheck className="h-4 w-4" /> },
  { key: "mine", label: "Raised by me", icon: <LifeBuoy className="h-4 w-4" /> },
  { key: "breached", label: "SLA overdue", icon: <Timer className="h-4 w-4" /> },
  { key: "resolved", label: "Resolved / closed", icon: <CheckCircle2 className="h-4 w-4" /> },
];

type SortKey = "ticket_number" | "priority" | "status" | "due" | "updated_at";

export function TicketsPage() {
  const { data: categoryRows } = useTicketCategories();
  const catNames = (categoryRows ?? []).map((c) => c.name);
  const { user, role } = useAuth();
  const isStaff = role === "admin" || role === "technician" || role === "helpdesk_agent";
  const qc = useQueryClient();
  const [view, setView] = React.useState<ViewKey>("all");
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState<Ticket | null>(null);
  const [search, setSearch] = React.useState("");
  const [fStatus, setFStatus] = React.useState<string>("all");
  const [fPriority, setFPriority] = React.useState<string>("all");
  const [fCategory, setFCategory] = React.useState<string>("all");
  const [fDept, setFDept] = React.useState<string>("all");
  const [selected, setSelected] = React.useState<string[]>([]);
  const [sort, setSort] = React.useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "updated_at", dir: "desc" });

  const { data: profiles } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => (await supabase.from("profiles").select("*")).data as Profile[] | null,
  });

  const { data: slas } = useQuery({
    queryKey: ["sla_policies"],
    queryFn: async () => {
      const { data } = await supabase.from("sla_policies" as never).select("*");
      return (data ?? []) as unknown as SlaRow[];
    },
  });

  const { data: tickets } = useQuery({
    queryKey: ["tickets"],
    queryFn: async () => {
      const { data } = await supabase.from("tickets").select("*").order("updated_at", { ascending: false });
      return (data ?? []) as Ticket[];
    },
  });

  const slaMinutes = React.useCallback(
    (p: TicketPriority) => slas?.find((s) => s.priority === p)?.resolution_minutes ?? FALLBACK_SLA[p],
    [slas],
  );
  const dueAt = React.useCallback(
    (t: Ticket) => new Date(new Date(t.created_at).getTime() + slaMinutes(t.priority) * 60_000),
    [slaMinutes],
  );
  const isBreached = React.useCallback(
    (t: Ticket) => isOpen(t) && dueAt(t).getTime() < Date.now(),
    [dueAt],
  );

  const all = React.useMemo(() => tickets ?? [], [tickets]);

  const stats = React.useMemo(() => {
    const openCount = all.filter(isOpen).length;
    const unassigned = all.filter((t) => isOpen(t) && !t.assigned_to).length;
    const breached = all.filter(isBreached).length;
    const resolved = all.filter((t) => !isOpen(t)).length;
    const done = all.filter((t) => t.resolved_at);
    const avgHours = done.length
      ? done.reduce((s, t) => s + (new Date(t.resolved_at!).getTime() - new Date(t.created_at).getTime()), 0) /
        done.length / 3_600_000
      : 0;
    const met = done.filter((t) => new Date(t.resolved_at!).getTime() <= dueAt(t).getTime()).length;
    const compliance = done.length ? Math.round((met / done.length) * 100) : 100;
    return { openCount, unassigned, breached, resolved, avgHours, compliance };
  }, [all, isBreached, dueAt]);

  const viewCount = React.useCallback(
    (k: ViewKey) => {
      switch (k) {
        case "all": return all.filter(isOpen).length;
        case "unassigned": return all.filter((t) => isOpen(t) && !t.assigned_to).length;
        case "assigned": return all.filter((t) => isOpen(t) && t.assigned_to === user?.id).length;
        case "mine": return all.filter((t) => t.submitted_by === user?.id).length;
        case "breached": return all.filter(isBreached).length;
        case "resolved": return all.filter((t) => !isOpen(t)).length;
      }
    },
    [all, user, isBreached],
  );

  const visible = React.useMemo(() => {
    const byView = all.filter((t) => {
      switch (view) {
        case "all": return isOpen(t);
        case "unassigned": return isOpen(t) && !t.assigned_to;
        case "assigned": return isOpen(t) && t.assigned_to === user?.id;
        case "mine": return t.submitted_by === user?.id;
        case "breached": return isBreached(t);
        case "resolved": return !isOpen(t);
      }
    });
    const filtered = byView
      .filter((t) => (fStatus === "all" ? true : t.status === fStatus))
      .filter((t) => (fPriority === "all" ? true : t.priority === fPriority))
      .filter((t) => (fCategory === "all" ? true : t.category === fCategory))
      .filter((t) => (fDept === "all" ? true : t.department === fDept))
      .filter((t) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          t.title.toLowerCase().includes(q) ||
          (t.description ?? "").toLowerCase().includes(q) ||
          String(t.ticket_number).includes(q)
        );
      });

    const prioRank: Record<TicketPriority, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
    const statusRank: Record<TicketStatus, number> = { Open: 0, "In Progress": 1, "On Hold": 2, Resolved: 3, Closed: 4 };
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sort.key) {
        case "ticket_number": return (a.ticket_number - b.ticket_number) * dir;
        case "priority": return (prioRank[a.priority] - prioRank[b.priority]) * dir;
        case "status": return (statusRank[a.status] - statusRank[b.status]) * dir;
        case "due": return (dueAt(a).getTime() - dueAt(b).getTime()) * dir;
        default: return (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) * dir;
      }
    });
  }, [all, view, user, isBreached, fStatus, fPriority, fCategory, fDept, search, sort, dueAt]);

  React.useEffect(() => { setSelected([]); }, [view, search, fStatus, fPriority, fCategory, fDept]);

  const nameOf = React.useCallback(
    (id: string | null) => {
      if (!id) return "Unassigned";
      const p = profiles?.find((x) => x.id === id);
      return p?.full_name ?? p?.email ?? "—";
    },
    [profiles],
  );

  const bulkUpdate = async (patch: Record<string, unknown>, label: string) => {
    if (selected.length === 0) return;
    const { error } = await supabase.from("tickets").update(patch).in("id", selected);
    if (error) return toast.error(error.message);
    toast.success(`${selected.length} ticket(s) ${label}`);
    setSelected([]);
    qc.invalidateQueries({ queryKey: ["tickets"] });
  };

  const exportCsv = () => {
    const head = ["ID", "Title", "Requester", "Technician", "Category", "Department", "Priority", "Status", "Created", "Due by", "Updated"];
    const rows = visible.map((t) => [
      `#${String(t.ticket_number).padStart(5, "0")}`, t.title, nameOf(t.submitted_by), nameOf(t.assigned_to),
      t.category, t.department ?? "", t.priority, t.status,
      format(new Date(t.created_at), "yyyy-MM-dd HH:mm"), format(dueAt(t), "yyyy-MM-dd HH:mm"),
      format(new Date(t.updated_at), "yyyy-MM-dd HH:mm"),
    ]);
    const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = `helpdesk-${format(new Date(), "yyyyMMdd-HHmm")}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const toggleSort = (key: SortKey) =>
    setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }));

  const activeFilters = [fStatus, fPriority, fCategory, fDept].filter((f) => f !== "all").length;

  return (
    <div className="space-y-5">
      {/* Command bar */}
      <div className="rounded-xl border bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
              <LifeBuoy className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Service Desk</h1>
              <p className="text-sm text-muted-foreground max-w-2xl">
                Incident and request console — triage the queue, assign technicians, track SLA due times and keep a full
                audit trail per ticket.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-2" />Export</Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button size="lg"><Plus className="h-4 w-4 mr-2" />New ticket</Button></DialogTrigger>
              <NewTicketDialog onSaved={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["tickets"] }); }} />
            </Dialog>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <StatCard label="Open" value={stats.openCount} icon={<Clock className="h-4 w-4" />} tone="text-primary" />
        <StatCard label="Unassigned" value={stats.unassigned} icon={<UserX className="h-4 w-4" />} tone="text-warning" />
        <StatCard label="SLA overdue" value={stats.breached} icon={<AlertOctagon className="h-4 w-4" />} tone="text-destructive" />
        <StatCard label="Resolved" value={stats.resolved} icon={<CheckCircle2 className="h-4 w-4" />} tone="text-success" />
        <StatCard label="Avg resolution" value={`${stats.avgHours.toFixed(1)}h`} icon={<Timer className="h-4 w-4" />} tone="text-info" />
        <StatCard label="SLA met" value={`${stats.compliance}%`} icon={<Gauge className="h-4 w-4" />} tone="text-success" />
      </div>

      <div className="grid lg:grid-cols-[220px_1fr] gap-5 items-start">
        {/* Saved views */}
        <Card className="p-2">
          <p className="px-2 pt-1 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Views</p>
          <div className="space-y-0.5">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm transition-colors",
                  view === v.key ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-foreground/80",
                )}
              >
                {v.icon}
                <span className="flex-1 text-left truncate">{v.label}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{viewCount(v.key)}</span>
              </button>
            ))}
          </div>
        </Card>

        <div className="space-y-3 min-w-0">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by subject, description or ticket #"
                className="pl-8"
              />
            </div>
            <Select value={fStatus} onValueChange={setFStatus}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={fPriority} onValueChange={setFPriority}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Priority" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={fCategory} onValueChange={setFCategory}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {(catNames.length ? catNames : CATEGORIES).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={fDept} onValueChange={setFDept}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Department" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {DEPARTMENTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
            {activeFilters > 0 && (
              <Button
                variant="ghost" size="sm"
                onClick={() => { setFStatus("all"); setFPriority("all"); setFCategory("all"); setFDept("all"); }}
              >
                <X className="h-4 w-4 mr-1" />Clear ({activeFilters})
              </Button>
            )}
          </div>

          {/* Bulk actions */}
          {isStaff && selected.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-primary/5 px-3 py-2">
              <span className="text-sm font-medium">{selected.length} selected</span>
              <Separator orientation="vertical" className="h-5" />
              <Select onValueChange={(v) => bulkUpdate({ assigned_to: v === "__none__" ? null : v }, "reassigned")}>
                <SelectTrigger className="w-[170px] h-8"><SelectValue placeholder="Assign to…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Unassigned</SelectItem>
                  {(profiles ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name ?? p.email}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select onValueChange={(v) => bulkUpdate({ status: v, ...(v === "Resolved" ? { resolved_at: new Date().toISOString() } : {}) }, "updated")}>
                <SelectTrigger className="w-[150px] h-8"><SelectValue placeholder="Set status…" /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
              <Select onValueChange={(v) => bulkUpdate({ priority: v }, "reprioritised")}>
                <SelectTrigger className="w-[150px] h-8"><SelectValue placeholder="Set priority…" /></SelectTrigger>
                <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
              <Button variant="ghost" size="sm" onClick={() => setSelected([])}>Clear selection</Button>
            </div>
          )}

          <TicketTable
            tickets={visible}
            onSelect={setActive}
            nameOf={nameOf}
            dueAt={dueAt}
            isBreached={isBreached}
            selectable={isStaff}
            selected={selected}
            setSelected={setSelected}
            sort={sort}
            toggleSort={toggleSort}
          />
        </div>
      </div>

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        {active && (
          <TicketDetail
            ticket={active}
            profiles={profiles ?? []}
            isStaff={isStaff}
            dueAt={dueAt}
            onChanged={() => { qc.invalidateQueries({ queryKey: ["tickets"] }); }}
          />
        )}
      </Dialog>
    </div>
  );
}

function StatCard({ label, value, icon, tone }: { label: string; value: number | string; icon: React.ReactNode; tone: string }) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className={`flex items-center gap-2 text-xs font-medium ${tone}`}>{icon}{label}</div>
        <div className="text-2xl font-semibold mt-1 tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

function DueCell({ due, breached, resolved }: { due: Date; breached: boolean; resolved: boolean }) {
  if (resolved) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="text-xs leading-tight">
      <div className={cn("font-medium", breached ? "text-destructive" : "text-foreground")}>
        {format(due, "dd MMM, HH:mm")}
      </div>
      <div className={breached ? "text-destructive" : "text-muted-foreground"}>
        {breached ? `overdue ${formatDistanceToNowStrict(due)}` : `in ${formatDistanceToNowStrict(due)}`}
      </div>
    </div>
  );
}

function TicketTable({
  tickets, onSelect, nameOf, dueAt, isBreached, selectable, selected, setSelected, sort, toggleSort,
}: {
  tickets: Ticket[];
  onSelect: (t: Ticket) => void;
  nameOf: (id: string | null) => string;
  dueAt: (t: Ticket) => Date;
  isBreached: (t: Ticket) => boolean;
  selectable: boolean;
  selected: string[];
  setSelected: React.Dispatch<React.SetStateAction<string[]>>;
  sort: { key: SortKey; dir: "asc" | "desc" };
  toggleSort: (k: SortKey) => void;
}) {
  const allChecked = tickets.length > 0 && selected.length === tickets.length;
  const SortHead = ({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <TableHead className={className}>
      <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort(k)}>
        {children}
        {sort.key === k && (sort.dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
      </button>
    </TableHead>
  );

  if (tickets.length === 0) {
    return (
      <div className="bg-card border rounded-lg p-12 text-center">
        <Inbox className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
        <p className="text-sm font-medium">Nothing in this view</p>
        <p className="text-xs text-muted-foreground">Try a different view or clear your filters.</p>
      </div>
    );
  }

  return (
    <div className="bg-card border rounded-lg overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {selectable && (
              <TableHead className="w-[40px]">
                <Checkbox
                  checked={allChecked}
                  onCheckedChange={(c) => setSelected(c ? tickets.map((t) => t.id) : [])}
                  aria-label="Select all"
                />
              </TableHead>
            )}
            <SortHead k="ticket_number" className="w-[86px]">ID</SortHead>
            <TableHead>Subject</TableHead>
            <TableHead>Requester</TableHead>
            <TableHead>Technician</TableHead>
            <SortHead k="priority">Priority</SortHead>
            <SortHead k="status">Status</SortHead>
            <SortHead k="due">Due by</SortHead>
            <SortHead k="updated_at">Updated</SortHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tickets.map((t) => {
            const breached = isBreached(t);
            const checked = selected.includes(t.id);
            return (
              <TableRow
                key={t.id}
                onClick={() => onSelect(t)}
                className={cn("cursor-pointer", checked && "bg-primary/5")}
              >
                {selectable && (
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(c) =>
                        setSelected((s) => (c ? [...s, t.id] : s.filter((id) => id !== t.id)))
                      }
                      aria-label={`Select ticket ${t.ticket_number}`}
                    />
                  </TableCell>
                )}
                <TableCell className="font-mono text-xs text-muted-foreground align-top pt-4">
                  #{String(t.ticket_number).padStart(5, "0")}
                </TableCell>
                <TableCell className="max-w-[380px]">
                  <div className="flex items-start gap-2">
                    <span
                      className={cn(
                        "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                        t.priority === "Critical" ? "bg-destructive"
                          : t.priority === "High" ? "bg-warning"
                          : t.priority === "Medium" ? "bg-info" : "bg-muted-foreground/40",
                      )}
                    />
                    <div className="min-w-0">
                      <div className="font-medium truncate">{t.title}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {t.category} · {t.department ?? "No department"} · raised {format(new Date(t.created_at), "dd MMM yyyy, HH:mm")}
                        {t.attachment_url ? " · 1 attachment" : ""}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-sm">{nameOf(t.submitted_by)}</TableCell>
                <TableCell className="text-sm">
                  <span className={cn(!t.assigned_to && "text-muted-foreground italic")}>{nameOf(t.assigned_to)}</span>
                </TableCell>
                <TableCell><PriorityBadge value={t.priority} /></TableCell>
                <TableCell><StatusBadge value={t.status} /></TableCell>
                <TableCell><DueCell due={dueAt(t)} breached={breached} resolved={!isOpen(t)} /></TableCell>
                <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                  {formatDistanceToNowStrict(new Date(t.updated_at))} ago
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function NewTicketDialog({ onSaved }: { onSaved: () => void }) {
  const { user, fullName } = useAuth();
  const { data: cats } = useTicketCategories();
  const { data: settings } = useHelpdeskSettings();
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [category, setCategory] = React.useState<TicketCategory>("Other");
  const [priority, setPriority] = React.useState<TicketPriority>("Medium");
  const [department, setDepartment] = React.useState<Department>("IT");
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    let attachment_url: string | null = null;
    if (file) {
      const path = `${user.id}/${Date.now()}-${file.name}`;
      const up = await supabase.storage.from("ticket-attachments").upload(path, file);
      if (up.error) { setBusy(false); return toast.error(up.error.message); }
      const pub = supabase.storage.from("ticket-attachments").getPublicUrl(path);
      attachment_url = pub.data.publicUrl;
    }
    const { data: inserted, error } = await supabase.from("tickets").insert({
      title, description, category, priority, department,
      submitted_by: user.id, attachment_url,
      assigned_to: settings?.default_assignee ?? null,
    }).select("id").single();
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Ticket created");
    if (inserted?.id) {
      sendTicketNotificationEmail({ data: { ticketId: inserted.id, event: "created" } }).catch((e: any) => toast.error("Email notification failed: " + (e?.message ?? e)));
    }
    onSaved();
  };

  return (
    <DialogContent className="max-w-xl">
      <DialogHeader>
        <DialogTitle>New ticket</DialogTitle>
        <p className="text-xs text-muted-foreground">
          A ticket number will be auto-assigned on submit. SLA due time is derived from the priority you choose.
        </p>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Requestor</Label>
            <Input value={fullName ?? user?.email ?? ""} disabled />
          </div>
          <div>
            <Label>Email</Label>
            <Input value={user?.email ?? ""} disabled />
          </div>
        </div>
        <div><Label>Title</Label><Input required value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div><Label>Description</Label><Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>Category</Label>
            <Select
              value={category}
              onValueChange={(v) => {
                setCategory(v as TicketCategory);
                const match = (cats ?? []).find((c) => c.name === v);
                if (match) setPriority(match.default_priority);
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {((cats ?? []).length ? (cats ?? []).map((c) => c.name) : CATEGORIES)
                  .map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            {(cats ?? []).find((c) => c.name === category)?.description && (
              <p className="text-[11px] text-muted-foreground mt-1">
                {(cats ?? []).find((c) => c.name === category)?.description}
              </p>
            )}
          </div>
          <div>
            <Label>Priority</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as TicketPriority)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Department</Label>
            <Select value={department} onValueChange={(v) => setDepartment(v as Department)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{DEPARTMENTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        {settings?.allow_attachments !== false && (
          <div>
            <Label>Attachment (optional)</Label>
            <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
        )}
        <DialogFooter><Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create ticket"}</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}

function TicketDetail({
  ticket, profiles, isStaff, dueAt, onChanged,
}: { ticket: Ticket; profiles: Profile[]; isStaff: boolean; dueAt: (t: Ticket) => Date; onChanged: () => void }) {
  const { user } = useAuth();
  const [status, setStatus] = React.useState<TicketStatus>(ticket.status);
  const [priority, setPriority] = React.useState<TicketPriority>(ticket.priority);
  const [assignee, setAssignee] = React.useState<string>(ticket.assigned_to ?? "__none__");
  const [body, setBody] = React.useState("");
  const [internal, setInternal] = React.useState(false);

  const { data: comments, refetch } = useQuery({
    queryKey: ["comments", ticket.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("ticket_comments").select("*")
        .eq("ticket_id", ticket.id).order("created_at", { ascending: true });
      return (data ?? []) as TicketComment[];
    },
  });

  const updateMeta = async () => {
    const patch: Record<string, unknown> = {
      status, priority, assigned_to: assignee === "__none__" ? null : assignee,
    };
    if (status === "Resolved" && !ticket.resolved_at) patch.resolved_at = new Date().toISOString();
    const { error } = await supabase.from("tickets").update(patch).eq("id", ticket.id);
    if (error) return toast.error(error.message);
    toast.success("Ticket updated");
    const newAssignee = assignee === "__none__" ? null : assignee;
    if (newAssignee && newAssignee !== ticket.assigned_to) {
      sendTicketNotificationEmail({ data: { ticketId: ticket.id, event: "assigned" } }).catch((e: any) => toast.error("Email notification failed: " + (e?.message ?? e)));
    }
    if (status !== ticket.status) {
      sendTicketNotificationEmail({ data: { ticketId: ticket.id, event: "status" } }).catch((e: any) => toast.error("Email notification failed: " + (e?.message ?? e)));
    }
    onChanged();
  };

  const addComment = async () => {
    if (!body.trim() || !user) return;
    const text = body;
    const wasInternal = internal;
    const { error } = await supabase.from("ticket_comments").insert({
      ticket_id: ticket.id, author_id: user.id, body: text, is_internal: wasInternal,
    });
    if (error) return toast.error(error.message);
    setBody(""); setInternal(false); refetch();
    if (!wasInternal) {
      sendTicketNotificationEmail({ data: { ticketId: ticket.id, event: "comment", note: text } }).catch((e: any) => toast.error("Email notification failed: " + (e?.message ?? e)));
    }
  };

  const visibleComments = (comments ?? []).filter((c) => isStaff || !c.is_internal);
  const nameOf = (id: string | null) => {
    if (!id) return "Unassigned";
    const p = profiles.find((x) => x.id === id);
    return p?.full_name ?? p?.email ?? "—";
  };
  const due = dueAt(ticket);
  const breached = isOpen(ticket) && due.getTime() < Date.now();

  return (
    <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="pr-8">
          <span className="font-mono text-muted-foreground mr-2">#{String(ticket.ticket_number).padStart(5, "0")}</span>
          {ticket.title}
        </DialogTitle>
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
          <PriorityBadge value={ticket.priority} />
          <StatusBadge value={ticket.status} />
          <span className="text-muted-foreground">{ticket.category} · {ticket.department ?? "No department"}</span>
          <span className={cn("px-2 py-0.5 rounded-md font-medium", breached ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground")}>
            {isOpen(ticket)
              ? breached ? `SLA overdue by ${formatDistanceToNowStrict(due)}` : `SLA due ${format(due, "dd MMM, HH:mm")}`
              : ticket.resolved_at ? `Resolved ${format(new Date(ticket.resolved_at), "dd MMM, HH:mm")}` : "Closed"}
          </span>
        </div>
      </DialogHeader>

      <Tabs defaultValue="conversation">
        <TabsList>
          <TabsTrigger value="conversation">Conversation ({visibleComments.length})</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
          {isStaff && <TabsTrigger value="manage">Manage</TabsTrigger>}
        </TabsList>

        <TabsContent value="conversation" className="space-y-3 pt-3">
          <Card><CardContent className="pt-6 text-sm whitespace-pre-wrap">{ticket.description || "No description provided."}</CardContent></Card>
          {ticket.attachment_url && (
            <a href={ticket.attachment_url} target="_blank" rel="noreferrer"
               className="inline-flex items-center text-sm text-primary hover:underline">
              <Paperclip className="h-4 w-4 mr-1" /> Attachment
            </a>
          )}
          {visibleComments.length === 0 && <p className="text-sm text-muted-foreground">No replies yet.</p>}
          {visibleComments.map((c) => (
            <div key={c.id} className={`p-3 rounded-md text-sm ${c.is_internal ? "bg-warning/10 border border-warning/30" : "bg-muted"}`}>
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>{nameOf(c.author_id)} {c.is_internal && "· internal note"}</span>
                <span>{format(new Date(c.created_at), "PPp")}</span>
              </div>
              <div className="whitespace-pre-wrap">{c.body}</div>
            </div>
          ))}
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a reply…" rows={3} />
          <div className="flex items-center justify-between">
            {isStaff ? (
              <label className="flex items-center gap-2 text-xs">
                <Switch checked={internal} onCheckedChange={setInternal} /> Internal note (hidden from requester)
              </label>
            ) : <span />}
            <Button onClick={addComment} disabled={!body.trim()}>Post reply</Button>
          </div>
        </TabsContent>

        <TabsContent value="details" className="pt-3">
          <Card>
            <CardContent className="pt-6 grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <Field label="Requester" value={nameOf(ticket.submitted_by)} />
              <Field label="Technician" value={nameOf(ticket.assigned_to)} />
              <Field label="Category" value={ticket.category} />
              <Field label="Department" value={ticket.department ?? "—"} />
              <Field label="Created" value={format(new Date(ticket.created_at), "PPp")} />
              <Field label="Last updated" value={format(new Date(ticket.updated_at), "PPp")} />
              <Field label="SLA due" value={format(due, "PPp")} />
              <Field label="Resolved" value={ticket.resolved_at ? format(new Date(ticket.resolved_at), "PPp") : "—"} />
            </CardContent>
          </Card>
        </TabsContent>

        {isStaff && (
          <TabsContent value="manage" className="pt-3">
            <Card>
              <CardHeader><CardTitle className="text-base">Update ticket</CardTitle></CardHeader>
              <CardContent className="grid sm:grid-cols-3 gap-3">
                <div>
                  <Label>Status</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as TicketStatus)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Priority</Label>
                  <Select value={priority} onValueChange={(v) => setPriority(v as TicketPriority)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Assign to</Label>
                  <Select value={assignee} onValueChange={setAssignee}>
                    <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Unassigned</SelectItem>
                      {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name ?? p.email}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-3 flex justify-end">
                  <Button size="sm" onClick={updateMeta}>Save changes</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </DialogContent>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
