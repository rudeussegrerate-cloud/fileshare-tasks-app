import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { Loader2, MessageCircle, Send } from "lucide-react";
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
  const [search, setSearch] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const messages = useQuery(
    api.chat.listMessages,
    activeId ? { conversationId: activeId } : "skip",
  );

  // Ouvrir une conversation depuis un collègue
  useEffect(() => {
    if (!initialUserId) return;
    let cancelled = false;
    (async () => {
      try {
        const id = await openConv({ otherUserId: initialUserId });
        if (!cancelled) setActiveId(id);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Impossible d'ouvrir");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialUserId, openConv]);

  useEffect(() => {
    if (!activeId) return;
    void markRead({ conversationId: activeId });
  }, [activeId, messages?.length, markRead]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages?.length, activeId]);

  const active = conversations?.find((c) => c._id === activeId);

  const people =
    directory?.filter((p) => !p.isSelf && (search.trim() === "" ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.email ?? "").toLowerCase().includes(search.toLowerCase()))) ?? [];

  return (
    <div className="mx-auto flex h-[calc(100vh-7.5rem)] max-w-5xl overflow-hidden rounded-md border border-border bg-card">
      {/* Liste */}
      <div className="flex w-full flex-col border-r border-border sm:w-72">
        <div className="border-b border-border p-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <MessageCircle className="size-4" />
            Messages
          </h2>
          <Input
            className="mt-2 h-8 text-xs"
            placeholder="Rechercher un collègue…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {(conversations?.length ?? 0) > 0 ? (
            <ul className="p-1">
              {conversations!.map((c) => (
                <li key={c._id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(c._id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-muted/70",
                      activeId === c._id && "bg-muted",
                    )}
                  >
                    <span className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand">
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
            <p className="p-3 text-xs text-muted-foreground">
              Aucune conversation. Choisissez un collègue ci-dessous.
            </p>
          )}
          <div className="border-t border-border p-2">
            <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Démarrer avec
            </p>
            <ul className="max-h-40 space-y-0.5 overflow-y-auto">
              {people.slice(0, 20).map((p) => (
                <li key={p._id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted/70"
                    onClick={async () => {
                      try {
                        const id = await openConv({ otherUserId: p._id });
                        setActiveId(id);
                      } catch (e) {
                        toast.error(
                          e instanceof Error ? e.message : "Erreur",
                        );
                      }
                    }}
                  >
                    <PresenceDot online={p.online} className="size-2" />
                    <span className="truncate">{p.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Fil */}
      <div className="hidden min-w-0 flex-1 flex-col sm:flex">
        {activeId && active ? (
          <>
            <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
              <span className="relative flex size-8 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand">
                {initialsOf(active.otherName)}
                <PresenceDot
                  online={active.otherOnline}
                  className="absolute -bottom-0.5 -right-0.5 size-2.5 border-2 border-card"
                />
              </span>
              <div>
                <p className="text-sm font-semibold">{active.otherName}</p>
                <p className="text-[11px] text-muted-foreground">
                  {active.otherOnline ? "En ligne" : "Hors ligne"}
                </p>
              </div>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto bg-muted/20 px-4 py-3">
              {messages === undefined ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : messages.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  Envoyez le premier message.
                </p>
              ) : (
                messages.map((m) => (
                  <div
                    key={m._id}
                    className={cn(
                      "flex",
                      m.isMine ? "justify-end" : "justify-start",
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[75%] rounded-2xl px-3 py-2 text-sm",
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
              className="flex gap-2 border-t border-border p-3"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!text.trim() || !activeId || busy) return;
                setBusy(true);
                try {
                  await send({ conversationId: activeId, body: text });
                  setText("");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Erreur");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Écrire un message…"
                maxLength={2000}
              />
              <Button type="submit" size="icon" disabled={busy || !text.trim()}>
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
              </Button>
            </form>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
            <MessageCircle className="size-10 opacity-40" />
            <p className="text-sm">Sélectionnez une conversation</p>
          </div>
        )}
      </div>
    </div>
  );
}
