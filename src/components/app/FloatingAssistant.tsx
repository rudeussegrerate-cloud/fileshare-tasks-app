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

type IdleEmotion = "idle" | "wave" | "look" | "sleep" | "excited" | "think";

function BotAvatar({
  color,
  mood,
  size = "md",
  bounce = false,
  emotion = "idle",
}: {
  color: string;
  mood: string;
  size?: "sm" | "md" | "lg";
  bounce?: boolean;
  emotion?: IdleEmotion;
}) {
  const dim =
    size === "lg" ? "size-16" : size === "sm" ? "size-9" : "size-12";
  // Visage selon humeur de base + émotion du moment
  let face = "‿";
  if (emotion === "sleep") face = "zzz";
  else if (emotion === "excited") face = "★";
  else if (emotion === "think") face = "…";
  else if (emotion === "look") face = "◦";
  else if (mood === "joyeux" || mood === "blagueur") face = "◡";
  else if (mood === "sérieux") face = "−";

  const eyeOffset =
    emotion === "look" ? "translate-x-0.5" : emotion === "sleep" ? "opacity-40" : "";

  return (
    <div
      className={cn(
        "relative flex items-center justify-center rounded-full bg-gradient-to-b text-white shadow-lg transition-transform",
        COLORS[color] ?? COLORS.navy,
        dim,
        bounce && emotion === "idle" && "assistant-bounce",
        emotion === "wave" && "assistant-wave-body",
        emotion === "excited" && "assistant-excited",
        emotion === "sleep" && "assistant-sleep",
        emotion === "think" && "assistant-think",
      )}
      title={emotion}
    >
      <div className="flex flex-col items-center justify-center">
        <div className={cn("flex gap-1.5", eyeOffset)}>
          <span
            className={cn(
              "size-1.5 rounded-full bg-white/90",
              emotion === "sleep" && "h-0.5 w-1.5 rounded-full",
            )}
          />
          <span
            className={cn(
              "size-1.5 rounded-full bg-white/90",
              emotion === "sleep" && "h-0.5 w-1.5 rounded-full",
            )}
          />
        </div>
        <span className="mt-0.5 text-[9px] leading-none opacity-90">{face}</span>
      </div>
      <span
        className={cn(
          "absolute -left-1 top-1/2 size-2 -translate-y-1/2 rounded-full bg-white/30",
          emotion === "wave" ? "assistant-arm-wave" : "assistant-arm",
        )}
      />
      <span className="assistant-arm-r absolute -right-1 top-1/2 size-2 -translate-y-1/2 rounded-full bg-white/30" />
      {emotion === "excited" ? (
        <span className="absolute -top-1 right-0 text-[10px]">✨</span>
      ) : null}
      {emotion === "think" ? (
        <span className="absolute -top-2 right-0 text-[9px] opacity-80">💭</span>
      ) : null}
    </div>
  );
}

function clampPos(x: number, y: number) {
  if (typeof window === "undefined") return { x, y };
  const margin = 8;
  const w = 72;
  const h = 88;
  return {
    x: Math.min(Math.max(margin, x), window.innerWidth - w - margin),
    y: Math.min(Math.max(margin, y), window.innerHeight - h - margin),
  };
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

  // Position du bot (glisser-déposer), mémorisée
  const POS_KEY = "scandoc-bot-pos";
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
    pointerId: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [idleEmotion, setIdleEmotion] = useState<IdleEmotion>("idle");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (raw) {
        const p = JSON.parse(raw) as { x: number; y: number };
        if (typeof p.x === "number" && typeof p.y === "number") {
          setPos(clampPos(p.x, p.y));
          return;
        }
      }
    } catch {
      /* ignore */
    }
    // Position par défaut : bas droite
    setPos(
      clampPos(
        typeof window !== "undefined" ? window.innerWidth - 88 : 300,
        typeof window !== "undefined" ? window.innerHeight - 100 : 400,
      ),
    );
  }, []);

  useEffect(() => {
    const onResize = () => {
      setPos((p) => (p ? clampPos(p.x, p.y) : p));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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

  // Émotions / réactions quand le bot n'est pas utilisé
  useEffect(() => {
    if (open || dragging) {
      setIdleEmotion("idle");
      return;
    }
    const sequence: IdleEmotion[] = [
      "idle",
      "look",
      "wave",
      "idle",
      "think",
      "excited",
      "idle",
      "sleep",
    ];
    let i = 0;
    const tick = () => {
      i = (i + 1) % sequence.length;
      setIdleEmotion(sequence[i]!);
    };
    const id = window.setInterval(tick, 3200);
    return () => window.clearInterval(id);
  }, [open, dragging]);

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
        @keyframes arm-wave-strong {
          0%, 100% { transform: translateY(-50%) rotate(-10deg); }
          50% { transform: translateY(-50%) rotate(40deg); }
        }
        .assistant-arm-wave { animation: arm-wave-strong 0.6s ease-in-out infinite; }
        @keyframes wave-body {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-6deg); }
          75% { transform: rotate(6deg); }
        }
        .assistant-wave-body { animation: wave-body 0.8s ease-in-out infinite; }
        @keyframes excited-pop {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.12) translateY(-4px); }
        }
        .assistant-excited { animation: excited-pop 0.7s ease-in-out infinite; }
        @keyframes sleep-sway {
          0%, 100% { transform: rotate(-3deg); opacity: 0.85; }
          50% { transform: rotate(3deg); opacity: 0.7; }
        }
        .assistant-sleep { animation: sleep-sway 2.5s ease-in-out infinite; }
        @keyframes think-bob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        .assistant-think { animation: think-bob 1.4s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .assistant-bounce, .assistant-arm, .assistant-arm-r,
          .assistant-arm-wave, .assistant-wave-body, .assistant-excited,
          .assistant-sleep, .assistant-think { animation: none !important; }
        }
      `}</style>

      {/* Bouton flottant personnage — déplaçable */}
      {pos ? (
        <button
          type="button"
          className={`fixed z-40 flex touch-none flex-col items-center gap-1 rounded-full focus:outline-none ${
            dragging ? "cursor-grabbing" : "cursor-grab animate-soft-pulse"
          }`}
          style={{ left: pos.x, top: pos.y }}
          title={`${botName} — glisser pour déplacer, cliquer pour parler`}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            dragRef.current = {
              startX: e.clientX,
              startY: e.clientY,
              origX: pos.x,
              origY: pos.y,
              moved: false,
              pointerId: e.pointerId,
            };
            setDragging(true);
          }}
          onPointerMove={(e) => {
            const d = dragRef.current;
            if (!d || e.pointerId !== d.pointerId) return;
            const dx = e.clientX - d.startX;
            const dy = e.clientY - d.startY;
            if (Math.abs(dx) > 4 || Math.abs(dy) > 4) d.moved = true;
            if (d.moved) {
              setPos(clampPos(d.origX + dx, d.origY + dy));
            }
          }}
          onPointerUp={(e) => {
            const d = dragRef.current;
            if (!d || e.pointerId !== d.pointerId) return;
            try {
              e.currentTarget.releasePointerCapture(e.pointerId);
            } catch {
              /* ignore */
            }
            setDragging(false);
            if (d.moved) {
              const next = clampPos(
                d.origX + (e.clientX - d.startX),
                d.origY + (e.clientY - d.startY),
              );
              setPos(next);
              try {
                localStorage.setItem(POS_KEY, JSON.stringify(next));
              } catch {
                /* ignore */
              }
            } else {
              setOpen(true);
            }
            dragRef.current = null;
          }}
          onPointerCancel={() => {
            setDragging(false);
            dragRef.current = null;
          }}
        >
          <BotAvatar
            color={botColor}
            mood={botMood}
            size="lg"
            bounce={!dragging}
            emotion={open ? "idle" : idleEmotion}
          />
          <span className="rounded-full border border-border bg-card px-2 py-0.5 text-[10px] font-semibold shadow">
            {botName}
          </span>
        </button>
      ) : null}

      {/* Panneau chat bot — près du personnage */}
      {open && pos ? (
        <div
          className="fixed z-50 flex h-[min(480px,70vh)] w-[min(360px,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
          style={{
            left: Math.min(
              Math.max(8, pos.x - 140),
              typeof window !== "undefined" ? window.innerWidth - 368 : pos.x,
            ),
            top: Math.min(
              Math.max(8, pos.y - 420),
              typeof window !== "undefined" ? window.innerHeight - 500 : 8,
            ),
          }}
        >
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
