import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { Loader2, Newspaper, Pin } from "lucide-react";
import { toast } from "sonner";
import { formatDateTime, initialsOf } from "./shared";

const REACTIONS = ["👍", "❤️", "👏", "🎉", "😮"] as const;

const PRIORITY_LABEL: Record<string, string> = {
  normal: "Normale",
  important: "Importante",
  urgent: "Urgente",
};

/**
 * Fil d'actualités (lecture + réactions) — style Facebook.
 * La publication se fait dans le menu Annonces.
 */
export function ActualitesView() {
  const list = useQuery(api.announcements.list, { limit: 50 });
  const react = useMutation(api.announcements.react);

  return (
    <div className="mx-auto flex max-w-2xl flex-col space-y-4 animate-in-up">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Newspaper className="size-5 text-brand" />
          Actualités
        </h2>
        <p className="text-sm text-muted-foreground">
          Faites défiler les annonces publiées. Pour en créer une, allez dans{" "}
          <strong>Annonces</strong>.
        </p>
      </div>

      {list === undefined ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : list.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          Aucune annonce visible pour le moment.
        </p>
      ) : (
        <ul className="max-h-[calc(100vh-11rem)] space-y-4 overflow-y-auto pb-8 pr-1">
          {list.map((a) => (
            <li key={a._id}>
              <Card
                className={cn(
                  "border-border shadow-none",
                  a.priority === "urgent" && "border-red-300 bg-red-50/30",
                  a.priority === "important" && "border-amber-300 bg-amber-50/20",
                  a.pinned && "ring-1 ring-brand/30",
                )}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start gap-3">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand">
                      {initialsOf(a.authorName)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-base leading-snug">
                          {a.title}
                        </CardTitle>
                        {a.pinned ? (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-semibold text-brand">
                            <Pin className="size-3" />
                            Épinglée
                          </span>
                        ) : null}
                        {a.priority !== "normal" ? (
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                              a.priority === "urgent"
                                ? "bg-red-100 text-red-800"
                                : "bg-amber-100 text-amber-900",
                            )}
                          >
                            {PRIORITY_LABEL[a.priority] ?? a.priority}
                          </span>
                        ) : null}
                      </div>
                      <CardDescription className="mt-1 space-y-0.5 text-xs">
                        <span className="block">
                          <strong className="text-foreground">De :</strong>{" "}
                          {a.authorName}
                          {a.authorFonction ? ` · ${a.authorFonction}` : ""}
                          {a.authorRoleLabel ? ` · ${a.authorRoleLabel}` : ""}
                        </span>
                        <span className="block">
                          <strong className="text-foreground">Provenance :</strong>{" "}
                          {a.origin}
                          {a.authorDepartmentName
                            ? ` · ${a.authorDepartmentName}`
                            : ""}
                        </span>
                        {a.visibilityLabel ? (
                          <span className="block">
                            <strong className="text-foreground">Visibilité :</strong>{" "}
                            {a.visibilityLabel}
                          </span>
                        ) : null}
                        <span className="block text-muted-foreground">
                          {formatDateTime(a.createdAt)}
                        </span>
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
                    {a.body}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
                    {REACTIONS.map((emoji) => {
                      const count = a.reactionCounts?.[emoji] ?? 0;
                      const active = a.myReaction === emoji;
                      return (
                        <button
                          key={emoji}
                          type="button"
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm transition-colors",
                            active
                              ? "border-brand bg-brand-soft"
                              : "border-border hover:bg-muted/70",
                          )}
                          onClick={async () => {
                            try {
                              await react({
                                announcementId: a._id as Id<"announcements">,
                                emoji,
                              });
                            } catch (err) {
                              toast.error(
                                err instanceof Error ? err.message : "Erreur",
                              );
                            }
                          }}
                        >
                          <span>{emoji}</span>
                          {count > 0 ? (
                            <span className="text-xs font-medium tabular-nums text-muted-foreground">
                              {count}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
