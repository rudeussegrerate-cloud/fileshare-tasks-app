import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMutation, useQuery } from "convex/react";
import {
  Globe2,
  Lock,
  MessageCircle,
  ThumbsUp,
  Trash2,
  Users,
} from "lucide-react";
import { MndptLoader } from "@/components/MndptLoader";
import React, { useState } from "react";
import { toast } from "sonner";

const REACTIONS = ["👍", "❤️", "👏", "🎉", "😮"] as const;

function initials(name: string) {
  const p = (name || "?").trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  if (p.length === 1) return (p[0] ?? "?").slice(0, 2).toUpperCase();
  return ((p[0]?.[0] ?? "") + (p[p.length - 1]?.[0] ?? "")).toUpperCase();
}

function relativeTime(ts: number) {
  if (!ts || !Number.isFinite(ts)) return "";
  const d = Date.now() - ts;
  if (d < 60000) return "À l'instant";
  const m = Math.floor(d / 60000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days} j`;
  return new Date(ts).toLocaleDateString("fr-FR");
}

class ActualitesSafe extends React.Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };
  static getDerivedStateFromError(err: Error) {
    return { error: err.message || "Erreur" };
  }
  componentDidCatch(err: Error) {
    console.error("[ActualitesView]", err);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-[680px] rounded-xl border bg-card p-6 text-center">
          <p className="font-medium">Actualités indisponibles</p>
          <p className="mt-1 text-sm text-muted-foreground">{this.state.error}</p>
          <button
            type="button"
            className="mt-3 rounded-md bg-brand px-4 py-2 text-sm text-primary-foreground"
            onClick={() => this.setState({ error: null })}
          >
            Réessayer
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function ActualitesViewInner() {
  const list = useQuery(api.announcements.list, { limit: 50 });
  const react = useMutation(api.announcements.react);
  const addComment = useMutation(api.announcements.addComment);
  const remove = useMutation(api.announcements.remove);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({});
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const [showReacts, setShowReacts] = useState<string | null>(null);

  if (list === undefined) {
    return (
      <div className="mx-auto max-w-[680px] space-y-3">
        <h1 className="text-2xl font-semibold">Actualités</h1>
        {[1, 2].map((i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-xl border bg-muted/40"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[680px] space-y-4" data-scandoc-tour="actualites-feed">
      <div className="px-1">
        <h1 className="text-2xl font-semibold tracking-tight">Actualités</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Fil des annonces de l&apos;entreprise. Publiez via le menu{" "}
          <strong>Publier une annonce</strong> (visibilité Publique recommandée).
        </p>
      </div>

      {list.length === 0 ? (
        <div className="rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Aucune annonce pour le moment</p>
          <p className="mt-2">
            Menu <strong>Publier une annonce</strong> → visibilité{" "}
            <strong>Publique</strong> pour que tout le monde la voie.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {list.map((raw) => {
            const a = raw as {
              _id: Id<"announcements">;
              title: string;
              body: string;
              origin: string;
              authorName: string;
              authorFonction?: string | null;
              authorDepartmentName?: string | null;
              priority?: string;
              visibility?: string;
              mediaUrl?: string | null;
              mediaType?: string | null;
              createdAt: number;
              canDelete?: boolean;
              myReaction?: string | null;
              reactionTotal?: number;
              commentCount?: number;
              reactionCounts?: Record<string, number>;
              comments?: Array<{
                _id: string;
                authorName: string;
                body: string;
                createdAt: number;
                isMine?: boolean;
              }>;
            };
            if (!a?._id) return null;
            const id = String(a._id);
            const myReaction = a.myReaction ?? null;
            const totalReactions = a.reactionTotal ?? 0;
            const commentCount = a.commentCount ?? 0;
            const comments = a.comments ?? [];
            const reactionCounts = a.reactionCounts ?? {};
            const VisIcon =
              a.visibility === "private"
                ? Lock
                : a.visibility === "custom"
                  ? Users
                  : Globe2;

            return (
              <li
                key={id}
                className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
              >
                <div className="flex items-start gap-3 px-4 pt-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand/15 text-sm font-semibold text-brand">
                    {initials(String(a.authorName || "?"))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {String(a.authorName || "Utilisateur")}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {[a.authorFonction, a.authorDepartmentName, a.origin]
                        .filter(Boolean)
                        .map(String)
                        .join(" · ") || "Organisation"}
                      {" · "}
                      {relativeTime(Number(a.createdAt) || 0)}
                      {" · "}
                      <VisIcon className="inline size-3" />
                    </p>
                  </div>
                  {a.canDelete ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-8 shrink-0"
                      disabled={busyId === id}
                      onClick={async () => {
                        if (!confirm("Supprimer cette annonce ?")) return;
                        setBusyId(id);
                        try {
                          await remove({ announcementId: a._id });
                          toast.success("Annonce supprimée");
                        } catch (err) {
                          toast.error(
                            err instanceof Error ? err.message : "Erreur",
                          );
                        } finally {
                          setBusyId(null);
                        }
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  ) : null}
                </div>

                <div className="space-y-2 px-4 py-3">
                  {a.priority === "urgent" ? (
                    <span className="inline-block rounded bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-red-800">
                      Urgent
                    </span>
                  ) : a.priority === "important" ? (
                    <span className="inline-block rounded bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-900">
                      Important
                    </span>
                  ) : null}
                  <h2 className="text-base font-semibold leading-snug">
                    {String(a.title || "Sans titre")}
                  </h2>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                    {String(a.body || "")}
                  </p>
                  {a.mediaUrl && a.mediaType === "image" ? (
                    <img
                      src={String(a.mediaUrl)}
                      alt=""
                      className="mt-2 max-h-80 w-full rounded-lg object-cover"
                    />
                  ) : null}
                  {a.mediaUrl && a.mediaType === "video" ? (
                    <video
                      src={String(a.mediaUrl)}
                      controls
                      className="mt-2 max-h-80 w-full rounded-lg"
                    />
                  ) : null}
                </div>

                {(totalReactions > 0 || commentCount > 0) && (
                  <div className="flex items-center justify-between px-4 pb-2 text-xs text-muted-foreground">
                    <span>
                      {Object.keys(reactionCounts).join(" ")}{" "}
                      {totalReactions > 0 ? totalReactions : ""}
                    </span>
                    {commentCount > 0 ? (
                      <button
                        type="button"
                        className="hover:underline"
                        onClick={() =>
                          setOpenComments((o) => ({ ...o, [id]: !o[id] }))
                        }
                      >
                        {commentCount} commentaire{commentCount > 1 ? "s" : ""}
                      </button>
                    ) : null}
                  </div>
                )}

                <div className="relative flex border-t border-border/70 px-1 py-1">
                  <div className="relative flex-1">
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-9 w-full gap-2 text-sm font-medium text-muted-foreground"
                      disabled={busyId === id}
                      onClick={() =>
                        setShowReacts((s) => (s === id ? null : id))
                      }
                      onDoubleClick={async () => {
                        setBusyId(id);
                        try {
                          await react({
                            announcementId: a._id,
                            emoji: "👍",
                          });
                        } catch (err) {
                          toast.error(
                            err instanceof Error ? err.message : "Erreur",
                          );
                        } finally {
                          setBusyId(null);
                        }
                      }}
                    >
                      <ThumbsUp
                        className={`size-4 ${myReaction ? "fill-brand text-brand" : ""}`}
                      />
                      {myReaction || "Réagir"}
                    </Button>
                    {showReacts === id ? (
                      <div className="absolute bottom-full left-2 z-20 mb-1 flex gap-1 rounded-full border bg-card px-2 py-1.5 shadow-lg">
                        {REACTIONS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            className="rounded-full px-1.5 text-lg hover:bg-muted"
                            onClick={async () => {
                              setShowReacts(null);
                              setBusyId(id);
                              try {
                                await react({
                                  announcementId: a._id,
                                  emoji,
                                });
                              } catch (err) {
                                toast.error(
                                  err instanceof Error
                                    ? err.message
                                    : "Erreur",
                                );
                              } finally {
                                setBusyId(null);
                              }
                            }}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-9 flex-1 gap-2 text-sm font-medium text-muted-foreground"
                    onClick={() =>
                      setOpenComments((o) => ({ ...o, [id]: !o[id] }))
                    }
                  >
                    <MessageCircle className="size-4" />
                    Commenter
                  </Button>
                </div>

                {openComments[id] ? (
                  <div className="space-y-2 border-t border-border/70 bg-muted/20 px-4 py-3">
                    {comments.map((c) => (
                      <div key={c._id} className="text-sm">
                        <span className="font-medium">{c.authorName}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          · {relativeTime(c.createdAt)}
                        </span>
                        <p className="mt-0.5 whitespace-pre-wrap">{c.body}</p>
                      </div>
                    ))}
                    <form
                      className="flex gap-2"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const body = (commentDraft[id] ?? "").trim();
                        if (!body) return;
                        setBusyId(id);
                        try {
                          await addComment({
                            announcementId: a._id,
                            body,
                          });
                          setCommentDraft((d) => ({ ...d, [id]: "" }));
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
                        value={commentDraft[id] ?? ""}
                        onChange={(e) =>
                          setCommentDraft((d) => ({
                            ...d,
                            [id]: e.target.value,
                          }))
                        }
                        placeholder="Écrire un commentaire…"
                        className="h-9"
                      />
                      <Button
                        type="submit"
                        size="sm"
                        className="rounded-full"
                        disabled={busyId === id}
                      >
                        Publier
                      </Button>
                    </form>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function ActualitesView() {
  return (
    <ActualitesSafe>
      <ActualitesViewInner />
    </ActualitesSafe>
  );
}
