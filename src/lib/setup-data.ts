import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type {
  Announcement,
  HelpdeskSettings,
  TicketCategoryRow,
} from "@/lib/types";

export function useTicketCategories(activeOnly = true) {
  return useQuery({
    queryKey: ["ticket_categories", activeOnly],
    queryFn: async () => {
      let q = supabase.from("ticket_categories" as never).select("*");
      if (activeOnly) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as TicketCategoryRow[]).sort(
        (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
      );
    },
    staleTime: 60_000,
  });
}

export function useHelpdeskSettings() {
  return useQuery({
    queryKey: ["helpdesk_settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("helpdesk_settings" as never)
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as HelpdeskSettings | null;
    },
    staleTime: 60_000,
  });
}

export function useActiveAnnouncements() {
  return useQuery({
    queryKey: ["announcements", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("announcements" as never)
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const now = Date.now();
      return ((data ?? []) as Announcement[]).filter((a) => {
        if (a.starts_at && new Date(a.starts_at).getTime() > now) return false;
        if (a.ends_at && new Date(a.ends_at).getTime() < now) return false;
        return true;
      });
    },
    refetchInterval: 120_000,
  });
}
