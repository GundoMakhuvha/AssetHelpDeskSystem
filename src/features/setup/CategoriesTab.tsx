import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Save, Trash2 } from "lucide-react";
import { PRIORITIES, type TicketCategoryRow, type TicketPriority } from "@/lib/types";
import { toast } from "sonner";

export function CategoriesTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["ticket_categories", "all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ticket_categories" as never).select("*");
      if (error) throw error;
      return ((data ?? []) as TicketCategoryRow[]).sort(
        (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
      );
    },
  });

  const [draft, setDraft] = React.useState<Record<string, TicketCategoryRow>>({});
  React.useEffect(() => {
    if (data) {
      const m: Record<string, TicketCategoryRow> = {};
      data.forEach((r) => (m[r.id] = { ...r }));
      setDraft(m);
    }
  }, [data]);

  const [newCat, setNewCat] = React.useState({ name: "", description: "", priority: "Medium" as TicketPriority });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["ticket_categories"] });
  };

  const add = async () => {
    if (!newCat.name.trim()) return toast.error("Give the category a name");
    const { error } = await supabase.from("ticket_categories" as never).insert({
      name: newCat.name.trim(),
      description: newCat.description || null,
      default_priority: newCat.priority,
      sort_order: (data?.length ?? 0) + 1,
    } as never);
    if (error) return toast.error(error.message);
    toast.success("Category added");
    setNewCat({ name: "", description: "", priority: "Medium" });
    refresh();
  };

  const save = async (row: TicketCategoryRow) => {
    const { error } = await supabase
      .from("ticket_categories" as never)
      .update({
        name: row.name,
        description: row.description,
        default_priority: row.default_priority,
        is_active: row.is_active,
        sort_order: row.sort_order,
      } as never)
      .eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success("Category saved");
    refresh();
  };

  const remove = async (row: TicketCategoryRow) => {
    if (!confirm(`Delete "${row.name}"? Existing tickets keep their category text.`)) return;
    const { error } = await supabase.from("ticket_categories" as never).delete().eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success("Category deleted");
    refresh();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Ticket categories</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Categories users pick when logging a ticket. Inactive categories stay on old tickets but disappear from the form.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">Order</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-[140px]">Default priority</TableHead>
                  <TableHead className="w-[100px]">Active</TableHead>
                  <TableHead className="w-[120px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && <TableRow><TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>}
                {(data ?? []).map((c) => {
                  const row = draft[c.id];
                  if (!row) return null;
                  const set = (patch: Partial<TicketCategoryRow>) =>
                    setDraft((d) => ({ ...d, [c.id]: { ...d[c.id], ...patch } }));
                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Input type="number" className="w-16" value={row.sort_order}
                          onChange={(e) => set({ sort_order: Number(e.target.value) })} />
                      </TableCell>
                      <TableCell>
                        <Input value={row.name} onChange={(e) => set({ name: e.target.value })} />
                      </TableCell>
                      <TableCell>
                        <Input value={row.description ?? ""} onChange={(e) => set({ description: e.target.value })} />
                      </TableCell>
                      <TableCell>
                        <Select value={row.default_priority} onValueChange={(v) => set({ default_priority: v as TicketPriority })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Switch checked={row.is_active} onCheckedChange={(v) => set({ is_active: v })} />
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button size="sm" variant="outline" onClick={() => save(row)}><Save className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(row)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Add a category</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[1fr_2fr_160px_auto] md:items-end">
          <div className="space-y-1">
            <Label className="text-xs">Name</Label>
            <Input value={newCat.name} onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} placeholder="e.g. Telephony" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description</Label>
            <Input value={newCat.description} onChange={(e) => setNewCat({ ...newCat, description: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Default priority</Label>
            <Select value={newCat.priority} onValueChange={(v) => setNewCat({ ...newCat, priority: v as TicketPriority })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button onClick={add}><Plus className="h-4 w-4 mr-1" />Add</Button>
        </CardContent>
      </Card>
    </div>
  );
}
