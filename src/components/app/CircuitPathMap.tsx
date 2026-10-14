import { cn } from "@/lib/utils";
import { MapPin, Play, ChevronRight } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { animate } from "animejs";

export type CircuitStepNode = {
  stepIndex: number;
  assigneeName: string;
  assigneeDepartmentName?: string | null;
  taskLabel?: string | null;
  status: string;
  statusLabel?: string;
  note?: string | null;
  actedAt?: number | null;
};

type Props = {
  steps: CircuitStepNode[];
  currentStepIndex?: number;
  publicRef?: string | null;
  isFullyTreated?: boolean;
  className?: string;
};

/**
 * Carte 3D isométrique du parcours documentaire.
 * Perspective, profondeur, flux animé (anime.js).
 */
export function CircuitPathMap({
  steps,
  currentStepIndex = 0,
  publicRef,
  isFullyTreated,
  className,
}: Props) {
  const uid = useId().replace(/:/g, "");
  const flowRef = useRef<SVGPathElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [selected, setSelected] = useState<number | null>(
    isFullyTreated ? Math.max(0, steps.length - 1) : currentStepIndex,
  );
  const [tilt, setTilt] = useState({ x: 12, y: -18 });

  useEffect(() => {
    const path = flowRef.current;
    if (!path) return;
    const len = path.getTotalLength?.() || 400;
    path.style.strokeDasharray = String(len);
    path.style.strokeDashoffset = String(len);
    const anim = animate(path, {
      strokeDashoffset: [len, 0],
      duration: 2200,
      ease: "inOutCubic",
      loop: true,
      loopDelay: 600,
    });
    return () => {
      try {
        (anim as { pause?: () => void }).pause?.();
      } catch {
        /* ignore */
      }
    };
  }, [steps.length, currentStepIndex, isFullyTreated]);

  if (!steps.length) return null;

  const n = steps.length;
  // Positions isométriques le long d'un chemin en Z
  const nodes = steps.map((s, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const x = 8 + t * 78;
    const y = 28 + Math.sin(t * Math.PI) * 8 + (i % 2 === 0 ? 0 : 6);
    return { ...s, x, y };
  });

  const sel = selected != null ? steps.find((s) => s.stepIndex === selected) : null;
  const pathD =
    nodes.length > 0
      ? `M 4 42 ` +
        nodes
          .map((nd, i) => {
            const prev = i === 0 ? { x: 4, y: 42 } : nodes[i - 1]!;
            const c1x = prev.x + (nd.x - prev.x) * 0.4;
            const c1y = prev.y;
            const c2x = prev.x + (nd.x - prev.x) * 0.6;
            const c2y = nd.y;
            return `C ${c1x} ${c1y}, ${c2x} ${c2y}, ${nd.x} ${nd.y}`;
          })
          .join(" ")
      : "";

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-slate-700/40 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-slate-100 shadow-xl",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span className="flex size-7 items-center justify-center rounded-lg bg-violet-500/30 text-violet-200 ring-1 ring-violet-400/40">
            <MapPin className="size-3.5" />
          </span>
          Parcours 3D du dossier
          {publicRef ? (
            <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-violet-200">
              {publicRef}
            </span>
          ) : null}
        </div>
        <span className="text-[11px] text-slate-400">
          {isFullyTreated
            ? "Circuit clos"
            : `Position · étape ${(currentStepIndex ?? 0) + 1}/${steps.length}`}
        </span>
      </div>

      {/* Scène 3D */}
      <div
        ref={stageRef}
        className="relative h-[220px] cursor-grab active:cursor-grabbing sm:h-[260px]"
        style={{ perspective: "900px" }}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width - 0.5;
          const py = (e.clientY - r.top) / r.height - 0.5;
          setTilt({ x: 10 + py * 8, y: -16 + px * 14 });
        }}
        onMouseLeave={() => setTilt({ x: 12, y: -18 })}
      >
        {/* Grid floor */}
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "linear-gradient(rgba(139,92,246,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(139,92,246,0.15) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
            transform: `rotateX(60deg) translateY(40px) scale(1.4)`,
            transformOrigin: "center top",
          }}
        />

        <div
          className="absolute inset-0 flex items-center justify-center transition-transform duration-200 ease-out"
          style={{
            transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
            transformStyle: "preserve-3d",
          }}
        >
          <svg
            viewBox="0 0 100 70"
            className="h-full w-full max-w-lg drop-shadow-2xl"
            style={{ transform: "translateZ(20px)" }}
          >
            <defs>
              <linearGradient id={`pipe-${uid}`} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
                <stop offset="50%" stopColor="#a78bfa" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#34d399" stopOpacity="0.5" />
              </linearGradient>
              <filter id={`glow-${uid}`}>
                <feGaussianBlur stdDeviation="1.2" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <radialGradient id={`orb-${uid}`}>
                <stop offset="0%" stopColor="#c4b5fd" />
                <stop offset="70%" stopColor="#7c3aed" />
                <stop offset="100%" stopColor="#312e81" />
              </radialGradient>
            </defs>

            {/* Shadow path */}
            <path
              d={pathD}
              fill="none"
              stroke="rgba(0,0,0,0.35)"
              strokeWidth="3.5"
              strokeLinecap="round"
              transform="translate(0.8 1.2)"
            />
            {/* Base pipe */}
            <path
              d={pathD}
              fill="none"
              stroke={`url(#pipe-${uid})`}
              strokeWidth="2.8"
              strokeLinecap="round"
            />
            {/* Animated flow */}
            <path
              ref={flowRef}
              d={pathD}
              fill="none"
              stroke="#e0e7ff"
              strokeWidth="1.4"
              strokeLinecap="round"
              filter={`url(#glow-${uid})`}
              opacity="0.85"
            />

            {/* Start pad */}
            <g transform="translate(4 42)">
              <ellipse cx="0" cy="4" rx="5" ry="2" fill="rgba(0,0,0,0.35)" />
              <circle r="4.2" fill="#4f46e5" stroke="#a5b4fc" strokeWidth="0.6" />
              <Play
                x={-1.5}
                y={-1.5}
                width={3}
                height={3}
                className="text-white"
                fill="white"
              />
            </g>

            {nodes.map((nd) => {
              const done = nd.status === "done";
              const active = nd.status === "active";
              const rejected = nd.status === "rejected";
              const isSel = selected === nd.stepIndex;
              const fill = done
                ? "#059669"
                : rejected
                  ? "#e11d48"
                  : active
                    ? "#7c3aed"
                    : "#334155";
              const stroke = done
                ? "#6ee7b7"
                : rejected
                  ? "#fda4af"
                  : active
                    ? "#c4b5fd"
                    : "#64748b";
              return (
                <g
                  key={nd.stepIndex}
                  transform={`translate(${nd.x} ${nd.y})`}
                  className="cursor-pointer"
                  onClick={() =>
                    setSelected((p) =>
                      p === nd.stepIndex ? null : nd.stepIndex,
                    )
                  }
                >
                  <ellipse cx="0" cy="5" rx="6" ry="2.2" fill="rgba(0,0,0,0.4)" />
                  {active ? (
                    <circle
                      r="7.5"
                      fill="none"
                      stroke="#a78bfa"
                      strokeWidth="0.5"
                      opacity="0.7"
                    >
                      <animate
                        attributeName="r"
                        values="6;9;6"
                        dur="2s"
                        repeatCount="indefinite"
                      />
                      <animate
                        attributeName="opacity"
                        values="0.8;0.15;0.8"
                        dur="2s"
                        repeatCount="indefinite"
                      />
                    </circle>
                  ) : null}
                  <circle
                    r={isSel ? 5.8 : 5}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={isSel ? 1.2 : 0.7}
                    filter={active ? `url(#glow-${uid})` : undefined}
                  />
                  <text
                    textAnchor="middle"
                    y="1.2"
                    fontSize="3.2"
                    fontWeight="700"
                    fill="white"
                  >
                    {nd.stepIndex + 1}
                  </text>
                  <text
                    textAnchor="middle"
                    y="11"
                    fontSize="2.6"
                    fill="#cbd5e1"
                    className="pointer-events-none"
                  >
                    {(nd.assigneeName || "?").slice(0, 12)}
                  </text>
                </g>
              );
            })}

            {isFullyTreated ? (
              <g transform={`translate(${Math.min(96, (nodes[nodes.length - 1]?.x ?? 90) + 8)} ${(nodes[nodes.length - 1]?.y ?? 40)})`}>
                <circle r="4.5" fill="#059669" stroke="#6ee7b7" strokeWidth="0.8" />
                <text textAnchor="middle" y="1.2" fontSize="3" fill="white" fontWeight="700">
                  ✓
                </text>
              </g>
            ) : null}
          </svg>
        </div>

        <p className="pointer-events-none absolute bottom-2 left-0 right-0 text-center text-[10px] text-slate-500">
          Faites glisser la souris pour pivoter · cliquez une étape
        </p>
      </div>

      {/* Détail */}
      {sel ? (
        <div className="border-t border-white/10 bg-black/25 px-4 py-3 text-sm backdrop-blur-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-white">
                Étape {sel.stepIndex + 1}
                <ChevronRight className="mx-0.5 inline size-3.5 opacity-50" />
                {sel.assigneeName}
              </p>
              {sel.assigneeDepartmentName ? (
                <p className="text-xs text-slate-400">{sel.assigneeDepartmentName}</p>
              ) : null}
            </div>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-medium",
                sel.status === "done" && "bg-emerald-500/20 text-emerald-300",
                sel.status === "active" && "bg-violet-500/25 text-violet-200",
                sel.status === "waiting" && "bg-slate-500/20 text-slate-400",
                sel.status === "rejected" && "bg-rose-500/20 text-rose-300",
              )}
            >
              {sel.statusLabel ??
                (sel.status === "done"
                  ? "Traité"
                  : sel.status === "active"
                    ? "Ici maintenant"
                    : sel.status === "rejected"
                      ? "Refusé"
                      : "À venir")}
            </span>
          </div>
          {sel.taskLabel ? (
            <p className="mt-1.5 text-xs text-slate-400">
              Tâche : <span className="text-slate-200">{sel.taskLabel}</span>
            </p>
          ) : null}
          {sel.note ? (
            <p className="mt-1 text-xs italic text-slate-500">Note : {sel.note}</p>
          ) : null}
          {sel.status === "active" ? (
            <p className="mt-2 text-xs text-violet-300">
              Le dossier est physiquement / numériquement chez cette personne. Les
              nœuds suivants restent en attente jusqu’à validation de l’étape.
            </p>
          ) : sel.status === "waiting" ? (
            <p className="mt-2 text-xs text-slate-500">
              Pas encore commencé — le fichier doit d’abord passer par les
              intervenants précédents du circuit.
            </p>
          ) : sel.status === "done" ? (
            <p className="mt-2 text-xs text-emerald-400/90">
              Étape validée
              {sel.actedAt
                ? ` le ${new Date(sel.actedAt).toLocaleString("fr-FR")}`
                : ""}
              .
            </p>
          ) : null}
        </div>
      ) : (
        <p className="border-t border-white/10 px-4 py-2 text-center text-[11px] text-slate-500">
          Cliquez un nœud pour le détail du chemin restant.
        </p>
      )}
    </div>
  );
}
