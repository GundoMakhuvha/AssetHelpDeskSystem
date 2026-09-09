import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Settings, Users, Shield, Tag, Database, LifeBuoy, Megaphone, Search, Save, UserPlus, Loader2 } from "lucide-react";
import { CategoriesTab } from "@/features/setup/CategoriesTab";
import { HelpdeskTab } from "@/features/setup/HelpdeskTab";
import { AnnouncementsTab } from "@/features/setup/AnnouncementsTab";
import { DataTab } from "@/features/setup/DataTab";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { PRIORITIES, type TicketPriority } from "@/lib/types";
import type { AdminUserRow, AppRole } from "@/lib/types";
import { adminCreateUser } from "@/lib/admin-users.functions";
import { format } from "date-fns";
import { toast } from "sonner";


export function SetupPage() {
  const { role } = useAuth();
  const isAdmin = role === "admin";

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6 flex items-start gap-4">
        <div className="h-12 w-12 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
          <Settings className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Setup</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Administer users, roles and help desk configuration. Replaces the SolarWinds Service Desk admin console.
          </p>
        </div>
      </div>

      {!isAdmin ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          Only admins can access Setup.
        </CardContent></Card>
      ) : (
        <Tabs defaultValue="users">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="users"><Users className="h-4 w-4 mr-2" />Users & Roles</TabsTrigger>
            <TabsTrigger value="categories"><Tag className="h-4 w-4 mr-2" />Categories</TabsTrigger>
            <TabsTrigger value="sla"><Shield className="h-4 w-4 mr-2" />SLA & Priorities</TabsTrigger>
            <TabsTrigger value="helpdesk"><LifeBuoy className="h-4 w-4 mr-2" />Help Desk</TabsTrigger>
            <TabsTrigger value="announcements"><Megaphone className="h-4 w-4 mr-2" />Announcements</TabsTrigger>
            <TabsTrigger value="data"><Database className="h-4 w-4 mr-2" />Data & Audit</TabsTrigger>
          </TabsList>

          <TabsContent value="users"><UsersTab /></TabsContent>
          <TabsContent value="categories"><CategoriesTab /></TabsContent>
          <TabsContent value="sla"><SlaTab /></TabsContent>
          <TabsContent value="helpdesk"><HelpdeskTab /></TabsContent>
          <TabsContent value="announcements"><AnnouncementsTab /></TabsContent>
          <TabsContent value="data"><DataTab /></TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function UsersTab() {
  const qc = useQueryClient();
  const [q, setQ] = React.useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin_users"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_users" as never);
      if (error) throw error;
      return (data ?? []) as AdminUserRow[];
    },
  });

  const setRole = async (userId: string, role: AppRole) => {
    const { error } = await supabase.rpc("admin_set_role" as never, { _user_id: userId, _role: role } as never);
    if (error) return toast.error(error.message);
    toast.success("Role updated");
    qc.invalidateQueries({ queryKey: ["admin_users"] });
  };

  const rows = (data ?? []).filter((u) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return (u.full_name ?? "").toLowerCase().includes(s) || u.email.toLowerCase().includes(s);
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
        <div>
          <CardTitle>Users & Roles</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {data?.length ?? 0} users · change role to grant or revoke access.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" className="pl-8" />
          </div>
          <AddUserDialog />
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Last sign-in</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">Loading…</TableCell></TableRow>}
              {!isLoading && rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">No users.</TableCell></TableRow>}
              {rows.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.full_name ?? "—"}</TableCell>
                  <TableCell className="text-sm">{u.email}</TableCell>
                  <TableCell className="text-sm">{u.department ?? "—"}</TableCell>
                  <TableCell>
                    <Select value={u.role ?? "viewer"} onValueChange={(v) => setRole(u.id, v as AppRole)}>
                      <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="technician">Technician</SelectItem>
                        <SelectItem value="asset_manager">Asset Manager</SelectItem>
                        <SelectItem value="asset_viewer">Asset Viewer</SelectItem>
                        <SelectItem value="helpdesk_agent">Help Desk Agent</SelectItem>
                        <SelectItem value="requestor">Requestor</SelectItem>
                        <SelectItem value="viewer">Viewer (legacy)</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {u.last_sign_in_at ? format(new Date(u.last_sign_in_at), "PPp") : <Badge variant="outline">Never</Badge>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {u.user_created_at ? format(new Date(u.user_created_at), "PP") : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

const ROLE_OPTIONS: { value: AppRole; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "technician", label: "Technician" },
  { value: "asset_manager", label: "Asset Manager" },
  { value: "asset_viewer", label: "Asset Viewer" },
  { value: "helpdesk_agent", label: "Help Desk Agent" },
  { value: "requestor", label: "Requestor" },
  { value: "viewer", label: "Viewer (legacy)" },
];

function AddUserDialog() {
  const qc = useQueryClient();
  const createUser = useServerFn(adminCreateUser);
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [form, setForm] = React.useState({
    email: "",
    password: "",
    full_name: "",
    department: "",
    role: "requestor" as AppRole,
  });

  const reset = () => setForm({ email: "", password: "", full_name: "", department: "", role: "requestor" });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await createUser({
        data: {
          email: form.email,
          password: form.password,
          full_name: form.full_name,
          department: form.department || null,
          role: form.role,
        },
      });
      toast.success(`User ${form.email} created`);
      qc.invalidateQueries({ queryKey: ["admin_users"] });
      reset();
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setBusy(false);
    }
  };

  const genPassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
    let p = "";
    const arr = new Uint32Array(14);
    crypto.getRandomValues(arr);
    for (let i = 0; i < arr.length; i++) p += chars[arr[i] % chars.length];
    setForm((f) => ({ ...f, password: p }));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm"><UserPlus className="h-4 w-4 mr-1" /> Add user</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a new user</DialogTitle>
          <DialogDescription>
            Creates the account immediately with a confirmed email. Share the temporary password with the user.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="nu-name">Full name</Label>
            <Input id="nu-name" required value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="nu-email">Email</Label>
            <Input id="nu-email" type="email" required value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="nu-dept">Department (optional)</Label>
            <Input id="nu-dept" value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="nu-pw">Temporary password</Label>
            <div className="flex gap-2">
              <Input id="nu-pw" required minLength={8} value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })} />
              <Button type="button" variant="outline" size="sm" onClick={genPassword}>Generate</Button>
            </div>
            <p className="text-[11px] text-muted-foreground">Min 8 characters. Ask the user to change it after first sign-in.</p>
          </div>
          <div className="space-y-1">
            <Label>Role</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as AppRole })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Create user
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface SlaRow {
  priority: TicketPriority;
  response_minutes: number;
  resolution_minutes: number;
  business_hours_only: boolean;
  notes: string | null;
}

const fmtMins = (m: number) => {
  if (m < 60) return `${m}m`;
  if (m < 60 * 24) return `${Math.round((m / 60) * 10) / 10}h`;
  return `${Math.round((m / 1440) * 10) / 10}d`;
};

function SlaTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["sla_policies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sla_policies" as never).select("*");
      if (error) throw error;
      const order: Record<TicketPriority, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
      return ((data ?? []) as SlaRow[]).sort((a, b) => order[a.priority] - order[b.priority]);
    },
  });

  const [draft, setDraft] = React.useState<Record<string, SlaRow>>({});
  React.useEffect(() => {
    if (data) {
      const map: Record<string, SlaRow> = {};
      data.forEach((r) => (map[r.priority] = { ...r }));
      setDraft(map);
    }
  }, [data]);

  const update = (p: TicketPriority, patch: Partial<SlaRow>) =>
    setDraft((d) => ({ ...d, [p]: { ...d[p], ...patch } }));

  const save = async (p: TicketPriority) => {
    const row = draft[p];
    const { error } = await supabase
      .from("sla_policies" as never)
      .update({
        response_minutes: row.response_minutes,
        resolution_minutes: row.resolution_minutes,
        business_hours_only: row.business_hours_only,
        notes: row.notes,
      } as never)
      .eq("priority", p);
    if (error) return toast.error(error.message);
    toast.success(`${p} SLA saved`);
    qc.invalidateQueries({ queryKey: ["sla_policies"] });
  };

  const priorityColor: Record<TicketPriority, string> = {
    Critical: "bg-red-500/10 text-red-600 border-red-500/30",
    High: "bg-orange-500/10 text-orange-600 border-orange-500/30",
    Medium: "bg-amber-500/10 text-amber-700 border-amber-500/30",
    Low: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>SLA & Priorities</CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Target response and resolution times per ticket priority. Times are in minutes.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && PRIORITIES.slice().reverse().map((p) => {
          const row = draft[p];
          if (!row) return null;
          return (
            <div key={p} className="rounded-lg border p-4 grid gap-4 md:grid-cols-[120px_1fr_1fr_auto_auto] md:items-end">
              <div>
                <Badge variant="outline" className={priorityColor[p]}>{p}</Badge>
                <p className="text-xs text-muted-foreground mt-2">
                  Resp {fmtMins(row.response_minutes)} · Resolve {fmtMins(row.resolution_minutes)}
                </p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Response (mins)</Label>
                <Input
                  type="number" min={1}
                  value={row.response_minutes}
                  onChange={(e) => update(p, { response_minutes: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Resolution (mins)</Label>
                <Input
                  type="number" min={1}
                  value={row.resolution_minutes}
                  onChange={(e) => update(p, { resolution_minutes: Number(e.target.value) })}
                />
              </div>
              <div className="flex items-center gap-2 pb-2">
                <Switch
                  checked={row.business_hours_only}
                  onCheckedChange={(v) => update(p, { business_hours_only: v })}
                />
                <Label className="text-xs">Business hours only</Label>
              </div>
              <Button onClick={() => save(p)} size="sm">
                <Save className="h-4 w-4 mr-1" /> Save
              </Button>
            </div>
          );
        })}
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Shield className="h-3 w-3" /> Changes apply to new tickets immediately and are visible to all users.
        </p>
      </CardContent>
    </Card>
  );
}
