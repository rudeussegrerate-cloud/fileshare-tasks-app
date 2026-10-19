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
import { Loader2, Mail, Settings2, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  runMultiStepTour,
  getSequenceForAction,
  stopTour,
  onTourActiveChange,
  type TourView,
} from "@/lib/botTour";
import { animate } from "animejs";

const VOICE_KEY = "scandoc-bot-voice";

/** Nettoie le texte pour la synthèse vocale */
function plainForSpeech(raw: string): string {
  return raw
    .replace(/[*_#`]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/😊|💪|😄|🤖|⚡|💭|💧|👋/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function speakBotReply(text: string, enabled: boolean) {
  if (!enabled || typeof window === "undefined") return;
  const synth = window.speechSynthesis;
  if (!synth) return;
  try {
    synth.cancel();
    const u = new SpeechSynthesisUtterance(plainForSpeech(text));
    u.lang = "fr-FR";
    u.rate = 1.02;
    u.pitch = 1.05;
    // Préférer une voix française
    const voices = synth.getVoices();
    const fr =
      voices.find((v) => v.lang.startsWith("fr") && /google|thomas|julie|hortense|marie/i.test(v.name)) ||
      voices.find((v) => v.lang.startsWith("fr"));
    if (fr) u.voice = fr;
    synth.speak(u);
  } catch (e) {
    console.warn("[bot voice]", e);
  }
}

function stopSpeaking() {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
}


const MOODS = [
  { id: "joyeux", label: "Joyeux" },
  { id: "calme", label: "Calme" },
  { id: "motivant", label: "Motivant" },
  { id: "sérieux", label: "Sérieux" },
  { id: "blagueur", label: "Blagueur" },
];


/** Couleurs du guide courrier */
const ROBOT: Record<
  string,
  { body: string; bodyDark: string; accent: string; led: string; panel: string }
> = {
  navy: {
    body: "#0066b3",
    bodyDark: "#004d8c",
    accent: "#3d8fd1",
    led: "#00a3e0",
    panel: "#0c2744",
  },
  teal: {
    body: "#007a3d",
    bodyDark: "#005c2e",
    accent: "#3dba6e",
    led: "#5dce8a",
    panel: "#0a2e1a",
  },
  amber: {
    body: "#b45309",
    bodyDark: "#78350f",
    accent: "#fbbf24",
    led: "#fde68a",
    panel: "#1c1917",
  },
  rose: {
    body: "#be123c",
    bodyDark: "#881337",
    accent: "#fb7185",
    led: "#fda4af",
    panel: "#1c1917",
  },
  violet: {
    body: "#6d28d9",
    bodyDark: "#4c1d95",
    accent: "#a78bfa",
    led: "#c4b5fd",
    panel: "#1e1b4b",
  },
};

const COLORS: Record<string, string> = {
  navy: "from-[#1e3a5f] to-[#2d4a6f]",
  teal: "from-teal-600 to-teal-500",
  amber: "from-amber-500 to-amber-400",
  rose: "from-rose-500 to-rose-400",
  violet: "from-violet-600 to-violet-500",
};

type IdleEmotion = "idle" | "wave" | "look" | "sleep" | "excited" | "think" | "happy" | "sad" | "curious";

/**
 * Robot assistant — texture métal/verre, animations idle + émotions.
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
  void gender;
  const dim =
    size === "lg" ? "size-[84px]" : size === "sm" ? "size-11" : "size-[68px]";
  const palette = ROBOT[color] ?? ROBOT.navy!;
  const uid = `bot-${color}-${size}-${mood}`;

  const happy =
    mood === "joyeux" ||
    mood === "blagueur" ||
    emotion === "happy" ||
    emotion === "excited" ||
    emotion === "wave";
  const serious = mood === "sérieux" || emotion === "sad";
  const thinking = emotion === "think" || emotion === "curious";
  const sleepy = emotion === "sleep";
  const looking = emotion === "look" || emotion === "curious";

  const emotionClass =
    emotion === "wave"
      ? "bot-gesture-wave"
      : emotion === "think" || emotion === "curious"
        ? "bot-gesture-think"
        : emotion === "sad"
          ? "bot-gesture-shake"
          : happy
            ? "bot-emote-happy"
            : "";

  if (photoUrl) {
    return (
      <div
        className={`${dim} bot-avatar-3d overflow-hidden rounded-2xl border border-white/50 shadow-raised ring-2 ring-brand/30 ${bounce ? "bot-alive" : ""}`}
      >
        <img src={photoUrl} alt="" className="size-full object-cover" />
      </div>
    );
  }

  const eyeOpen = sleepy ? 2 : happy ? 10 : serious ? 5.2 : 7.8;
  const eyeY = sleepy ? 32 : thinking ? 27.5 : 29;
  const pupilShift = looking ? 1.4 : thinking ? -1.1 : 0;
  const mouth = sleepy
    ? "M27 47 H37"
    : happy
      ? "M23 43.5 Q32 55 41 43.5"
      : serious
        ? "M27 47.5 H37"
        : thinking
          ? "M28 46.5 Q33 50 40 45"
          : "M26 46 Q32 51 38 46";

  const svgSize = size === "sm" ? 44 : size === "lg" ? 84 : 68;

  return (
    <div
      className={`${dim} bot-avatar-3d relative ${bounce ? "bot-alive" : ""} ${emotionClass}`}
      style={{
        filter: `drop-shadow(0 12px 18px ${palette.bodyDark}66) drop-shadow(0 0 14px ${palette.led}40)`,
      }}
      aria-hidden
    >
      <div
        className="bot-ground-shadow pointer-events-none absolute -bottom-0.5 left-1/2 h-2.5 w-[72%] -translate-x-1/2 rounded-[100%] opacity-45 blur-[4px]"
        style={{ background: palette.bodyDark }}
      />
      <svg
        viewBox="0 0 64 64"
        width={svgSize}
        height={svgSize}
        className="relative z-[1] block"
        role="img"
      >
        <defs>
          {/* Texture métal brossé (lignes) */}
          <pattern
            id={`${uid}-brush`}
            width="4"
            height="4"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(25)"
          >
            <rect width="4" height="4" fill={palette.body} />
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="4"
              stroke={palette.bodyDark}
              strokeWidth="0.6"
              opacity="0.35"
            />
          </pattern>
          <linearGradient id={`${uid}-body`} x1="0.1" y1="0" x2="0.95" y2="1">
            <stop offset="0%" stopColor={palette.accent} />
            <stop offset="38%" stopColor={palette.body} />
            <stop offset="100%" stopColor={palette.bodyDark} />
          </linearGradient>
          <linearGradient id={`${uid}-edge`} x1="0" y1="0.5" x2="1" y2="0.5">
            <stop offset="0%" stopColor="#000000" stopOpacity="0.25" />
            <stop offset="40%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.3" />
          </linearGradient>
          <linearGradient id={`${uid}-glass`} x1="0.5" y1="0" x2="0.5" y2="1">
            <stop offset="0%" stopColor="#94a3b8" stopOpacity="0.35" />
            <stop offset="25%" stopColor={palette.panel} stopOpacity="0.95" />
            <stop offset="100%" stopColor={palette.bodyDark} />
          </linearGradient>
          <linearGradient id={`${uid}-shine`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
            <stop offset="35%" stopColor="#ffffff" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <radialGradient id={`${uid}-led`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="45%" stopColor={palette.led} />
            <stop offset="100%" stopColor={palette.led} stopOpacity="0.15" />
          </radialGradient>
          <filter id={`${uid}-glow`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Antenne */}
        <line
          x1="32"
          y1="5.5"
          x2="32"
          y2="13.5"
          stroke={palette.bodyDark}
          strokeWidth="2.8"
          strokeLinecap="round"
        />
        <circle
          className="bot-antenna-led"
          cx="32"
          cy="4.5"
          r="3.8"
          fill={`url(#${uid}-led)`}
          filter={`url(#${uid}-glow)`}
        />

        {/* Joints latéraux */}
        <rect x="4" y="25" width="5.5" height="15" rx="2.6" fill={palette.bodyDark} />
        <rect x="54.5" y="25" width="5.5" height="15" rx="2.6" fill={palette.bodyDark} />
        <rect
          x="5.2"
          y="27.5"
          width="3.2"
          height="10"
          rx="1.4"
          fill={palette.accent}
          opacity="0.55"
          className="bot-joint-glow"
        />
        <rect
          x="55.6"
          y="27.5"
          width="3.2"
          height="10"
          rx="1.4"
          fill={palette.accent}
          opacity="0.55"
          className="bot-joint-glow"
        />

        {/* Coque métal */}
        <rect
          x="9"
          y="11.5"
          width="46"
          height="45"
          rx="14.5"
          fill={`url(#${uid}-body)`}
        />
        <rect
          x="9"
          y="11.5"
          width="46"
          height="45"
          rx="14.5"
          fill={`url(#${uid}-brush)`}
          opacity="0.28"
        />
        <rect
          x="9"
          y="11.5"
          width="46"
          height="45"
          rx="14.5"
          fill={`url(#${uid}-edge)`}
          opacity="0.5"
        />
        {/* Reflet latéral animé */}
        <rect
          className="bot-metal-sheen"
          x="11"
          y="13"
          width="14"
          height="40"
          rx="8"
          fill={`url(#${uid}-shine)`}
          opacity="0.7"
        />

        {/* Visière verre */}
        <rect
          x="14"
          y="18.5"
          width="36"
          height="31"
          rx="10.5"
          fill={`url(#${uid}-glass)`}
        />
        <rect
          className="bot-glass-shimmer"
          x="14"
          y="18.5"
          width="36"
          height="31"
          rx="10.5"
          fill={`url(#${uid}-shine)`}
        />
        {/* Bordure verre */}
        <rect
          x="14"
          y="18.5"
          width="36"
          height="31"
          rx="10.5"
          fill="none"
          stroke="#ffffff"
          strokeOpacity="0.22"
          strokeWidth="1.1"
        />

        {/* Yeux */}
        <g className="bot-eyes" style={{ transformOrigin: "32px 33px" }}>
          <rect
            x="20.2"
            y={eyeY}
            width="8.2"
            height={eyeOpen}
            rx="4.1"
            fill="#f1f5f9"
          />
          <rect
            x="35.6"
            y={eyeY}
            width="8.2"
            height={eyeOpen}
            rx="4.1"
            fill="#f1f5f9"
          />
          {!sleepy ? (
            <>
              <circle
                className="bot-pupil"
                cx={24.3 + pupilShift}
                cy={eyeY + eyeOpen * 0.55}
                r={happy ? 2.5 : 2.15}
                fill={palette.led}
                filter={`url(#${uid}-glow)`}
              />
              <circle
                className="bot-pupil"
                cx={39.7 + pupilShift}
                cy={eyeY + eyeOpen * 0.55}
                r={happy ? 2.5 : 2.15}
                fill={palette.led}
                filter={`url(#${uid}-glow)`}
              />
              <circle
                cx={25.1 + pupilShift}
                cy={eyeY + eyeOpen * 0.38}
                r="0.75"
                fill="#ffffff"
              />
              <circle
                cx={40.5 + pupilShift}
                cy={eyeY + eyeOpen * 0.38}
                r="0.75"
                fill="#ffffff"
              />
            </>
          ) : null}
        </g>

        {happy ? (
          <>
            <circle cx="17.5" cy="42.5" r="2.3" fill={palette.accent} opacity="0.5" />
            <circle cx="46.5" cy="42.5" r="2.3" fill={palette.accent} opacity="0.5" />
          </>
        ) : null}

        <path
          d={mouth}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={happy ? 2.7 : 2.15}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <rect
          x="9"
          y="11.5"
          width="46"
          height="45"
          rx="14.5"
          fill="none"
          stroke="#ffffff"
          strokeOpacity="0.2"
          strokeWidth="1"
        />
      </svg>
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
  const skills = useQuery(api.bot.listMySkills);
  const saveSkill = useMutation(api.bot.saveSkill);
  const deleteSkill = useMutation(api.bot.deleteSkill);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("Guide courrier");
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
  const [voiceOn, setVoiceOn] = useState(() => {
    try {
      return localStorage.getItem(VOICE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [tourRunning, setTourRunning] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<{ stop?: () => void } | null>(null);
  const botFloatRef = useRef<HTMLButtonElement | null>(null);

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

  useEffect(() => {
    return onTourActiveChange(setTourRunning);
  }, []);

  // Émotions / réactions quand le bot n'est pas utilisé
  useEffect(() => {
    if (open || dragging) {
      setIdleEmotion("idle");
      return;
    }
    const sequence: IdleEmotion[] = [
      "idle",
      "look",
      "curious",
      "wave",
      "happy",
      "think",
      "excited",
      "idle",
      "look",
      "sleep",
    ];
    let i = 0;
    const tick = () => {
      i = (i + 1) % sequence.length;
      setIdleEmotion(sequence[i]!);
    };
    const id = window.setInterval(tick, 2600);
    return () => window.clearInterval(id);
  }, [open, dragging]);


  const startListening = () => {
    const w = window as unknown as {
      SpeechRecognition?: new () => any;
      webkitSpeechRecognition?: new () => any;
    };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) {
      toast.error(
        "La reconnaissance vocale n'est pas disponible sur ce navigateur.",
      );
      return;
    }
    try {
      stopSpeaking();
      const rec = new SR();
      rec.lang = "fr-FR";
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      recognitionRef.current = rec;
      rec.onstart = () => {
        setListening(true);
        setIdleEmotion("curious");
      };
      rec.onend = () => setListening(false);
      rec.onerror = () => {
        setListening(false);
        toast.message("Micro interrompu");
      };
      rec.onresult = (ev: {
        results?: ArrayLike<ArrayLike<{ transcript?: string }>>;
      }) => {
        const said = ev.results?.[0]?.[0]?.transcript?.trim();
        if (said) {
          setText(said);
          setOpen(true);
          toast.message(`Vous : ${said.slice(0, 60)}`);
        }
      };
      rec.start();
    } catch {
      toast.error("Impossible d'accéder au micro.");
    }
  };

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
          ref={botFloatRef}
          className={`fixed z-40 flex touch-none flex-col items-center gap-1 rounded-full focus:outline-none ${
            dragging ? "cursor-grabbing" : cn("cursor-grab animate-soft-pulse bot-alive", speaking && "bot-speaking", listening && "bot-speaking")
          }`}
          style={{ left: pos.x, top: pos.y }}
          title={`${botName} — aide courrier (glisser pour déplacer)`}
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
      {tourRunning ? (
        <button
          type="button"
          className="fixed left-1/2 top-3 z-[10001] -translate-x-1/2 rounded-full border border-brand/40 bg-brand px-4 py-2 text-xs font-semibold text-primary-foreground shadow-lg"
          onClick={() => stopTour()}
        >
          Arrêter le guidage
        </button>
      ) : null}

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
                Guide d'envoi de courrier · {botMood}
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
                  <li>Apprends : quand je dis mes reçus, ouvre les documents reçus</li>
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
                const res = await ask({ message: msg }) as {
                  reply?: string;
                  action?: string | null;
                  learned?: boolean;
                  emotion?: string;
                };
                if (res?.learned) {
                  toast.success("Tâche apprise par le bot");
                }
                if (res?.emotion) {
                  const e = res.emotion as IdleEmotion;
                  setIdleEmotion(e);
                  window.setTimeout(() => {
                    if (!open) setIdleEmotion("idle");
                  }, 4500);
                }
                const spoken = res?.reply ?? "";
                if (spoken && voiceOn) {
                  setSpeaking(true);
                  setIdleEmotion((prev) =>
                    prev === "idle" || prev === "sleep" ? "happy" : prev,
                  );
                  speakBotReply(spoken, true);
                  window.setTimeout(() => setSpeaking(false), Math.min(12000, 800 + spoken.length * 45));
                }
                const action = res?.action;
                if (action && action !== "reply") {
                  const map: Record<string, TourView> = {
                    open_home: "home",
                    open_inbox: "inbox",
                    open_sent: "sent",
                    open_send: "send",
                    open_suivi: "sent",
                    open_fichiers: "fichiers",
                    open_messages: "inbox",
                    open_actualites: "home",
                    open_announcements: "home",
                    open_departments: "departments",
                    open_settings: "settings",
                    open_accounts: "accounts",
                    remind_tasks: "inbox",
                  };
                  const view = map[action];
                  if (view) {
                    setOpen(false);
                    setIdleEmotion("excited");
                    toast.message("Suivez-moi…");
                    window.dispatchEvent(
                      new CustomEvent("scandoc:navigate", {
                        detail: { view },
                      }),
                    );
                    // Tour animé : déplacement + doigt + voix
                    window.setTimeout(async () => {
                      const el = botFloatRef.current;
                      const seq = getSequenceForAction(action) ?? {
                        view,
                        steps: [
                          {
                            target: view,
                            script: `Voici la section concernée.`,
                          },
                        ],
                      };
                      if (!el) return;
                      try {
                        setSpeaking(true);
                        setIdleEmotion("curious");
                        await runMultiStepTour({
                          botEl: el,
                          steps: seq.steps,
                          onBotMoved: (x, y) => {
                            setPos({ x, y });
                            try {
                              localStorage.setItem(
                                POS_KEY,
                                JSON.stringify({ x, y }),
                              );
                            } catch {
                              /* ignore */
                            }
                          },
                          speak: (text) => {
                            if (voiceOn) speakBotReply(text, true);
                          },
                          onStep: () => setIdleEmotion("wave"),
                        });
                      } catch (err) {
                        console.warn("[botTour]", err);
                      } finally {
                        setSpeaking(false);
                        setIdleEmotion("happy");
                      }
                    }, 400);
                  }
                }
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
              placeholder="Ex. : Comment répondre à un courrier ?"
              className="h-9 text-sm"
              disabled={busy}
            />
            <Button type="button"
                  title="Dictée vocale"
                  variant="outline"
                  size="icon"
                  disabled={busy || listening}
                  onClick={startListening}
                  className={cn(listening && "border-cyan-400 text-cyan-600")}
                >
                  {listening ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <span className="text-base" aria-hidden>🎤</span>
                  )}
                </Button>
                <Button
                  type="submit" size="sm" disabled={busy || !text.trim()}>
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
        <DialogContent className="flex max-h-[min(90vh,640px)] max-w-md flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 space-y-1 border-b border-border px-6 py-4 pr-12">
            <DialogTitle>Personnaliser votre assistant</DialogTitle>
            <DialogDescription>
              Choisissez son nom, son humeur et la façon dont il vous parle.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-4">
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
                  Optionnel. Vous pouvez aussi importer une photo pour personnaliser le guide.
                </p>
              </div>
              <div className="flex items-center justify-between gap-2 rounded-lg border border-border p-3">
                <div>
                  <p className="text-sm font-medium">Réponses vocales (optionnel)</p>
                  <p className="text-[11px] text-muted-foreground">
                    Désactivé par défaut. Activez pour que le guide lise ses réponses.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={voiceOn ? "default" : "outline"}
                  onClick={() => {
                    const next = !voiceOn;
                    setVoiceOn(next);
                    try {
                      localStorage.setItem(VOICE_KEY, next ? "1" : "0");
                    } catch {
                      /* ignore */
                    }
                    if (!next) stopSpeaking();
                    else speakBotReply("Réponses vocales activées.", true);
                  }}
                >
                  {voiceOn ? "Activé" : "Coupé"}
                </Button>
              </div>

              <Label>Photo de l&apos;assistant (avatar)</Label>
              <p className="text-[11px] text-muted-foreground">
                Importez une photo : elle s'affiche sur l'avatar du guide.
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
                        const blob: Blob = file;
                        const postUrl = await genAvatarUrl({});
                        const result = await fetch(postUrl, {
                          method: "POST",
                          headers: {
                            "Content-Type": blob.type || "image/png",
                          },
                          body: blob,
                        });
                        if (!result.ok) {
                          throw new Error(
                            `Échec de l'envoi (${result.status}). Réessayez.`,
                          );
                        }
                        const json = (await result.json()) as {
                          storageId: string;
                        };
                        await setAvatar({
                          storageId:
                            json.storageId as import("@/convex/_generated/dataModel").Id<"_storage">,
                        });
                        toast.success("Avatar du bot mis à jour");
                      } catch (err) {
                        console.error("[avatar]", err);
                        toast.error(
                          err instanceof Error
                            ? err.message
                            : "Upload de la photo impossible",
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

              <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
                <Label>Mode apprentissage — tâches automatisées</Label>
                <p className="text-[11px] text-muted-foreground">
                  Dites au bot : « Apprends : quand je dis <em>mes reçus</em>, ouvre les documents reçus ».
                  Il mémorise la phrase et l&apos;action.
                </p>
                {(skills?.length ?? 0) === 0 ? (
                  <p className="text-[11px] text-muted-foreground">Aucune tâche apprise pour l&apos;instant.</p>
                ) : (
                  <ul className="max-h-28 space-y-1 overflow-y-auto text-xs">
                    {skills!.map((s) => (
                      <li
                        key={s._id}
                        className="flex items-start justify-between gap-2 rounded-md bg-muted/50 px-2 py-1.5"
                      >
                        <span className="min-w-0">
                          <span className="font-medium">{s.name}</span>
                          <span className="block text-[10px] text-muted-foreground">
                            « {s.trigger} » → {s.action ?? "reply"} ({s.useCount}×)
                          </span>
                        </span>
                        <button
                          type="button"
                          className="shrink-0 text-[10px] text-destructive"
                          onClick={async () => {
                            try {
                              await deleteSkill({ skillId: s._id });
                              toast.message("Tâche supprimée");
                            } catch (e) {
                              toast.error(
                                e instanceof Error ? e.message : "Erreur",
                              );
                            }
                          }}
                        >
                          Suppr.
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
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
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 border-t border-border bg-card px-6 py-3">
              <Button
                type="button"
                className="flex-1 sm:flex-none"
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
        </DialogContent>
      </Dialog>
    </>
  );
}
