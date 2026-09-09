import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConditionBadge } from "../shared/badges";
import { CONDITIONS, DEPARTMENTS, type Asset, type Verification } from "@/lib/types";
import { format } from "date-fns";
import { FileDown, FileText } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";

const ALL = "__all__";

interface Row {
  asset_id: string;
  description: string;
  department: string;
  condition: string;
  verified_by: string;
  verified_at: string;
}

export function ReportsPage() {
  const today = new Date();
  const monthAgo = new Date(today.getTime() - 30 * 86_400_000);
  const [from, setFrom] = React.useState(monthAgo.toISOString().slice(0, 10));
  const [to, setTo] = React.useState(today.toISOString().slice(0, 10));
  const [dept, setDept] = React.useState<string>(ALL);
  const [cond, setCond] = React.useState<string>(ALL);
  const [verifier, setVerifier] = React.useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["report-data"],
    queryFn: async () => {
      const [v, a] = await Promise.all([
        supabase.from("verifications").select("*"),
        supabase.from("assets").select("*").eq("is_deleted", false),
      ]);
      return {
        vers: (v.data ?? []) as Verification[],
        assets: (a.data ?? []) as Asset[],
      };
    },
  });

  const rows: Row[] = React.useMemo(() => {
    if (!data) return [];
    const assetMap = new Map(data.assets.map((a) => [a.asset_id, a]));
    const fromTs = new Date(from).getTime();
    const toTs = new Date(to).getTime() + 86_400_000;
    return data.vers
      .filter((v) => {
        const t = new Date(v.verified_at).getTime();
        if (t < fromTs || t > toTs) return false;
        const a = assetMap.get(v.asset_id);
        if (dept !== ALL && a?.department !== dept) return false;
        if (cond !== ALL && v.condition_at_verification !== cond) return false;
        if (verifier && !v.verified_by.toLowerCase().includes(verifier.toLowerCase())) return false;
        return true;
      })
      .sort((x, y) => y.verified_at.localeCompare(x.verified_at))
      .map((v) => {
        const a = assetMap.get(v.asset_id);
        return {
          asset_id: v.asset_id,
          description: a?.asset_description ?? "",
          department: a?.department ?? "",
          condition: v.condition_at_verification ?? "",
          verified_by: v.verified_by,
          verified_at: format(new Date(v.verified_at), "yyyy-MM-dd HH:mm"),
        };
      });
  }, [data, from, to, dept, cond, verifier]);

  const summary = React.useMemo(() => {
    const byDept: Record<string, number> = {};
    const byCond: Record<string, number> = {};
    rows.forEach((r) => {
      byDept[r.department || "—"] = (byDept[r.department || "—"] ?? 0) + 1;
      byCond[r.condition || "—"] = (byCond[r.condition || "—"] ?? 0) + 1;
    });
    return { total: rows.length, byDept, byCond };
  }, [rows]);

  const exportPdf = () => {
    if (rows.length === 0) return toast.error("No rows to export");
    const doc = new jsPDF();
    doc.setFillColor(20, 50, 110);
    doc.rect(0, 0, 210, 22, "F");
    doc.setTextColor(255);
    doc.setFontSize(16);
    doc.text("Tipp Focus — Asset Verification Report", 14, 14);
    doc.setTextColor(0);
    doc.setFontSize(10);
    doc.text(`Range: ${from} to ${to}`, 14, 30);
    doc.text(`Total verified: ${summary.total}`, 14, 36);

    autoTable(doc, {
      startY: 42,
      head: [["Asset ID", "Description", "Department", "Condition", "Verified By", "Date & Time"]],
      body: rows.map((r) => [r.asset_id, r.description, r.department, r.condition, r.verified_by, r.verified_at]),
      headStyles: { fillColor: [20, 50, 110] },
      styles: { fontSize: 9 },
    });

    const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    doc.setFontSize(11);
    doc.text("Summary", 14, finalY);
    doc.setFontSize(9);
    let y = finalY + 6;
    doc.text("By department:", 14, y); y += 5;
    Object.entries(summary.byDept).forEach(([k, v]) => { doc.text(`  ${k}: ${v}`, 16, y); y += 4; });
    y += 2;
    doc.text("By condition:", 14, y); y += 5;
    Object.entries(summary.byCond).forEach(([k, v]) => { doc.text(`  ${k}: ${v}`, 16, y); y += 4; });

    doc.save(`tippfocus-report-${from}-to-${to}.pdf`);
  };

  const exportCsv = async () => {
    const { data: assets } = await supabase.from("assets").select("*").eq("is_deleted", false);
    const list = (assets ?? []) as Asset[];
    if (list.length === 0) return toast.error("No assets to export");
    const headers = [
      "asset_id","barcode","serial_number","asset_description","assigned_to","location",
      "department","asset_condition","last_verified_date","verified_by","returned_date","created_at",
    ];
    const csv = [
      headers.join(","),
      ...list.map((a) => headers.map((h) => {
        const v = (a as unknown as Record<string, unknown>)[h];
        if (v == null) return "";
        const s = String(v).replace(/"/g, '""');
        return /[,"\n]/.test(s) ? `"${s}"` : s;
      }).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `tippfocus-assets-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Reports</h1>
          <p className="text-sm text-muted-foreground">Verified assets within range, exportable to PDF.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={exportCsv}><FileDown className="h-4 w-4 mr-2" />CSV register</Button>
          <Button onClick={exportPdf}><FileText className="h-4 w-4 mr-2" />Export PDF</Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Filters</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-5">
            <div className="space-y-1"><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div className="space-y-1"><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            <div className="space-y-1">
              <Label>Department</Label>
              <Select value={dept} onValueChange={setDept}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All</SelectItem>
                  {DEPARTMENTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Condition</Label>
              <Select value={cond} onValueChange={setCond}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All</SelectItem>
                  {CONDITIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Verifier</Label><Input placeholder="email contains…" value={verifier} onChange={(e) => setVerifier(e.target.value)} /></div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        <Card><CardContent className="pt-6"><div className="text-xs uppercase text-muted-foreground">Total</div><div className="text-3xl font-semibold">{summary.total}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs uppercase text-muted-foreground">By department</div><div className="text-sm mt-1">{Object.entries(summary.byDept).map(([k,v]) => `${k}: ${v}`).join("  ·  ") || "—"}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs uppercase text-muted-foreground">By condition</div><div className="text-sm mt-1">{Object.entries(summary.byCond).map(([k,v]) => `${k}: ${v}`).join("  ·  ") || "—"}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Preview</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No verifications match your filters.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset ID</TableHead><TableHead>Description</TableHead>
                  <TableHead>Department</TableHead><TableHead>Condition</TableHead>
                  <TableHead>Verified by</TableHead><TableHead>Date & time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{r.asset_id}</TableCell>
                    <TableCell>{r.description}</TableCell>
                    <TableCell>{r.department}</TableCell>
                    <TableCell><ConditionBadge value={r.condition as never} /></TableCell>
                    <TableCell>{r.verified_by}</TableCell>
                    <TableCell>{r.verified_at}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
