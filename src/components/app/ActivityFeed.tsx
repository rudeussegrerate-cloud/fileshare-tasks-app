import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { FileText } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDateTime } from "./shared";

/** Fil d'activité département (échanges récents). */
export function ActivityFeed({
  onOpen,
}: {
  onOpen?: (id: Id<"documents">) => void;
}) {
  const events = useQuery(api.departmentMembership.departmentActivity, {
    limit: 12,
  });

  if (events === undefined) return null;
  if (events.length === 0) return null;

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Activité récente</CardTitle>
        <CardDescription>
          Échanges de documents dans votre département et ceux qui vous
          concernent.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {events.map((ev) => (
            <li key={ev.id}>
              <button
                type="button"
                className="flex w-full items-start gap-3 rounded-sm border border-border px-3 py-2 text-left transition hover:bg-muted/50"
                onClick={() => {
                  if (ev.documentId && onOpen) onOpen(ev.documentId);
                }}
              >
                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                  <FileText className="size-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{ev.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {ev.body}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground/80">
                    {formatDateTime(ev.createdAt)}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
