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
import { stylizeToGhibli } from "@/lib/ghibliStyle";

const MOODS = [
  { id: "joyeux", label: "Joyeux" },
  { id: "calme", label: "Calme" },
  { id: "motivant", label: "Motivant" },
  { id: "sérieux", label: "Sérieux" },
  { id: "blagueur", label: "Blagueur" },
];

/** Couleurs de cheveux / accessoires du personnage chibi */
const HAIR: Record<string, { hair: string; hairDark: string; accent: string }> = {
  navy: { hair: "#1e3a5f", hairDark: "#0f2744", accent: "#3b82f6" },
  teal: { hair: "#0d9488", hairDark: "#0f766e", accent: "#2dd4bf" },
  amber: { hair: "#f59e0b", hairDark: "#d97706", accent: "#fbbf24" },
  rose: { hair: "#f43f5e", hairDark: "#e11d48", accent: "#fb7185" },
  violet: { hair: "#7c3aed", hairDark: "#5b21b6", accent: "#a78bfa" },
};

const COLORS: Record<string, string> = {
  navy: "from-[#1e3a5f] to-[#2d4a6f]",
  teal: "from-teal-600 to-teal-500",
  amber: "from-amber-500 to-amber-400",
  rose: "from-rose-500 to-rose-400",
  violet: "from-violet-600 to-violet-500",
};

type IdleEmotion = "idle" | "wave" | "look" | "sleep" | "excited" | "think";

/**
 * Avatar chibi expressif (style sticker cartoon).
 * Design original — pas une copie de personnages protégés.
 */
function BotAvatar({
  color,
  mood,
  size = "md",
  bounce = false,
  emotion = "idle",
  photoUrl,
  gender = "neutral",
}: {
  color: string;
  mood: string;
  size?: "sm" | "md" | "lg";
  bounce?: boolean;
  emotion?: IdleEmotion;
  photoUrl?: string | null;
  gender?: "male" | "female" | "neutral";
}) {
  const dim =
    size === "lg" ? "size-[72px]" : size === "sm" ? "size-10" : "size-14";
  let palette = HAIR[color] ?? HAIR.navy!;
  // Avatar masculin type sticker : cheveux verts, traits plus nets
  if (gender === "male" && !photoUrl) {
    palette = { hair: "#5cb85c", hairDark: "#3d8b3d", accent: "#2d6a2d" };
  }
  const skin = gender === "male" ? "#f0d0a0" : "#ffdbac";
  const skinShade = "#f5c99a";

  // Photo utilisateur comme visage (toujours animée)
  if (photoUrl) {
    const happy =
      mood === "joyeux" ||
      mood === "blagueur" ||
      emotion === "excited" ||
      emotion === "wave";
    return (
      <div
        className={cn(
          "relative select-none overflow-visible transition-transform",
          dim,
          bounce && emotion === "idle" && "assistant-bounce",
          emotion === "wave" && "assistant-wave-body",
          emotion === "excited" && "assistant-excited",
          emotion === "sleep" && "assistant-sleep",
          emotion === "think" && "assistant-think",
        )}
      >
        <div
          className={cn(
            "relative h-full w-full overflow-hidden rounded-full border-2 border-white shadow-lg ring-2",
            emotion === "sleep" && "opacity-80 grayscale-[30%]",
          )}
          
        >
          <img
            src={photoUrl}
            alt="Avatar assistant"
            className={cn(
              "h-full w-full object-cover",
              emotion === "look" && "origin-center scale-110 translate-x-0.5",
              emotion === "sleep" && "brightness-90",
            )}
            draggable={false}
          />
          {/* Voile d'expression */}
          {emotion === "sleep" ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/25 to-transparent py-0.5 text-center text-[8px] text-white">
              zzz
            </div>
          ) : null}
        </div>
        {happy && emotion !== "sleep" ? (
          <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 text-[10px]">
            😊
          </span>
        ) : null}
        {emotion === "excited" ? (
          <span className="absolute -right-1 -top-1 text-sm">✨</span>
        ) : null}
        {emotion === "think" ? (
          <span className="absolute -right-0.5 -top-2 text-xs">💭</span>
        ) : null}
        {emotion === "wave" ? (
          <span className="absolute -left-1 top-1/3 text-sm">👋</span>
        ) : null}
      </div>
    );
  }

  // Expression
  const happy =
    mood === "joyeux" ||
    mood === "blagueur" ||
    emotion === "excited" ||
    emotion === "wave";
  const serious = mood === "sérieux" && emotion === "idle";
  const sleepy = emotion === "sleep";
  const thinking = emotion === "think";
  const looking = emotion === "look";

  return (
    <div
      className={cn(
        "relative select-none transition-transform",
        dim,
        bounce && emotion === "idle" && "assistant-bounce",
        emotion === "wave" && "assistant-wave-body",
        emotion === "excited" && "assistant-excited",
        emotion === "sleep" && "assistant-sleep",
        emotion === "think" && "assistant-think",
      )}
      title={emotion}
    >
      <svg viewBox="0 0 120 120" className="h-full w-full drop-shadow-md" aria-hidden>
        {/* Ombre */}
        <ellipse cx="60" cy="112" rx="28" ry="5" fill="rgba(0,0,0,0.12)" />

        {/* Cheveux arrière */}
        <path
          d="M28 58 C22 30 40 12 60 10 C80 12 98 30 92 58 L88 52 C82 28 68 18 60 18 C52 18 38 28 32 52 Z"
          fill={palette.hair}
        />

        {/* Tête */}
        <ellipse cx="60" cy="58" rx="34" ry="36" fill={skin} />
        <ellipse cx="48" cy="68" rx="8" ry="5" fill={skinShade} opacity="0.45" />
        <ellipse cx="72" cy="68" rx="8" ry="5" fill={skinShade} opacity="0.45" />

        {/* Cheveux avant (frange) */}
        <path
          d="M30 48 C36 28 50 22 60 22 C70 22 84 28 90 48 C82 38 72 34 60 34 C48 34 38 38 30 48 Z"
          fill={palette.hairDark}
        />
        <path
          d="M42 28 C48 20 56 18 60 18 C55 24 50 28 42 32 Z"
          fill={palette.hair}
        />
        <path
          d="M78 28 C72 20 64 18 60 18 C65 24 70 28 78 32 Z"
          fill={palette.hair}
        />

        {/* Yeux */}
        {sleepy ? (
          <>
            <path d="M42 56 Q48 60 54 56" stroke="#333" strokeWidth="2.5" fill="none" strokeLinecap="round" />
            <path d="M66 56 Q72 60 78 56" stroke="#333" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          </>
        ) : serious ? (
          <>
            <path d="M40 52 L54 54" stroke="#333" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M66 54 L80 52" stroke="#333" strokeWidth="2.2" strokeLinecap="round" />
            <ellipse cx="48" cy="58" rx="4.5" ry="5.5" fill="#2a2a2a" />
            <ellipse cx="72" cy="58" rx="4.5" ry="5.5" fill="#2a2a2a" />
            <circle cx="49.5" cy="56.5" r="1.3" fill="#fff" />
            <circle cx="73.5" cy="56.5" r="1.3" fill="#fff" />
          </>
        ) : (
          <>
            <ellipse
              cx={looking ? 50 : 48}
              cy="57"
              rx="6"
              ry="7.5"
              fill="#2a2a2a"
            />
            <ellipse
              cx={looking ? 74 : 72}
              cy="57"
              rx="6"
              ry="7.5"
              fill="#2a2a2a"
            />
            <circle cx={looking ? 52 : 50} cy="54.5" r="2.2" fill="#fff" />
            <circle cx={looking ? 76 : 74} cy="54.5" r="2.2" fill="#fff" />
            <circle cx={looking ? 48.5 : 46.5} cy="58" r="1" fill="#fff" opacity="0.7" />
            <circle cx={looking ? 72.5 : 70.5} cy="58" r="1" fill="#fff" opacity="0.7" />
          </>
        )}

        {/* Sourcils */}
        {!sleepy && (
          <>
            <path
              d={
                serious
                  ? "M40 48 L54 50"
                  : happy
                    ? "M40 48 Q48 44 54 48"
                    : "M40 49 Q48 46 54 49"
              }
              stroke={palette.hairDark}
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
            />
            <path
              d={
                serious
                  ? "M66 50 L80 48"
                  : happy
                    ? "M66 48 Q72 44 80 48"
                    : "M66 49 Q72 46 80 49"
              }
              stroke={palette.hairDark}
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
            />
          </>
        )}

        {/* Bouche */}
        {sleepy ? (
          <ellipse cx="60" cy="74" rx="4" ry="2.5" fill="#e8a0a0" />
        ) : happy ? (
          <path
            d="M48 70 Q60 84 72 70"
            fill="#e85d75"
            stroke="#c44d62"
            strokeWidth="1"
          />
        ) : serious ? (
          <path d="M52 74 L68 74" stroke="#c44d62" strokeWidth="2.2" strokeLinecap="round" />
        ) : thinking ? (
          <path d="M56 74 Q62 78 68 72" stroke="#c44d62" strokeWidth="2" fill="none" strokeLinecap="round" />
        ) : (
          <path d="M50 72 Q60 80 70 72" stroke="#c44d62" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        )}

        {/* Joues */}
        {(happy || mood === "calme") && !serious && (
          <>
            <ellipse cx="38" cy="68" rx="5" ry="3.5" fill="#ffb4b4" opacity="0.65" />
            <ellipse cx="82" cy="68" rx="5" ry="3.5" fill="#ffb4b4" opacity="0.65" />
          </>
        )}

        {/* Corps miniature */}
        <ellipse cx="60" cy="102" rx="16" ry="10" fill={palette.accent} />
        <rect x="48" y="92" width="24" height="12" rx="6" fill={palette.accent} />
      </svg>

      {emotion === "excited" ? (
        <span className="absolute -right-1 -top-1 text-sm">✨</span>
      ) : null}
      {emotion === "think" ? (
        <span className="absolute -right-0.5 -top-2 text-xs">💭</span>
      ) : null}
      {emotion === "sleep" ? (
        <span className="absolute -right-1 top-0 text-[10px] text-muted-foreground">
          zzz
        </span>
      ) : null}
    </div>
  );
}

function clampPos(x: number, y: number) {
  if (typeof window === "undefined") return { x, y };
  const margin = 8;
  const w = 84;
  const h = 100;
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
  const genAvatarUrl = useMutation(api.bot.generateAvatarUploadUrl);
  const setAvatar = useMutation(api.bot.setAvatar);
  const clearAvatar = useMutation(api.bot.clearAvatar);
  const ask = useAction(api.assistantBot.ask);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("Aide");
  const [mood, setMood] = useState("calme");
  const [personality, setPersonality] = useState("");
  const [color, setColor] = useState("navy");
  const [gender, setGender] = useState<"male" | "female" | "neutral">("neutral");
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
    if ("gender" in bot && bot.gender) setGender(bot.gender as "male" | "female" | "neutral");
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
            photoUrl={bot && "avatarUrl" in bot ? bot.avatarUrl : null}
            gender={gender}
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
            <BotAvatar color={botColor} mood={botMood} size="sm" photoUrl={bot && "avatarUrl" in bot ? bot.avatarUrl : null} />
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
              <BotAvatar color={color} mood={mood} size="lg" bounce photoUrl={bot && "avatarUrl" in bot ? bot.avatarUrl : null} />
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
              <div className="space-y-1.5">
                <Label>Genre de l&apos;assistant</Label>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["male", "Homme"],
                      ["female", "Femme"],
                      ["neutral", "Neutre"],
                    ] as const
                  ).map(([id, label]) => (
                    <Button
                      key={id}
                      type="button"
                      size="sm"
                      variant={gender === id ? "default" : "outline"}
                      onClick={() => setGender(id)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Homme : avatar sticker aux cheveux verts. Ou importez une photo
                  (style Ghibli).
                </p>
              </div>
              <Label>Photo de l&apos;assistant (avatar)</Label>
              <p className="text-[11px] text-muted-foreground">
                Importez une photo : elle est transformée en style Ghibli et devient le visage animé du bot.
              </p>
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs font-medium hover:bg-muted">
                  {uploadingAvatar ? "Envoi…" : "Choisir une photo"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    disabled={uploadingAvatar}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      if (file.size > 4 * 1024 * 1024) {
                        toast.error("Image trop lourde (max 4 Mo).");
                        return;
                      }
                      setUploadingAvatar(true);
                      try {
                        toast.message("Style Ghibli en cours…");
                        const styled = await stylizeToGhibli(file);
                        const postUrl = await genAvatarUrl({});
                        const result = await fetch(postUrl, {
                          method: "POST",
                          headers: { "Content-Type": "image/png" },
                          body: styled,
                        });
                        if (!result.ok) throw new Error("Échec de l'envoi");
                        const json = (await result.json()) as { storageId: string };
                        await setAvatar({
                          storageId: json.storageId as import("@/convex/_generated/dataModel").Id<"_storage">,
                        });
                        toast.success("Avatar style Ghibli appliqué");
                      } catch (err) {
                        toast.error(
                          err instanceof Error ? err.message : "Upload impossible",
                        );
                      } finally {
                        setUploadingAvatar(false);
                      }
                    }}
                  />
                </label>
                {bot && "avatarUrl" in bot && bot.avatarUrl ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 text-xs"
                    onClick={async () => {
                      try {
                        await clearAvatar({});
                        toast.message("Photo retirée");
                      } catch (err) {
                        toast.error(
                          err instanceof Error ? err.message : "Erreur",
                        );
                      }
                    }}
                  >
                    Retirer la photo
                  </Button>
                ) : null}
              </div>

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
                    await saveBot({ name, mood, personality, color, gender });
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
