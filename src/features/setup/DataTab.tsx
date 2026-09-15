import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Download, History, Search } from "lucide-react";
import type { ActivityLogRow } from "@/lib/types";
import { toast } from "sonner";
import { format } from "date-fns";

function toCsv(rows: Record<string, unknown>[]) {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

function download(name: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function DataTab() {
  const { data: counts } = useQuery({
    queryKey: ["data_counts"],
    queryFn: async () => {
      const [assets, tickets, verifications, users, activity] = await Promise.all([
        supabase.from("assets").select("asset_id", { count: "exact", head: true }).eq("is_deleted", false),
        supabase.from("tickets").select("id", { count: "exact", head: true }),
        supabase.from("verifications").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("activity_log" as never).select("id", { count: "exact", head: true }),
      ]);
      return {
        assets: assets.count ?? 0,
        tickets: tickets.count ?? 0,
        verifications: verifications.count ?? 0,
        users: users.count ?? 0,
        activity: activity.count ?? 0,
      };
    },
  });

  const exportTable = async (table: string, filename: string) => {
    const { data, error } = await supabase.from(table as never).select("*").limit(5000);
    if (error) return toast.error(error.message);
    const rows = (data ?? []) as Record<string, unknown>[];
    if (rows.length === 0) return toast.error("Nothing to export");
    download(filename, toCsv(rows));
    toast.success(`${rows.length} rows exported`);
  };

  const stats = [
    { label: "Active assets", value: counts?.assets },
    { label: "Tickets", value: counts?.tickets },
    { label: "Verifications", value: counts?.verifications },
    { label: "Users", value: counts?.users },
    { label: "Logged events", value: counts?.activity },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Data overview</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg border p-4">
              <p className="text-2xl font-semibold">{s.value ?? "—"}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Export</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">Download a CSV snapshot for reporting or backup.</p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => exportTable("assets", "assets.csv")}><Download className="h-4 w-4 mr-1" />Assets</Button>
          <Button variant="outline" onClick={() => exportTable("tickets", "tickets.csv")}><Download className="h-4 w-4 mr-1" />Tickets</Button>
          <Button variant="outline" onClick={() => exportTable("verifications", "verifications.csv")}><Download className="h-4 w-4 mr-1" />Verifications</Button>
          <Button variant="outline" onClick={() => exportTable("profiles", "users.csv")}><Download className="h-4 w-4 mr-1" />Users</Button>
          <Button variant="outline" onClick={() => exportTable("activity_log", "activity-log.csv")}><Download className="h-4 w-4 mr-1" />Activity log</Button>
        </CardContent>
      </Card>

      <ActivityLogCard />
    </div>
  );
}

function ActivityLogCard() {
  const [table, setTable] = React.useState("all");
  const [q, setQ] = React.useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["activity_log", table],
    queryFn: async () => {
      let query = supabase.from("activity_log" as never).select("*")
        .order("created_at", { ascending: false }).limit(200);
      if (table !== "all") query = query.eq("table_name", table);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as ActivityLogRow[];
    },
    refetchInterval: 30_000,
  });

  const rows = (data ?? []).filter((r) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return (r.actor_email ?? "").toLowerCase().includes(s) || (r.record_id ?? "").toLowerCase().includes(s);
  });

  const actionColor: Record<string, string> = {
    INSERT: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
    UPDATE: "bg-amber-500/10 text-amber-700 border-amber-500/30",
    DELETE: "bg-red-500/10 text-red-600 border-red-500/30",
  };

  const summarise = (r: ActivityLogRow) => {
    if (r.action !== "UPDATE" || !r.changes) return r.action === "INSERT" ? "Created" : "Deleted";
    const keys = Object.keys(r.changes).filter((k) => k !== "updated_at");
    return keys.length ? `Changed ${keys.slice(0, 4).join(", ")}${keys.length > 4 ? "…" : ""}` : "Updated";
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
        <div>
          <CardTitle className="text-base flex items-center gap-2"><History className="h-4 w-4" />Activity log</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">Last 200 changes to tickets and assets, with who made them.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-56">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search user or record" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={table} onValueChange={setTable}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All records</SelectItem>
              <SelectItem value="tickets">Tickets</SelectItem>
              <SelectItem value="assets">Assets</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Who</TableHead>
                <TableHead>Record</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>}
              {!isLoading && rows.length === 0 && <TableRow><TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">No activity yet.</TableCell></TableRow>}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{format(new Date(r.created_at), "PPp")}</TableCell>
                  <TableCell className="text-sm">{r.actor_email ?? "System"}</TableCell>
                  <TableCell className="text-xs font-mono">{r.table_name} · {(r.record_id ?? "").slice(0, 8)}</TableCell>
                  <TableCell><Badge variant="outline" className={actionColor[r.action]}>{r.action}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[320px] truncate">{summarise(r)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
