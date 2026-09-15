import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { CalendarDays, Plus, Save, Trash2 } from "lucide-react";
import type { HelpdeskSettings, Holiday, Profile } from "@/lib/types";
import { toast } from "sonner";
import { format } from "date-fns";

const DAYS = [
  { v: 1, l: "Mon" }, { v: 2, l: "Tue" }, { v: 3, l: "Wed" }, { v: 4, l: "Thu" },
  { v: 5, l: "Fri" }, { v: 6, l: "Sat" }, { v: 0, l: "Sun" },
];

export function HelpdeskTab() {
  const qc = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ["helpdesk_settings", "admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("helpdesk_settings" as never).select("*").limit(1).maybeSingle();
      if (error) throw error;
      return data as HelpdeskSettings | null;
    },
  });

  const { data: staff } = useQuery({
    queryKey: ["profiles", "all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, email, department, created_at");
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
  });

  const [form, setForm] = React.useState<HelpdeskSettings | null>(null);
  React.useEffect(() => { if (settings) setForm({ ...settings }); }, [settings]);

  if (!form) return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Loading settings…</CardContent></Card>;

  const set = (patch: Partial<HelpdeskSettings>) => setForm({ ...form, ...patch });

  const save = async () => {
    const { error } = await supabase.from("helpdesk_settings" as never).update({
      organisation_name: form.organisation_name,
      support_email: form.support_email,
      default_assignee: form.default_assignee,
      auto_close_days: form.auto_close_days,
      business_start: form.business_start,
      business_end: form.business_end,
      working_days: form.working_days,
      timezone: form.timezone,
      allow_attachments: form.allow_attachments,
      require_category: form.require_category,
      notify_requestor: form.notify_requestor,
      notify_agents: form.notify_agents,
      agent_notify_emails: form.agent_notify_emails,
      ticket_footer: form.ticket_footer,
    } as never).eq("id", true);
    if (error) return toast.error(error.message);
    toast.success("Help desk settings saved");
    qc.invalidateQueries({ queryKey: ["helpdesk_settings"] });
  };

  const toggleDay = (d: number) => {
    const has = form.working_days.includes(d);
    set({ working_days: has ? form.working_days.filter((x) => x !== d) : [...form.working_days, d].sort() });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Help desk settings</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Service desk identity, working hours, ticket rules and notification behaviour.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Organisation name</Label>
              <Input value={form.organisation_name} onChange={(e) => set({ organisation_name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Support email (shown to users)</Label>
              <Input value={form.support_email ?? ""} onChange={(e) => set({ support_email: e.target.value })} placeholder="helpdesk@tippfocus.co.za" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Default assignee for new tickets</Label>
              <Select
                value={form.default_assignee ?? "none"}
                onValueChange={(v) => set({ default_assignee: v === "none" ? null : v })}
              >
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {(staff ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name ?? p.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Auto-close resolved tickets after (days)</Label>
              <Input type="number" min={0} value={form.auto_close_days}
                onChange={(e) => set({ auto_close_days: Number(e.target.value) })} />
            </div>
          </div>

          <div className="rounded-lg border p-4 space-y-4">
            <p className="text-sm font-medium">Business hours</p>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs">Start</Label>
                <Input type="time" value={form.business_start?.slice(0, 5)} onChange={(e) => set({ business_start: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">End</Label>
                <Input type="time" value={form.business_end?.slice(0, 5)} onChange={(e) => set({ business_end: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Time zone</Label>
                <Input value={form.timezone} onChange={(e) => set({ timezone: e.target.value })} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d) => (
                <Button key={d.v} type="button" size="sm"
                  variant={form.working_days.includes(d.v) ? "default" : "outline"}
                  onClick={() => toggleDay(d.v)}>{d.l}</Button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <SettingSwitch label="Allow file attachments on tickets" checked={form.allow_attachments} onChange={(v) => set({ allow_attachments: v })} />
            <SettingSwitch label="Require a category when logging a ticket" checked={form.require_category} onChange={(v) => set({ require_category: v })} />
            <SettingSwitch label="Email the requester on updates" checked={form.notify_requestor} onChange={(v) => set({ notify_requestor: v })} />
            <SettingSwitch label="Email agents when tickets arrive" checked={form.notify_agents} onChange={(v) => set({ notify_agents: v })} />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Agent notification addresses (comma separated)</Label>
            <Input value={form.agent_notify_emails ?? ""} onChange={(e) => set({ agent_notify_emails: e.target.value })}
              placeholder="support@tippfocus.co.za, it@tippfocus.co.za" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Email footer</Label>
            <Textarea rows={3} value={form.ticket_footer ?? ""} onChange={(e) => set({ ticket_footer: e.target.value })}
              placeholder="Tipp Focus IT Service Desk · Fourways, Johannesburg" />
          </div>

          <Button onClick={save}><Save className="h-4 w-4 mr-1" />Save settings</Button>
        </CardContent>
      </Card>

      <HolidaysCard />
    </div>
  );
}

function SettingSwitch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg border px-4 py-3">
      <Label className="text-sm font-normal">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function HolidaysCard() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["holidays"],
    queryFn: async () => {
      const { data, error } = await supabase.from("holidays" as never).select("*").order("holiday_date");
      if (error) throw error;
      return (data ?? []) as Holiday[];
    },
  });
  const [form, setForm] = React.useState({ name: "", holiday_date: "" });

  const add = async () => {
    if (!form.name.trim() || !form.holiday_date) return toast.error("Name and date are required");
    const { error } = await supabase.from("holidays" as never).insert(form as never);
    if (error) return toast.error(error.message);
    setForm({ name: "", holiday_date: "" });
    qc.invalidateQueries({ queryKey: ["holidays"] });
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("holidays" as never).delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["holidays"] });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><CalendarDays className="h-4 w-4" />Public holidays</CardTitle>
        <p className="text-xs text-muted-foreground mt-1">Excluded from business-hours SLA clocks.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-[2fr_1fr_auto] md:items-end">
          <div className="space-y-1">
            <Label className="text-xs">Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Date</Label>
            <Input type="date" value={form.holiday_date} onChange={(e) => setForm({ ...form, holiday_date: e.target.value })} />
          </div>
          <Button onClick={add}><Plus className="h-4 w-4 mr-1" />Add</Button>
        </div>
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Holiday</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {(data ?? []).map((h) => (
              <TableRow key={h.id}>
                <TableCell className="text-sm">{format(new Date(h.holiday_date), "PP")}</TableCell>
                <TableCell className="text-sm">{h.name}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => remove(h.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
            {(data ?? []).length === 0 && <TableRow><TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">No holidays yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
