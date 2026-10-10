import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, Loader2, MessageCircle, Send, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PresenceDot } from "./PresenceDot";
import { formatDateTime, initialsOf } from "./shared";

export function MessagesView({
  initialUserId,
}: {
  initialUserId?: Id<"users"> | null;
}) {
  const conversations = useQuery(api.chat.listConversations);
  const openConv = useMutation(api.chat.openConversation);
  const send = useMutation(api.chat.sendMessage);
  const markRead = useMutation(api.chat.markRead);
  const directory = useQuery(api.presence.onlineDirectory);

  const [activeId, setActiveId] = useState<Id<"conversations"> | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const [search, setSearch] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const messages = useQuery(
    api.chat.listMessages,
    activeId ? { conversationId: activeId } : "skip",
  );

  // Ouvrir une conversation depuis un collègue (sidebar)
  useEffect(() => {
    if (!initialUserId) return;
    let cancelled = false;
    setOpening(true);
    (async () => {
      try {
        const id = await openConv({ otherUserId: initialUserId });
        if (!cancelled) {
          setActiveId(id);
          toast.success("Conversation ouverte");
        }
      } catch (e) {
        if (!cancelled) {
          toast.error(
            e instanceof Error ? e.message : "Impossible d'ouvrir la conversation",
          );
        }
      } finally {
        if (!cancelled) setOpening(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialUserId, openConv]);

  useEffect(() => {
    if (!activeId) return;
    void markRead({ conversationId: activeId }).catch(() => {});
  }, [activeId, messages?.length, markRead]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages?.length, activeId]);

  useEffect(() => {
    if (activeId) inputRef.current?.focus();
  }, [activeId]);

  const active = conversations?.find((c) => c._id === activeId);

  const people =
    directory?.filter(
      (p) =>
        !p.isSelf &&
        (search.trim() === "" ||
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          (p.email ?? "").toLowerCase().includes(search.toLowerCase())),
    ) ?? [];

  const startWith = async (userId: Id<"users">) => {
    setOpening(true);
    try {
      const id = await openConv({ otherUserId: userId });
      setActiveId(id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setOpening(false);
    }
  };

  const onSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!text.trim() || !activeId || busy) return;
    setBusy(true);
    const body = text.trim();
    setText("");
    try {
      await send({ conversationId: activeId, body });
    } catch (err) {
      setText(body);
      toast.error(err instanceof Error ? err.message : "Envoi impossible");
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const showThread = Boolean(activeId);

  return (
    <div className="mx-auto flex h-[calc(100vh-7rem)] max-w-5xl overflow-hidden rounded-lg border border-border bg-card shadow-sm animate-in-up">
      {/* Liste conversations */}
      <div
        className={cn(
          "flex w-full flex-col border-r border-border sm:w-72 sm:shrink-0",
          showThread && "hidden sm:flex",
        )}
      >
        <div className="border-b border-border p-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <MessageCircle className="size-4 text-brand" />
            Messages
          </h2>
          <Input
            className="mt-2 h-9 text-sm"
            placeholder="Rechercher un collègue…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations === undefined ? (
            <div className="flex justify-center py-10">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {(conversations.length ?? 0) > 0 ? (
                <ul className="space-y-0.5 p-1.5">
                  {conversations.map((c) => (
                    <li key={c._id}>
                      <button
                        type="button"
                        onClick={() => setActiveId(c._id)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2.5 text-left transition-colors hover:bg-muted/80",
                          activeId === c._id && "bg-muted",
                        )}
                      >
                        <span className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand">
                          {initialsOf(c.otherName)}
                          <PresenceDot
                            online={c.otherOnline}
                            className="absolute -bottom-0.5 -right-0.5 size-2.5 border-2 border-card"
                          />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <p className="truncate text-sm font-medium">
                              {c.otherName}
                            </p>
                            {c.unread > 0 ? (
                              <span className="rounded-full bg-brand px-1.5 text-[10px] font-semibold text-primary-foreground">
                                {c.unread}
                              </span>
                            ) : null}
                          </div>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {c.lastMessagePreview || "Nouvelle conversation"}
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                  <Users className="mx-auto mb-2 size-8 opacity-40" />
                  <p>Aucune conversation pour l&apos;instant.</p>
                  <p className="mt-1">Choisissez un collègue ci-dessous.</p>
                </div>
              )}

              <div className="border-t border-border p-2">
                <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Écrire à
                </p>
                {directory === undefined ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  </div>
                ) : people.length === 0 ? (
                  <p className="px-2 py-3 text-xs text-muted-foreground">
                    Aucun collègue disponible. Les comptes doivent être validés
                    par le DG.
                  </p>
                ) : (
                  <ul className="max-h-52 space-y-0.5 overflow-y-auto">
                    {people.map((p) => (
                      <li key={p._id}>
                        <button
                          type="button"
                          disabled={opening}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted/70 disabled:opacity-50"
                          onClick={() => void startWith(p._id)}
                        >
                          <span className="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold">
                            {initialsOf(p.name)}
                            <PresenceDot
                              online={p.online}
                              className="absolute -bottom-0.5 -right-0.5 size-2 border-2 border-card"
                            />
                          </span>
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {p.name}
                          </span>
                          {opening ? (
                            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Fil de discussion — visible aussi sur mobile */}
      <div
        className={cn(
          "min-w-0 flex-1 flex-col",
          showThread ? "flex" : "hidden sm:flex",
        )}
      >
        {activeId ? (
          <>
            <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 sm:hidden"
                onClick={() => setActiveId(null)}
                aria-label="Retour"
              >
                <ArrowLeft className="size-4" />
              </Button>
              <span className="relative flex size-9 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand">
                {initialsOf(active?.otherName ?? "?")}
                <PresenceDot
                  online={active?.otherOnline ?? false}
                  className="absolute -bottom-0.5 -right-0.5 size-2.5 border-2 border-card"
                />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {active?.otherName ?? "Conversation"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {active?.otherOnline ? "En ligne" : "Hors ligne"}
                </p>
              </div>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto bg-muted/15 px-3 py-3">
              {messages === undefined ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : messages.length === 0 ? (
                <p className="py-10 text-center text-xs text-muted-foreground">
                  Envoyez le premier message à {active?.otherName ?? "votre collègue"}.
                </p>
              ) : (
                messages.map((m) => (
                  <div
                    key={m._id}
                    className={cn(
                      "flex animate-msg",
                      m.isMine ? "justify-end" : "justify-start",
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
                        m.isMine
                          ? "rounded-br-md bg-brand text-primary-foreground"
                          : "rounded-bl-md border border-border bg-card",
                      )}
                    >
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      <p
                        className={cn(
                          "mt-1 text-[10px]",
                          m.isMine
                            ? "text-primary-foreground/70"
                            : "text-muted-foreground",
                        )}
                      >
                        {formatDateTime(m.createdAt)}
                      </p>
                    </div>
                  </div>
                ))
              )}
              <div ref={bottomRef} />
            </div>

            <form
              className="flex gap-2 border-t border-border bg-card p-3"
              onSubmit={(e) => void onSend(e)}
            >
              <Input
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Écrire un message…"
                maxLength={2000}
                className="h-10"
                disabled={busy}
              />
              <Button
                type="submit"
                size="icon"
                className="size-10 shrink-0"
                disabled={busy || !text.trim()}
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
              </Button>
            </form>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground">
            <MessageCircle className="size-12 opacity-30" />
            <p className="text-sm font-medium">Sélectionnez un collègue</p>
            <p className="max-w-xs text-xs">
              Cliquez sur un nom dans la liste de gauche pour démarrer ou
              continuer une conversation.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
