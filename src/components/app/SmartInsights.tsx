import { api } from "@/convex/_generated/api";
import type { AppView } from "@/components/app/AppShell";
import { useQuery } from "convex/react";
import { AlertTriangle, Bell, Info } from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

export function SmartInsights({
  onNavigate,
  compact = false,
}: {
  onNavigate?: (view: AppView) => void;
  compact?: boolean;
}) {
  const digest = useQuery(api.smart.digest);
  const seenRef = useRef<Set<string>>(new Set());

  // Prévenir une fois par session pour les alertes urgentes / nouvelles
  useEffect(() => {
    if (!digest?.items?.length) return;
    for (const item of digest.items) {
      if (item.level === "info" && item.id === "ann-new") {
        if (seenRef.current.has(item.id)) continue;
        seenRef.current.add(item.id);
        toast.message(item.title, {
          description: item.body,
          action: onNavigate
            ? {
                label: "Voir",
                onClick: () => onNavigate((item.view as AppView) ?? "actualites"),
              }
            : undefined,
        });
      }
      if (item.level === "urgent") {
        if (seenRef.current.has(item.id + "-u")) continue;
        seenRef.current.add(item.id + "-u");
        toast.warning(item.title, {
          description: item.body,
          action: onNavigate
            ? {
                label: "Ouvrir",
                onClick: () => onNavigate((item.view as AppView) ?? "inbox"),
              }
            : undefined,
        });
      }
    }
  }, [digest, onNavigate]);

  if (!digest?.items?.length) return null;

  if (compact) {
    return (
      <div className="space-y-1.5 px-1">
        {digest.items.slice(0, 3).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() =>
              item.view && onNavigate?.(item.view as AppView)
            }
            className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] hover:bg-secondary/80"
          >
            {item.level === "urgent" ? (
              <AlertTriangle className="mt-0.5 size-3 shrink-0 text-amber-600" />
            ) : item.level === "warn" ? (
              <Bell className="mt-0.5 size-3 shrink-0 text-brand" />
            ) : (
              <Info className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
            )}
            <span>
              <span className="font-medium text-foreground">{item.title}</span>
              <span className="block text-muted-foreground">{item.body}</span>
            </span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">À surveiller</h3>
      <ul className="space-y-2">
        {digest.items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() =>
                item.view && onNavigate?.(item.view as AppView)
              }
              className={
                item.level === "urgent"
                  ? "flex w-full items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-left"
                  : item.level === "warn"
                    ? "flex w-full items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-left"
                    : "flex w-full items-start gap-3 rounded-xl border border-border/60 bg-card px-3 py-2.5 text-left"
              }
            >
              {item.level === "urgent" ? (
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-600" />
              ) : item.level === "warn" ? (
                <Bell className="mt-0.5 size-4 shrink-0 text-amber-700" />
              ) : (
                <Info className="mt-0.5 size-4 shrink-0 text-brand" />
              )}
              <span className="text-sm">
                <span className="font-medium text-foreground">{item.title}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {item.body}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
