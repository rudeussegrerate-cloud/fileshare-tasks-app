import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "./shared";
import { useMutation, useQuery } from "convex/react";
import {
  MessageCircle,
  Share2,
  ThumbsUp,
  Trash2,
  MoreHorizontal,
  Globe2,
  Lock,
  Users,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const REACTIONS = ["👍", "❤️", "👏", "🎉", "😮"] as const;

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  if (p.length === 1) return p[0]!.slice(0, 2).toUpperCase();
  return (p[0]![0]! + p[p.length - 1]![0]!).toUpperCase();
}

function relativeTime(ts: number) {
  const d = Date.now() - ts;
  const m = Math.floor(d / 60000);
  if (m < 1) return "À l'instant";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days} j`;
  return formatDateTime(ts);
}

export function ActualitesView() {
  const list = useQuery(api.announcements.list, { limit: 50 });
  const react = useMutation(api.announcements.react);
  const addComment = useMutation(api.announcements.addComment);
  const remove = useMutation(api.announcements.remove);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({});
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const [showReacts, setShowReacts] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-[680px] space-y-4">
      <div className="px-1">
        <h1 className="text-xl font-bold tracking-tight">Actualités</h1>
        <p className="text-sm text-muted-foreground">
          Fil des annonces de l&apos;entreprise
        </p>
      </div>

      {list === undefined ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-48 animate-pulse rounded-xl border bg-card"
            />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          Aucune annonce pour le moment. Publiez-en une depuis{" "}
          <strong>Annonces</strong>.
        </div>
      ) : (
        <ul className="space-y-3">
          {list.map((a) => {
            const id = String(a._id);
            const commentsOpen = openComments[id];
            const totalReactions = a.reactionTotal ?? 0;
            const commentCount = a.commentCount ?? 0;
            const VisIcon =
              a.visibility === "private"
                ? Lock
                : a.visibility === "custom"
                  ? Users
                  : Globe2;

            return (
              <li
                key={id}
                className="fb-card overflow-hidden"
              >
                {/* En-tête type Facebook */}
                <div className="flex items-start gap-3 px-4 pt-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-primary-foreground">
                    {initials(a.authorName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold leading-tight">
                      {a.authorName}
                    </p>
                    <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                      <span>
                        {[a.authorFonction, a.authorDepartmentName]
                          .filter(Boolean)
                          .join(" · ") || a.authorRoleLabel}
                      </span>
                      <span>·</span>
                      <span>{relativeTime(a.createdAt)}</span>
                      <span>·</span>
                      <VisIcon className="size-3" />
                    </p>
                  </div>
                  {a.canDelete ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-8 shrink-0 text-muted-foreground"
                      disabled={busyId === id}
                      onClick={async () => {
                        if (!confirm("Supprimer cette annonce ?")) return;
                        setBusyId(id);
                        try {
                          await remove({
                            announcementId: a._id as Id<"announcements">,
                          });
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
                  ) : (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-8 shrink-0 text-muted-foreground"
                    >
                      <MoreHorizontal className="size-4" />
                    </Button>
                  )}
                </div>

                {/* Corps */}
                <div className="space-y-2 px-4 py-2">
                  {a.priority === "urgent" ? (
                    <span className="inline-block rounded bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                      Urgent
                    </span>
                  ) : a.priority === "important" ? (
                    <span className="inline-block rounded bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                      Important
                    </span>
                  ) : null}
                  <h2 className="text-[17px] font-semibold leading-snug">
                    {a.title}
                  </h2>
                  <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground/90">
                    {a.body}
                  </p>
                  {a.origin ? (
                    <p className="text-xs text-muted-foreground">
                      Provenance : {a.origin}
                    </p>
                  ) : null}
                </div>

                {/* Média plein largeur */}
                {a.mediaUrl && a.mediaType === "image" ? (
                  <div className="bg-muted">
                    <img
                      src={a.mediaUrl}
                      alt=""
                      className="max-h-[480px] w-full object-contain"
                    />
                  </div>
                ) : null}
                {a.mediaUrl && a.mediaType === "video" ? (
                  <div className="bg-black">
                    <video
                      src={a.mediaUrl}
                      controls
                      className="max-h-[480px] w-full"
                    />
                  </div>
                ) : null}

                {/* Compteurs */}
                {(totalReactions > 0 || commentCount > 0) && (
                  <div className="flex items-center justify-between px-4 py-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      {totalReactions > 0 ? (
                        <>
                          <span className="flex -space-x-1">
                            {Object.entries(a.reactionCounts ?? {})
                              .filter(([, n]) => Number(n) > 0)
                              .slice(0, 3)
                              .map(([emoji]) => (
                                <span
                                  key={emoji}
                                  className="flex size-5 items-center justify-center rounded-full bg-muted text-[11px] ring-2 ring-card"
                                >
                                  {emoji}
                                </span>
                              ))}
                          </span>
                          <span>{totalReactions}</span>
                        </>
                      ) : (
                        <span />
                      )}
                    </div>
                    {commentCount > 0 ? (
                      <button
                        type="button"
                        className="hover:underline"
                        onClick={() =>
                          setOpenComments((o) => ({ ...o, [id]: !o[id] }))
                        }
                      >
                        {commentCount} commentaire
                        {commentCount > 1 ? "s" : ""}
                      </button>
                    ) : null}
                  </div>
                )}

                {/* Actions J'aime / Commenter / Partager */}
                <div className="relative mx-3 flex border-t border-border/70 py-1">
                  <div className="relative flex-1">
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-9 w-full gap-2 text-sm font-medium text-muted-foreground hover:bg-muted"
                      disabled={busyId === id}
                      onClick={() =>
                        setShowReacts((s) => (s === id ? null : id))
                      }
                    >
                      <ThumbsUp
                        className={`size-4 ${a.myReaction ? "fill-brand text-brand" : ""}`}
                      />
                      {a.myReaction ? a.myReaction : "J'aime"}
                    </Button>
                    {showReacts === id ? (
                      <div className="absolute bottom-full left-0 z-20 mb-1 flex gap-1 rounded-full border bg-card px-2 py-1.5 shadow-lg">
                        {REACTIONS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            className="rounded-full p-1 text-xl transition hover:scale-125"
                            onClick={async () => {
                              setShowReacts(null);
                              setBusyId(id);
                              try {
                                await react({
                                  announcementId:
                                    a._id as Id<"announcements">,
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
                    className="h-9 flex-1 gap-2 text-sm font-medium text-muted-foreground hover:bg-muted"
                    onClick={() =>
                      setOpenComments((o) => ({ ...o, [id]: !o[id] }))
                    }
                  >
                    <MessageCircle className="size-4" />
                    Commenter
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-9 flex-1 gap-2 text-sm font-medium text-muted-foreground hover:bg-muted"
                    onClick={() => {
                      void navigator.clipboard?.writeText(
                        `${a.title}\n${a.body}`,
                      );
                      toast.success("Texte copié");
                    }}
                  >
                    <Share2 className="size-4" />
                    Partager
                  </Button>
                </div>

                {/* Commentaires */}
                {commentsOpen ? (
                  <div className="space-y-3 border-t bg-muted/30 px-4 py-3">
                    {(a.comments ?? []).map((c: { _id: string; authorName: string; body: string; createdAt: number; isMine?: boolean }) => (
                      <div key={String(c._id)} className="flex gap-2">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-bold">
                          {initials(c.authorName)}
                        </div>
                        <div className="min-w-0 flex-1 rounded-2xl bg-card px-3 py-2 text-sm shadow-sm">
                          <span className="font-semibold">{c.authorName}</span>
                          <span className="ml-1 text-[10px] text-muted-foreground">
                            {relativeTime(c.createdAt)}
                          </span>
                          <p className="mt-0.5 text-foreground/90">{c.body}</p>
                        </div>
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
                            announcementId: a._id as Id<"announcements">,
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
                        className="h-9 rounded-full border-0 bg-card text-sm shadow-sm"
                        placeholder="Écrire un commentaire…"
                        value={commentDraft[id] ?? ""}
                        onChange={(e) =>
                          setCommentDraft((d) => ({
                            ...d,
                            [id]: e.target.value,
                          }))
                        }
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
