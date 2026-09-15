import * as React from "react";
import { AlertTriangle, Info, Megaphone, X } from "lucide-react";
import { useActiveAnnouncements } from "@/lib/setup-data";

const STYLES: Record<string, string> = {
  info: "border-primary/30 bg-primary/10 text-foreground",
  warning: "border-amber-500/40 bg-amber-500/10 text-foreground",
  critical: "border-red-500/40 bg-red-500/10 text-foreground",
};

export function AnnouncementBanner() {
  const { data } = useActiveAnnouncements();
  const [dismissed, setDismissed] = React.useState<string[]>([]);

  const visible = (data ?? []).filter((a) => !dismissed.includes(a.id));
  if (visible.length === 0) return null;

  return (
    <div className="space-y-2 px-6 pt-4">
      {visible.map((a) => {
        const Icon =
          a.level === "critical" ? AlertTriangle : a.level === "warning" ? Megaphone : Info;
        return (
          <div
            key={a.id}
            className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${STYLES[a.level] ?? STYLES.info}`}
          >
            <Icon className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-medium">{a.title}</p>
              {a.body && <p className="text-muted-foreground mt-0.5">{a.body}</p>}
            </div>
            <button
              type="button"
              aria-label="Dismiss announcement"
              onClick={() => setDismissed((d) => [...d, a.id])}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
