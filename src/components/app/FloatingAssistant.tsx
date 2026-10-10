import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { useAction, useMutation, useQuery } from "convex/react";
import { Loader2, Settings2, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const MOODS = [
  { id: "joyeux", label: "Joyeux" },
  { id: "calme", label: "Calme" },
  { id: "motivant", label: "Motivant" },
  { id: "sérieux", label: "Sérieux" },
  { id: "blagueur", label: "Blagueur" },
];

const COLORS: Record<string, string> = {
  navy: "from-[#1e3a5f] to-[#2d4a6f]",
  teal: "from-teal-600 to-teal-500",
  amber: "from-amber-500 to-amber-400",
  rose: "from-rose-500 to-rose-400",
  violet: "from-violet-600 to-violet-500",
};

function BotAvatar({
  color,
  mood,
  size = "md",
  bounce = false,
}: {
  color: string;
  mood: string;
  size?: "sm" | "md" | "lg";
  bounce?: boolean;
}) {
  const dim =
    size === "lg" ? "size-16" : size === "sm" ? "size-9" : "size-12";
  const face =
    mood === "joyeux" || mood === "blagueur"
      ? "◡"
      : mood === "sérieux"
        ? "−"
        : "‿";
  return (
    <div
      className={cn(
        "relative flex items-center justify-center rounded-full bg-gradient-to-b text-white shadow-lg",
        COLORS[color] ?? COLORS.navy,
        dim,
        bounce && "assistant-bounce",
      )}
    >
      {/* tête */}
      <div className="flex flex-col items-center justify-center">
        <div className="flex gap-1.5">
          <span className="size-1.5 rounded-full bg-white/90" />
          <span className="size-1.5 rounded-full bg-white/90" />
        </div>
        <span className="mt-0.5 text-[10px] leading-none opacity-90">{face}</span>
      </div>
      {/* bras animés */}
      <span className="assistant-arm absolute -left-1 top-1/2 size-2 -translate-y-1/2 rounded-full bg-white/30" />
      <span className="assistant-arm-r absolute -right-1 top-1/2 size-2 -translate-y-1/2 rounded-full bg-white/30" />
    </div>
  );
}

export function FloatingAssistant() {
  const me = useQuery(api.workspace.me);
  const bot = useQuery(api.bot.getMyBot);
  const history = useQuery(api.bot.listMessages, { limit: 30 });
  const saveBot = useMutation(api.bot.saveMyBot);
  const clearHistory = useMutation(api.bot.clearHistory);
  const ask = useAction(api.assistantBot.ask);

  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("Aide");
  const [mood, setMood] = useState("calme");
  const [personality, setPersonality] = useState("");
  const [color, setColor] = useState("navy");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!bot) return;
    setName(bot.name);
    setMood(bot.mood);
    setPersonality(bot.personality);
    setColor(bot.color);
  }, [bot]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history?.length, open]);

  if (!me || me.accountStatus !== "valide") return null;

  const botName = bot?.name ?? "Aide";
  const botColor = bot?.color ?? "navy";
  const botMood = bot?.mood ?? "calme";

  return (
    <>
      <style>{`
        @keyframes assistant-bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        .assistant-bounce { animation: assistant-bounce 2.2s ease-in-out infinite; }
        @keyframes arm-wave {
          0%, 100% { transform: translateY(-50%) rotate(0deg); }
          50% { transform: translateY(-50%) rotate(18deg); }
        }
        .assistant-arm { animation: arm-wave 1.8s ease-in-out infinite; }
        .assistant-arm-r { animation: arm-wave 1.8s ease-in-out infinite 0.3s; }
      `}</style>

      {/* Bouton flottant personnage */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 flex flex-col items-center gap-1 focus:outline-none animate-soft-pulse rounded-full"
        title={`${botName} — votre assistant`}
      >
        <BotAvatar color={botColor} mood={botMood} size="lg" bounce />
        <span className="rounded-full bg-card px-2 py-0.5 text-[10px] font-semibold shadow border border-border">
          {botName}
        </span>
      </button>

      {/* Panneau chat bot */}
      {open ? (
        <div className="fixed bottom-24 right-4 z-50 flex h-[min(480px,70vh)] w-[min(360px,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
          <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
            <BotAvatar color={botColor} mood={botMood} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{botName}</p>
              <p className="text-[10px] text-muted-foreground">
                Assistant ScanDoc · {botMood}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => setSettings(true)}
              title="Personnaliser"
            >
              <Settings2 className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => setOpen(false)}
            >
              <X className="size-4" />
            </Button>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto px-3 py-2">
            {(history?.length ?? 0) === 0 ? (
              <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">
                  Bonjour ! Je suis {botName}.
                </p>
                <p className="mt-1">
                  Posez-moi une question si vous êtes perdu, par exemple :
                </p>
                <ul className="mt-1 list-inside list-disc">
                  <li>Comment envoyer un document ?</li>
                  <li>Comment rejoindre un département ?</li>
                  <li>Où sont mes messages ?</li>
                </ul>
              </div>
            ) : (
              history!.map((m) => (
                <div
                  key={m._id}
                  className={cn(
                    "flex",
                    m.role === "user" ? "justify-end" : "justify-start",
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3 py-2 text-xs whitespace-pre-wrap",
                      m.role === "user"
                        ? "rounded-br-md bg-brand text-primary-foreground"
                        : "rounded-bl-md border border-border bg-muted/40",
                    )}
                  >
                    {m.body}
                  </div>
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>

          <form
            className="flex gap-2 border-t border-border p-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!text.trim() || busy || !me.user._id) return;
              setBusy(true);
              const msg = text.trim();
              setText("");
              try {
                await ask({ message: msg });
              } catch (err) {
                toast.error(
                  err instanceof Error ? err.message : "Assistant indisponible",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Votre question…"
              className="h-9 text-sm"
              disabled={busy}
            />
            <Button type="submit" size="sm" disabled={busy || !text.trim()}>
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
            </Button>
          </form>
        </div>
      ) : null}

      {/* Personnalisation */}
      <Dialog open={settings} onOpenChange={setSettings}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Personnaliser votre assistant</DialogTitle>
            <DialogDescription>
              Choisissez son nom, son humeur et la façon dont il vous parle.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex justify-center py-2">
              <BotAvatar color={color} mood={mood} size="lg" bounce />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bot-name">Nom</Label>
              <Input
                id="bot-name"
                value={name}
                maxLength={24}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex : Léa, Sam, Guide…"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Humeur</Label>
              <div className="flex flex-wrap gap-1.5">
                {MOODS.map((m) => (
                  <Button
                    key={m.id}
                    type="button"
                    size="sm"
                    variant={mood === m.id ? "default" : "outline"}
                    onClick={() => setMood(m.id)}
                  >
                    {m.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Couleur</Label>
              <div className="flex flex-wrap gap-2">
                {Object.keys(COLORS).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={cn(
                      "size-8 rounded-full bg-gradient-to-b ring-2 ring-offset-2",
                      COLORS[c],
                      color === c ? "ring-brand" : "ring-transparent",
                    )}
                    title={c}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bot-perso">Comportement</Label>
              <Textarea
                id="bot-perso"
                value={personality}
                onChange={(e) => setPersonality(e.target.value)}
                rows={3}
                placeholder="Ex : Sois patient, explique étape par étape, utilise des exemples simples…"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={async () => {
                  try {
                    await saveBot({ name, mood, personality, color });
                    toast.success("Assistant enregistré");
                    setSettings(false);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Erreur");
                  }
                }}
              >
                Enregistrer
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  await clearHistory({});
                  toast.message("Historique effacé");
                }}
              >
                Effacer l&apos;historique
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
