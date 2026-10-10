import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { Loader2, MessageCircle, Newspaper, Pin } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { formatDateTime, initialsOf } from "./shared";

const REACTIONS = ["👍", "❤️", "👏", "🎉", "😮"] as const;

const PRIORITY_LABEL: Record<string, string> = {
  normal: "Normale",
  important: "Importante",
  urgent: "Urgente",
};

export function ActualitesView() {
  const list = useQuery(api.announcements.list, { limit: 50 });
  const react = useMutation(api.announcements.react);
  const addComment = useMutation(api.announcements.addComment);
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  return (
    <div className="mx-auto flex max-w-2xl flex-col space-y-4 animate-in-up">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Newspaper className="size-5 text-brand" />
          Actualités
        </h2>
        <p className="text-sm text-muted-foreground">
          Fil des annonces — réagissez et commentez. Pour publier : menu{" "}
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
            <li key={String(a._id)}>
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
                        </span>
                        <span className="block">
                          <strong className="text-foreground">Provenance :</strong>{" "}
                          {a.origin}
                        </span>
                        <span className="block text-muted-foreground">
                          {formatDateTime(a.createdAt)}
                          {a.visibilityLabel ? ` · ${a.visibilityLabel}` : ""}
                        </span>
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
                    {a.body}
                  </p>
                  {a.mediaUrl && a.mediaType === "image" ? (
                    <img
                      src={a.mediaUrl}
                      alt=""
                      className="max-h-80 w-full rounded-md border border-border object-contain bg-muted/30"
                    />
                  ) : null}
                  {a.mediaUrl && a.mediaType === "video" ? (
                    <video
                      src={a.mediaUrl}
                      controls
                      className="max-h-80 w-full rounded-md border border-border bg-black"
                    />
                  ) : null}

                  <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
                    {REACTIONS.map((emoji) => {
                      const count = a.reactionCounts?.[emoji] ?? 0;
                      const active = a.myReaction === emoji;
                      return (
                        <button
                          key={emoji}
                          type="button"
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm",
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
                            <span className="text-xs text-muted-foreground">
                              {count}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      className="ml-auto inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted/70"
                      onClick={() =>
                        setOpenComments((s) => ({
                          ...s,
                          [String(a._id)]: !s[String(a._id)],
                        }))
                      }
                    >
                      <MessageCircle className="size-3.5" />
                      {a.commentCount ?? 0} commentaire
                      {(a.commentCount ?? 0) > 1 ? "s" : ""}
                    </button>
                  </div>

                  {openComments[String(a._id)] ? (
                    <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
                      {(a.comments ?? []).map((c) => (
                        <div key={String(c._id)} className="text-sm">
                          <span className="font-medium">{c.authorName}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {" "}
                            · {formatDateTime(c.createdAt)}
                          </span>
                          <p className="text-muted-foreground">{c.body}</p>
                        </div>
                      ))}
                      <form
                        className="flex gap-2"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          const body = (commentDraft[String(a._id)] ?? "").trim();
                          if (!body) return;
                          setBusyId(String(a._id));
                          try {
                            await addComment({
                              announcementId: a._id as Id<"announcements">,
                              body,
                            });
                            setCommentDraft((d) => ({
                              ...d,
                              [String(a._id)]: "",
                            }));
                          } catch (err) {
                            toast.error(
                              err instanceof Error ? err.message : "Erreur",
                            );
                          } finally {
                            setBusyId(null);
                          }
                        }}
                      >
                        <Input
                          className="h-9 text-sm"
                          placeholder="Écrire un commentaire…"
                          value={commentDraft[String(a._id)] ?? ""}
                          onChange={(e) =>
                            setCommentDraft((d) => ({
                              ...d,
                              [String(a._id)]: e.target.value,
                            }))
                          }
                        />
                        <Button
                          type="submit"
                          size="sm"
                          disabled={busyId === String(a._id)}
                        >
                          Publier
                        </Button>
                      </form>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
