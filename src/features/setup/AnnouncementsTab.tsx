import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Megaphone, Plus, Trash2 } from "lucide-react";
import type { Announcement } from "@/lib/types";
import { toast } from "sonner";
import { format } from "date-fns";

const LEVELS = ["info", "warning", "critical"] as const;

export function AnnouncementsTab() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["announcements", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("announcements" as never).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Announcement[];
    },
  });

  const [form, setForm] = React.useState({
    title: "", body: "", level: "info" as Announcement["level"], starts_at: "", ends_at: "",
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["announcements"] });

  const add = async () => {
    if (!form.title.trim()) return toast.error("A title is required");
    const { error } = await supabase.from("announcements" as never).insert({
      title: form.title.trim(),
      body: form.body || null,
      level: form.level,
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
    } as never);
    if (error) return toast.error(error.message);
    toast.success("Announcement published");
    setForm({ title: "", body: "", level: "info", starts_at: "", ends_at: "" });
    refresh();
  };

  const toggle = async (a: Announcement, v: boolean) => {
    const { error } = await supabase.from("announcements" as never).update({ is_active: v } as never).eq("id", a.id);
    if (error) return toast.error(error.message);
    refresh();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("announcements" as never).delete().eq("id", id);
    if (error) return toast.error(error.message);
    refresh();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Megaphone className="h-4 w-4" />New announcement</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">Shows as a banner at the top of every page for all signed-in users.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-[2fr_160px]">
            <div className="space-y-1">
              <Label className="text-xs">Title</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Planned maintenance this Saturday" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Level</Label>
              <Select value={form.level} onValueChange={(v) => setForm({ ...form, level: v as Announcement["level"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LEVELS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Message</Label>
            <Textarea rows={3} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Show from (optional)</Label>
              <Input type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Hide after (optional)</Label>
              <Input type="datetime-local" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} />
            </div>
          </div>
          <Button onClick={add}><Plus className="h-4 w-4 mr-1" />Publish</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Published announcements</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {(data ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nothing published yet.</p>}
          {(data ?? []).map((a) => (
            <div key={a.id} className="rounded-lg border p-4 flex items-start gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm">{a.title}</p>
                  <Badge variant="outline" className="capitalize">{a.level}</Badge>
                </div>
                {a.body && <p className="text-sm text-muted-foreground mt-1">{a.body}</p>}
                <p className="text-[11px] text-muted-foreground mt-2">
                  Created {format(new Date(a.created_at), "PPp")}
                  {a.starts_at && ` · from ${format(new Date(a.starts_at), "PP")}`}
                  {a.ends_at && ` · until ${format(new Date(a.ends_at), "PP")}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={a.is_active} onCheckedChange={(v) => toggle(a, v)} />
                <Button size="sm" variant="ghost" onClick={() => remove(a.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
