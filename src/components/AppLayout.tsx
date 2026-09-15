import * as React from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import {
  LayoutDashboard,
  Boxes,
  ScanLine,
  FileBarChart,
  LifeBuoy,
  LogOut,
  ShieldCheck,
  Settings,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { NotificationsBell } from "@/components/NotificationsBell";
import logoUrl from "@/assets/tipp-focus-logo.png";
import {
  ROLES_ASSET_READ,
  ROLES_HELPDESK,
  ROLE_LABELS,
  type AppRole,
} from "@/lib/types";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  allow?: AppRole[];
};

const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/assets", label: "Asset Register", icon: Boxes, allow: ROLES_ASSET_READ },
  { to: "/verify", label: "Verification", icon: ScanLine, allow: ROLES_ASSET_READ },
  { to: "/reports", label: "Reports", icon: FileBarChart, allow: ROLES_ASSET_READ },
  { to: "/tickets", label: "Help Desk", icon: LifeBuoy, allow: ROLES_HELPDESK },
  { to: "/setup", label: "Setup", icon: Settings, allow: ["admin"] },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, role, fullName, signOut, loading } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();

  React.useEffect(() => {
    if (!loading && !user && loc.pathname !== "/login" && loc.pathname !== "/reset-password") {
      nav({ to: "/login" });
    }
  }, [loading, user, loc.pathname, nav]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!user) return null;

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="w-64 shrink-0 bg-sidebar text-sidebar-foreground flex flex-col">
        <div className="px-5 py-5 border-b border-sidebar-border bg-white">
          <div className="flex items-center gap-3">
            <img src={logoUrl} alt="Tipp Focus" className="h-12 w-auto object-contain" />
            <div>
              <div className="text-xs text-slate-600">Asset & Help Desk</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV.filter((item) => !item.allow || (role && item.allow.includes(role))).map((item) => {
            const Icon = item.icon;
            const active =
              item.to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "hover:bg-sidebar-accent/60 text-sidebar-foreground/85",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border space-y-2">
          <div className="px-2 text-xs">
            <div className="font-medium truncate">{fullName ?? user.email}</div>
            <div className="flex items-center gap-1 text-sidebar-foreground/70">
              <ShieldCheck className="h-3 w-3" />
              <span>{role ? ROLE_LABELS[role] : "—"}</span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={async () => {
              await signOut();
              nav({ to: "/login" });
            }}
          >
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        <header className="h-14 px-6 border-b flex items-center justify-between bg-card">
          <div className="text-sm text-muted-foreground">
            {NAV.find((n) => (n.to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(n.to)))
              ?.label ?? ""}
          </div>
          <div className="flex items-center gap-2">
            <NotificationsBell />
            <Badge variant="secondary">
              {role ? ROLE_LABELS[role] : "—"}
            </Badge>
          </div>
        </header>
        <AnnouncementBanner />
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
