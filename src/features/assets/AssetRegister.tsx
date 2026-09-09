import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ConditionBadge, VerifiedBadge } from "../shared/badges";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import {
  CONDITIONS, DEPARTMENTS, type Asset, type AssetCondition, type Department, type Profile,
} from "@/lib/types";
import { format } from "date-fns";

const ALL = "__all__";

export function AssetRegister() {
  const { role } = useAuth();
  const canWrite = role === "admin" || role === "technician";
  const qc = useQueryClient();
  const [search, setSearch] = React.useState("");
  const [dept, setDept] = React.useState<string>(ALL);
  const [cond, setCond] = React.useState<string>(ALL);
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [editing, setEditing] = React.useState<Asset | null>(null);
  const [open, setOpen] = React.useState(false);

  const { data: assets, isLoading } = useQuery({
    queryKey: ["assets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assets").select("*").eq("is_deleted", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Asset[];
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, email, department");
      return (data ?? []) as Profile[];
    },
  });

  const filtered = (assets ?? []).filter((a) => {
    if (dept !== ALL && a.department !== dept) return false;
    if (cond !== ALL && a.asset_condition !== cond) return false;
    const reg = (a.registration_date ?? a.created_at ?? "").slice(0, 10);
    if (from && (!reg || reg < from)) return false;
    if (to && (!reg || reg > to)) return false;
    if (search) {
      const s = search.toLowerCase();
      return [a.asset_id, a.barcode, a.serial_number, a.asset_description, a.assigned_to, a.location]
        .some((v) => (v ?? "").toString().toLowerCase().includes(s));
    }
    return true;
  });

  const onDelete = async (id: string) => {
    if (!confirm(`Soft-delete asset ${id}?`)) return;
    const { error } = await supabase.from("assets").update({ is_deleted: true }).eq("asset_id", id);
    if (error) return toast.error(error.message);
    toast.success("Asset deleted");
    qc.invalidateQueries({ queryKey: ["assets"] });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Asset Register</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} of {assets?.length ?? 0} assets</p>
        </div>
        {canWrite && (
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button onClick={() => setEditing(null)}>
                <Plus className="h-4 w-4 mr-2" /> New asset
              </Button>
            </DialogTrigger>
            <AssetFormDialog
              key={editing?.asset_id ?? "new"}
              editing={editing}
              profiles={profiles ?? []}
              onSaved={() => { setOpen(false); setEditing(null); qc.invalidateQueries({ queryKey: ["assets"] }); }}
            />
          </Dialog>
        )}
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search asset id, serial, description, user, location"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={dept} onValueChange={setDept}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Department" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All departments</SelectItem>
            {DEPARTMENTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={cond} onValueChange={setCond}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Condition" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All conditions</SelectItem>
            {CONDITIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">Registered</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[150px]" aria-label="Registered from" />
          <span className="text-muted-foreground text-sm">to</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-[150px]" aria-label="Registered to" />
          {(from || to) && (
            <Button variant="ghost" size="sm" onClick={() => { setFrom(""); setTo(""); }}>Clear</Button>
          )}
        </div>
      </div>

      <div className="bg-card rounded-lg border overflow-x-auto">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            No assets match your filters. {canWrite && "Click \u201cNew asset\u201d to add one."}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset ID</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Assigned to</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead>Registered</TableHead>
                <TableHead>Last verified</TableHead>
                {canWrite && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((a) => (
                <TableRow key={a.asset_id}>
                  <TableCell className="font-mono text-xs">{a.asset_id}</TableCell>
                  <TableCell>{a.asset_description ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell>{a.department ?? "—"}</TableCell>
                  <TableCell>{a.assigned_to ?? "—"}</TableCell>
                  <TableCell>{a.location ?? "—"}</TableCell>
                  <TableCell><ConditionBadge value={a.asset_condition} /></TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {a.registration_date || a.created_at
                      ? format(new Date(a.registration_date ?? a.created_at), "dd MMM yyyy")
                      : "—"}
                  </TableCell>
                  <TableCell><VerifiedBadge date={a.last_verified_date} /></TableCell>
                  {canWrite && (
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => { setEditing(a); setOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => onDelete(a.asset_id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

function AssetFormDialog({
  editing, profiles, onSaved,
}: {
  editing: Asset | null;
  profiles: Profile[];
  onSaved: () => void;
}) {
  const [form, setForm] = React.useState(() => ({
    asset_id: editing?.asset_id ?? "",
    serial_number: editing?.serial_number ?? "",
    asset_description: editing?.asset_description ?? "",
    assigned_to: editing?.assigned_to ?? "",
    location: editing?.location ?? "",
    department: (editing?.department ?? "IT") as Department,
    asset_condition: (editing?.asset_condition ?? "Good") as AssetCondition,
    reallocated_to: editing?.reallocated_to ?? "",
    returned_date: editing?.returned_date?.slice(0, 10) ?? "",
    registration_date:
      (editing?.registration_date ?? editing?.created_at)?.slice(0, 10) ??
      new Date().toISOString().slice(0, 10),
  }));
  const [busy, setBusy] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.asset_id) return toast.error("Asset ID is required");
    if (!form.registration_date) return toast.error("Registration date is required");
    setBusy(true);
    const payload: Record<string, unknown> = {
      asset_id: form.asset_id,
      barcode: form.asset_id,
      serial_number: form.serial_number || null,
      asset_description: form.asset_description || null,
      assigned_to: form.assigned_to || null,
      location: form.location || null,
      department: form.department,
      asset_condition: form.asset_condition,
      reallocated_to: form.reallocated_to || null,
      returned_date: form.returned_date ? new Date(form.returned_date).toISOString() : null,
      registration_date: new Date(form.registration_date).toISOString(),
      is_deleted: false,
    };
    const { error } = editing
      ? await supabase.from("assets").update(payload).eq("asset_id", editing.asset_id)
      : await supabase.from("assets").insert(payload);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Asset updated" : "Asset created");
    onSaved();
  };

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>{editing ? "Edit asset" : "New asset"}</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Asset ID (barcode)">
          <Input value={form.asset_id} onChange={(e) => setForm({ ...form, asset_id: e.target.value })} disabled={!!editing} required />
        </Field>
        <Field label="Serial number">
          <Input value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} />
        </Field>
        <Field label="Registration date">
          <Input
            type="date"
            required
            value={form.registration_date}
            onChange={(e) => setForm({ ...form, registration_date: e.target.value })}
          />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <Input value={form.asset_description} onChange={(e) => setForm({ ...form, asset_description: e.target.value })} />
        </Field>
        <Field label="Assigned to">
          <Input value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })} placeholder="Name or email" />
        </Field>
        <Field label="Location">
          <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
        </Field>
        <Field label="Department">
          <Select value={form.department} onValueChange={(v) => setForm({ ...form, department: v as Department })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{DEPARTMENTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Condition">
          <Select value={form.asset_condition} onValueChange={(v) => setForm({ ...form, asset_condition: v as AssetCondition })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{CONDITIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Reallocated to">
          <Select value={form.reallocated_to || ALL} onValueChange={(v) => setForm({ ...form, reallocated_to: v === ALL ? "" : v })}>
            <SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>None</SelectItem>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.full_name ?? p.email}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Returned date">
          <Input type="date" value={form.returned_date} onChange={(e) => setForm({ ...form, returned_date: e.target.value })} />
        </Field>
        <DialogFooter className="sm:col-span-2">
          <Button type="submit" disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Create asset"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1 ${className}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
