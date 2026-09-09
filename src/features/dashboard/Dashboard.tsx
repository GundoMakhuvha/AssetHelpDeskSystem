import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Boxes, ShieldCheck, AlertTriangle, LifeBuoy } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from "recharts";
import { CONDITIONS, DEPARTMENTS, type Asset, type Verification, type Ticket } from "@/lib/types";
import { format, subDays } from "date-fns";

export function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [assetsRes, versRes, ticketsRes] = await Promise.all([
        supabase.from("assets").select("*").eq("is_deleted", false),
        supabase.from("verifications").select("*").order("verified_at", { ascending: false }).limit(500),
        supabase.from("tickets").select("*"),
      ]);
      return {
        assets: (assetsRes.data ?? []) as Asset[],
        verifications: (versRes.data ?? []) as Verification[],
        tickets: (ticketsRes.data ?? []) as Ticket[],
      };
    },
  });

  if (isLoading || !data) return <DashboardSkeleton />;

  const total = data.assets.length;
  const monthAgo = subDays(new Date(), 30).toISOString();
  const verifiedThisMonth = new Set(
    data.verifications.filter((v) => v.verified_at >= monthAgo).map((v) => v.asset_id),
  ).size;
  const everVerified = new Set(data.assets.filter((a) => a.last_verified_date).map((a) => a.asset_id));
  const unverified = total - everVerified.size;
  const damaged = data.assets.filter((a) => a.asset_condition === "Damaged" || a.asset_condition === "Poor").length;

  const byDept = DEPARTMENTS.map((d) => ({
    dept: d,
    count: data.assets.filter((a) => a.department === d).length,
  }));
  const byCondition = CONDITIONS.map((c) => ({
    name: c,
    value: data.assets.filter((a) => a.asset_condition === c).length,
  }));

  // Verification rate over last 14 days
  const days = Array.from({ length: 14 }, (_, i) => subDays(new Date(), 13 - i));
  const trend = days.map((day) => {
    const key = format(day, "yyyy-MM-dd");
    const count = data.verifications.filter((v) => v.verified_at.startsWith(key)).length;
    return { date: format(day, "MMM d"), count };
  });

  // Tickets by status
  const STATUSES = ["Open","In Progress","On Hold","Resolved","Closed"] as const;
  const ticketStack = STATUSES.map((s) => ({
    status: s,
    Low: data.tickets.filter((t) => t.status === s && t.priority === "Low").length,
    Medium: data.tickets.filter((t) => t.status === s && t.priority === "Medium").length,
    High: data.tickets.filter((t) => t.status === s && t.priority === "High").length,
    Critical: data.tickets.filter((t) => t.status === s && t.priority === "Critical").length,
  }));

  const recentVer = data.verifications.slice(0, 5);
  const recentTickets = [...data.tickets]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 5);

  const PIE_COLORS = ["var(--color-success)","var(--color-info)","var(--color-warning)","var(--color-destructive)"];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Overview of assets, verifications and help desk activity.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Boxes} label="Total assets" value={total} />
        <Kpi icon={ShieldCheck} label="Verified (30d)" value={verifiedThisMonth} accent="success" />
        <Kpi icon={AlertTriangle} label="Unverified" value={unverified} accent="warning" />
        <Kpi icon={LifeBuoy} label="Open tickets" value={data.tickets.filter((t) => t.status !== "Closed" && t.status !== "Resolved").length} accent="info" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Assets by department</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer>
              <BarChart data={byDept}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="dept" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }} />
                <Bar dataKey="count" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Asset condition</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={byCondition} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90}>
                  {byCondition.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Verifications (14 days)</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="date" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }} />
                <Line type="monotone" dataKey="count" stroke="var(--color-primary)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Tickets by status & priority</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer>
              <BarChart data={ticketStack}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="status" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }} />
                <Legend />
                <Bar dataKey="Low" stackId="a" fill="var(--color-muted-foreground)" />
                <Bar dataKey="Medium" stackId="a" fill="var(--color-info)" />
                <Bar dataKey="High" stackId="a" fill="var(--color-warning)" />
                <Bar dataKey="Critical" stackId="a" fill="var(--color-destructive)" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Recent verifications</CardTitle></CardHeader>
          <CardContent>
            {recentVer.length === 0 ? (
              <p className="text-sm text-muted-foreground">No verifications yet.</p>
            ) : (
              <ul className="divide-y">
                {recentVer.map((v) => (
                  <li key={v.id} className="py-2 flex justify-between text-sm">
                    <span><strong>{v.asset_id}</strong> — {v.verified_by}</span>
                    <span className="text-muted-foreground">{format(new Date(v.verified_at), "PPp")}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Recent ticket activity</CardTitle></CardHeader>
          <CardContent>
            {recentTickets.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tickets yet.</p>
            ) : (
              <ul className="divide-y">
                {recentTickets.map((t) => (
                  <li key={t.id} className="py-2 flex justify-between text-sm">
                    <span className="truncate max-w-[60%]">{t.title}</span>
                    <span className="text-muted-foreground">{t.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon, label, value, accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  accent?: "success" | "warning" | "info";
}) {
  const accentBg =
    accent === "success" ? "bg-success/10 text-success"
    : accent === "warning" ? "bg-warning/15 text-warning-foreground"
    : accent === "info" ? "bg-info/10 text-info"
    : "bg-primary/10 text-primary";
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className="text-3xl font-semibold mt-1">{value}</div>
          </div>
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${accentBg}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-72" />)}
      </div>
    </div>
  );
}
