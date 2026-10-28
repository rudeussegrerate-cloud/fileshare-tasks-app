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
 * Tête robot style « visière » (réf. avatar cartoon) — coque claire + écran expressif.
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
  void color;
  const dim =
    size === "lg" ? "size-[88px]" : size === "sm" ? "size-11" : "size-[72px]";
  const uid = `visor-${size}-${emotion}-${mood}`;

  const happy =
    mood === "joyeux" ||
    mood === "blagueur" ||
    emotion === "happy" ||
    emotion === "excited";
  const angry = emotion === "sad" && mood === "sérieux";
  const sad = emotion === "sad";
  const thinking = emotion === "think";
  const curious = emotion === "curious" || emotion === "look";
  const sleepy = emotion === "sleep";
  const alert = emotion === "excited" && mood === "sérieux";

  // Teinte d'écran selon émotion
  const screen =
    happy
      ? { bg: "#1e3a5f", glow: "#5eead4", eye: "#5eead4" }
      : sad
        ? { bg: "#3b1d4a", glow: "#e879f9", eye: "#f0abfc" }
        : thinking
          ? { bg: "#1e293b", glow: "#38bdf8", eye: "#7dd3fc" }
          : sleepy
            ? { bg: "#0f172a", glow: "#64748b", eye: "#94a3b8" }
            : curious
              ? { bg: "#172554", glow: "#60a5fa", eye: "#93c5fd" }
              : { bg: "#0f2744", glow: "#2dd4bf", eye: "#5eead4" };

  const emotionClass =
    emotion === "wave"
      ? "bot-gesture-wave"
      : thinking || curious
        ? "bot-gesture-think"
        : sad
          ? "bot-gesture-shake"
          : happy
            ? "bot-emote-happy"
            : "";

  if (photoUrl) {
    return (
      <div
        className={`${dim} bot-avatar-3d overflow-hidden rounded-[22px] border border-white/60 shadow-raised ring-2 ring-cyan-400/30 ${bounce ? "bot-alive" : ""}`}
      >
        <img src={photoUrl} alt="" className="size-full object-cover" />
      </div>
    );
  }

  const svgSize = size === "sm" ? 44 : size === "lg" ? 88 : 72;

  /** Contenu de la visière (yeux / symboles) */
  const face = (() => {
    if (sleepy) {
      return (
        <>
          <path d="M18 30 H28" stroke={screen.eye} strokeWidth="2.8" strokeLinecap="round" />
          <path d="M36 30 H46" stroke={screen.eye} strokeWidth="2.8" strokeLinecap="round" />
          <circle cx="32" cy="38" r="1.4" fill={screen.eye} opacity="0.7" />
        </>
      );
    }
    if (emotion === "wave") {
      return (
        <>
          <circle cx="23" cy="28" r="4" fill={screen.eye} />
          <path d="M38 24 L46 32 M46 24 L38 32" stroke={screen.eye} strokeWidth="2.8" strokeLinecap="round" />
          <path d="M26 40 Q32 44 38 40" fill="none" stroke={screen.eye} strokeWidth="2.2" strokeLinecap="round" />
        </>
      );
    }
    if (happy) {
      return (
        <>
          <circle cx="23" cy="28" r="4.2" fill={screen.eye} />
          <circle cx="41" cy="28" r="4.2" fill={screen.eye} />
          <circle cx="21.8" cy="26.8" r="1.3" fill="#ecfeff" />
          <circle cx="39.8" cy="26.8" r="1.3" fill="#ecfeff" />
          <path
            d="M24 38 Q32 46 40 38"
            fill="none"
            stroke={screen.eye}
            strokeWidth="2.6"
            strokeLinecap="round"
          />
        </>
      );
    }
    if (sad) {
      return (
        <>
          <circle cx="23" cy="30" r="3.6" fill={screen.eye} />
          <circle cx="41" cy="30" r="3.6" fill={screen.eye} />
          <path d="M20 24 L26 27" stroke={screen.eye} strokeWidth="1.8" strokeLinecap="round" opacity="0.7" />
          <path d="M44 24 L38 27" stroke={screen.eye} strokeWidth="1.8" strokeLinecap="round" opacity="0.7" />
          <path
            d="M24 42 Q32 36 40 42"
            fill="none"
            stroke={screen.eye}
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </>
      );
    }
    if (thinking) {
      return (
        <>
          <circle cx="23" cy="28" r="3.8" fill={screen.eye} />
          <circle cx="41" cy="28" r="3.8" fill={screen.eye} />
          <circle cx="24.2" cy="27" r="1.1" fill="#fff" />
          <circle cx="42.2" cy="27" r="1.1" fill="#fff" />
          <circle cx="48" cy="20" r="1.2" fill={screen.eye} opacity="0.9" />
          <circle cx="51" cy="16" r="1.6" fill={screen.eye} opacity="0.7" />
          <circle cx="54" cy="12" r="2" fill={screen.eye} opacity="0.5" />
        </>
      );
    }
    if (curious) {
      return (
        <>
          <ellipse cx="22" cy="28" rx="5" ry="5.5" fill={screen.eye} />
          <ellipse cx="42" cy="28" rx="3.2" ry="3.5" fill={screen.eye} />
          <circle cx="20.5" cy="26.5" r="1.4" fill="#ecfeff" />
          <circle cx="41" cy="27" r="1" fill="#ecfeff" />
        </>
      );
    }
    return (
      <>
        <circle className="bot-pupil" cx="23" cy="29" r="4" fill={screen.eye} />
        <circle className="bot-pupil" cx="41" cy="29" r="4" fill={screen.eye} />
        <circle cx="21.6" cy="27.6" r="1.25" fill="#ecfeff" />
        <circle cx="39.6" cy="27.6" r="1.25" fill="#ecfeff" />
        <path
          d="M26 40 Q32 43 38 40"
          fill="none"
          stroke={screen.eye}
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.85"
        />
      </>
    );
  })();

  return (
    <div
      className={`${dim} bot-avatar-3d relative ${bounce ? "bot-alive" : ""} ${emotionClass}`}
      style={{
        filter: "drop-shadow(0 10px 18px rgba(15,40,80,0.35))",
      }}
      aria-hidden
    >
      <div className="bot-ground-shadow pointer-events-none absolute -bottom-0.5 left-1/2 h-2 w-[70%] -translate-x-1/2 rounded-[100%] bg-slate-700/40 blur-[3px]" />
      <svg
        viewBox="0 0 64 64"
        width={svgSize}
        height={svgSize}
        className="relative z-[1] block"
        role="img"
      >
        <defs>
          <linearGradient id={`${uid}-shell`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="55%" stopColor="#f1f5f9" />
            <stop offset="100%" stopColor="#e2e8f0" />
          </linearGradient>
          <linearGradient id={`${uid}-rim`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#a5f3fc" />
            <stop offset="100%" stopColor="#67e8f9" />
          </linearGradient>
          <linearGradient id={`${uid}-screen`} x1="0.5" y1="0" x2="0.5" y2="1">
            <stop offset="0%" stopColor={screen.bg} stopOpacity="0.92" />
            <stop offset="100%" stopColor="#020617" />
          </linearGradient>
          <radialGradient id={`${uid}-screenGlow`} cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor={screen.glow} stopOpacity="0.35" />
            <stop offset="100%" stopColor={screen.glow} stopOpacity="0" />
          </radialGradient>
          <filter id={`${uid}-soft`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="0.6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Coque blanche arrondie (style référence) */}
        <rect
          x="4"
          y="10"
          width="56"
          height="44"
          rx="16"
          fill={`url(#${uid}-shell)`}
        />
        {/* Liseré cyan discret */}
        <rect
          x="4"
          y="10"
          width="56"
          height="44"
          rx="16"
          fill="none"
          stroke={`url(#${uid}-rim)`}
          strokeWidth="1.6"
          opacity="0.85"
        />
        {/* Reflet coque */}
        <path
          d="M12 16 Q32 12 52 16"
          fill="none"
          stroke="#ffffff"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.7"
        />

        {/* Visière / écran */}
        <rect
          x="10"
          y="16"
          width="44"
          height="32"
          rx="12"
          fill={`url(#${uid}-screen)`}
        />
        <rect
          x="10"
          y="16"
          width="44"
          height="32"
          rx="12"
          fill={`url(#${uid}-screenGlow)`}
        />
        {/* Bord interne visière */}
        <rect
          x="10"
          y="16"
          width="44"
          height="32"
          rx="12"
          fill="none"
          stroke="#94a3b8"
          strokeOpacity="0.25"
          strokeWidth="1"
        />

        {/* Points décoratifs bas (comme sur les modèles) */}
        <circle cx="28" cy="50" r="1.3" fill="#cbd5e1" />
        <circle cx="32" cy="50" r="1.3" fill="#cbd5e1" />
        <circle cx="36" cy="50" r="1.3" fill="#cbd5e1" />

        {/* Visage expressif */}
        <g filter={`url(#${uid}-soft)`} className="bot-eyes">
          {face}
        </g>
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
  const mailBrief = useQuery(api.documents.assistantMailBrief);
  const skills = useQuery(api.bot.listMySkills);
  const saveSkill = useMutation(api.bot.saveSkill);
  const deleteSkill = useMutation(api.bot.deleteSkill);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [open, setOpen] = useState(false);
  const [proactiveBanner, setProactiveBanner] = useState<string | null>(null);
  const [localChat, setLocalChat] = useState<
    Array<{ id: string; role: "user" | "assistant"; body: string }>
  >([]);
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
    if (!open || !mailBrief) return;
    const parts: string[] = [];
    if (mailBrief.overdue > 0) parts.push(`${mailBrief.overdue} en retard`);
    if (mailBrief.urgent > 0) parts.push(`${mailBrief.urgent} urgent(s)`);
    if (mailBrief.unread > 0) parts.push(`${mailBrief.unread} non lu(s)`);
    if (mailBrief.recentNew > 0)
      parts.push(`${mailBrief.recentNew} nouveau(x) (24 h)`);
    if (parts.length === 0) {
      setProactiveBanner(null);
      return;
    }
    setProactiveBanner(
      "Point courrier : " +
        parts.join(", ") +
        ". Dites « inventaire », « voir les retards » ou « plus urgents ».",
    );
  }, [open, mailBrief]);

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
        typeof window !== "undefined" ? window.innerWidth - 100 : 300,
        typeof window !== "undefined" ? window.innerHeight - 120 : 400,
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
    // Séquence douce : peu de changements, majoritairement calme
    const sequence: IdleEmotion[] = [
      "idle",
      "idle",
      "look",
      "idle",
      "curious",
      "idle",
      "think",
      "idle",
      "happy",
      "idle",
      "sleep",
      "idle",
    ];
    let i = 0;
    const tick = () => {
      i = (i + 1) % sequence.length;
      setIdleEmotion(sequence[i]!);
    };
    const id = window.setInterval(tick, 4500);
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
            {proactiveBanner ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                {proactiveBanner}
              </div>
            ) : null}
            {(history?.length ?? 0) === 0 && localChat.length === 0 ? (
              <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">
                  Bonjour ! Je suis {botName}.
                </p>
                <p className="mt-1">
                  Posez-moi une question sur ScanDoc, par exemple :
                </p>
                <ul className="mt-1 list-inside list-disc">
                  <li>Inventaire de mes courriers</li>
                  <li>Voir les retards / les urgents</li>
                  <li>Afficher les plus récents</li>
                  <li>Comment envoyer un courrier ?</li>
                </ul>
              </div>
            ) : (
              <>
                {(history ?? []).map((m) => (
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
                ))}
                {localChat.map((m) => (
                  <div
                    key={m.id}
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
                ))}
              </>
            )}
            <div ref={bottomRef} />
          </div>

          <form
            className="flex gap-2 border-t border-border p-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!text.trim() || busy) return;
              if (!me?.user?._id) {
                toast.error("Session expirée — reconnectez-vous.");
                return;
              }
              setBusy(true);
              const msg = text.trim();
              setText("");
              setLocalChat((c) => [
                ...c,
                { id: `u-${Date.now()}`, role: "user", body: msg },
              ]);
              try {
                const res = await ask({ message: msg }) as {
                  reply?: string;
                  action?: string | null;
                  openDocumentId?: string | null;
                  learned?: boolean;
                  emotion?: string;
                  mailBrief?: {
                    unread?: number;
                    overdue?: number;
                    urgent?: number;
                    received?: number;
                  } | null;
                };
                const answer =
                  (res?.reply && String(res.reply).trim()) ||
                  "Je n'ai pas pu formuler de réponse. Réessayez ou dites « inventaire ».";
                setLocalChat((c) => [
                  ...c,
                  {
                    id: `a-${Date.now()}`,
                    role: "assistant",
                    body: answer,
                  },
                ]);
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
                const spoken = answer;
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
                    sort_recent: "inbox",
                    sort_urgent: "inbox",
                    filter_overdue: "inbox",
                    filter_urgent: "inbox",
                    filter_unread: "inbox",
                    inventory: "inbox",
                    open_latest_received: "inbox",
                    open_latest_unread: "inbox",
                    open_latest_urgent: "inbox",
                    open_latest_overdue: "inbox",
                  };
                  // Préférences liste (tri / filtre) pour l'assistant
                  if (
                    action === "sort_recent" ||
                    action === "sort_urgent" ||
                    action === "filter_overdue" ||
                    action === "filter_urgent" ||
                    action === "filter_unread" ||
                    action === "inventory"
                  ) {
                    const prefs: Record<string, string> = {};
                    if (action === "sort_recent") prefs.sort = "recent";
                    if (action === "sort_urgent") prefs.sort = "urgent";
                    if (action === "filter_overdue") prefs.filter = "en_retard";
                    if (action === "filter_urgent") prefs.filter = "urgent";
                    if (action === "filter_unread") prefs.filter = "envoye";
                    if (action === "inventory") {
                      prefs.filter = "all";
                      prefs.sort = "recent";
                    }
                    try {
                      localStorage.setItem(
                        "scandoc-docs-prefs",
                        JSON.stringify({
                          ...JSON.parse(
                            localStorage.getItem("scandoc-docs-prefs") || "{}",
                          ),
                          ...prefs,
                        }),
                      );
                    } catch {
                      /* ignore */
                    }
                    window.dispatchEvent(
                      new CustomEvent("scandoc:docs-prefs", { detail: prefs }),
                    );
                  }
                  if (res?.openDocumentId) {
                    toast.success("Ouverture du courrier…");
                    window.dispatchEvent(
                      new CustomEvent("scandoc:open-document", {
                        detail: { documentId: res.openDocumentId },
                      }),
                    );
                  }
                  const view = map[action];
                  if (view) {
                    setOpen(false);
                    setIdleEmotion("excited");
                    toast.message(
                      action.startsWith("open_") || action.startsWith("filter_") || action.startsWith("sort_")
                        ? "Action en cours…"
                        : "Suivez-moi…",
                    );
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
                const errMsg =
                  err instanceof Error ? err.message : "Assistant indisponible";
                setLocalChat((c) => [
                  ...c,
                  {
                    id: `e-${Date.now()}`,
                    role: "assistant",
                    body: errMsg,
                  },
                ]);
                toast.error(errMsg);
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
