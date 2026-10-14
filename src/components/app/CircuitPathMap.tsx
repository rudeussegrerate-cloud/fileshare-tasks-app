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
        "overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-[#f7f3ec] via-[#f0e8dc] to-[#e8dfd2] text-foreground shadow-md",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/80 px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span className="flex size-7 items-center justify-center rounded-lg bg-brand-soft text-brand ring-1 ring-brand/25">
            <MapPin className="size-3.5" />
          </span>
          Parcours 3D du dossier
          {publicRef ? (
            <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-brand-sky">
              {publicRef}
            </span>
          ) : null}
        </div>
        <span className="text-[11px] text-muted-foreground">
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
              "linear-gradient(rgba(74,52,41,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(74,52,41,0.08) 1px, transparent 1px)",
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
                <stop offset="0%" stopColor="#7a6554" stopOpacity="0.3" />
                <stop offset="50%" stopColor="#4a3429" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#5a8f6a" stopOpacity="0.5" />
              </linearGradient>
              <filter id={`glow-${uid}`}>
                <feGaussianBlur stdDeviation="1.2" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <radialGradient id={`orb-${uid}`}>
                <stop offset="0%" stopColor="#a89080" />
                <stop offset="70%" stopColor="#4a3429" />
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
              stroke="#c26a4a"
              strokeWidth="1.4"
              strokeLinecap="round"
              filter={`url(#glow-${uid})`}
              opacity="0.85"
            />

            {/* Start pad */}
            <g transform="translate(4 42)">
              <ellipse cx="0" cy="4" rx="5" ry="2" fill="rgba(0,0,0,0.35)" />
              <circle r="4.2" fill="#4a3429" stroke="#c4b5a0" strokeWidth="0.6" />
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
                ? "#3d7a4a"
                : rejected
                  ? "#b54a4a"
                  : active
                    ? "#4a3429"
                    : "#8a7a6a";
              const stroke = done
                ? "#8fbc9a"
                : rejected
                  ? "#e8a0a0"
                  : active
                    ? "#a89080"
                    : "#9a8b7a";
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
                      stroke="#4a3429"
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
                    fill="#5c4e42"
                    className="pointer-events-none"
                  >
                    {(nd.assigneeName || "?").slice(0, 12)}
                  </text>
                </g>
              );
            })}

            {isFullyTreated ? (
              <g transform={`translate(${Math.min(96, (nodes[nodes.length - 1]?.x ?? 90) + 8)} ${(nodes[nodes.length - 1]?.y ?? 40)})`}>
                <circle r="4.5" fill="#3d7a4a" stroke="#8fbc9a" strokeWidth="0.8" />
                <text textAnchor="middle" y="1.2" fontSize="3" fill="white" fontWeight="700">
                  ✓
                </text>
              </g>
            ) : null}
          </svg>
        </div>

        <p className="pointer-events-none absolute bottom-2 left-0 right-0 text-center text-[10px] text-muted-foreground">
          Faites glisser la souris pour pivoter · cliquez une étape
        </p>
      </div>

      {/* Détail */}
      {sel ? (
        <div className="border-t border-border bg-card/90 px-4 py-3 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-foreground">
                Étape {sel.stepIndex + 1}
                <ChevronRight className="mx-0.5 inline size-3.5 opacity-50" />
                {sel.assigneeName}
              </p>
              {sel.assigneeDepartmentName ? (
                <p className="text-xs text-muted-foreground">{sel.assigneeDepartmentName}</p>
              ) : null}
            </div>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-medium",
                sel.status === "done" && "bg-emerald-100 text-emerald-800",
                sel.status === "active" && "bg-brand-soft text-brand",
                sel.status === "waiting" && "bg-slate-500/20 text-muted-foreground",
                sel.status === "rejected" && "bg-red-100 text-red-800",
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
            <p className="mt-1.5 text-xs text-muted-foreground">
              Tâche : <span className="text-foreground">{sel.taskLabel}</span>
            </p>
          ) : null}
          {sel.note ? (
            <p className="mt-1 text-xs italic text-muted-foreground">Note : {sel.note}</p>
          ) : null}
          {sel.status === "active" ? (
            <p className="mt-2 text-xs text-brand">
              Le dossier est physiquement / numériquement chez cette personne. Les
              nœuds suivants restent en attente jusqu’à validation de l’étape.
            </p>
          ) : sel.status === "waiting" ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Pas encore commencé — le fichier doit d’abord passer par les
              intervenants précédents du circuit.
            </p>
          ) : sel.status === "done" ? (
            <p className="mt-2 text-xs text-emerald-700">
              Étape validée
              {sel.actedAt
                ? ` le ${new Date(sel.actedAt).toLocaleString("fr-FR")}`
                : ""}
              .
            </p>
          ) : null}
        </div>
      ) : (
        <p className="border-t border-white/10 px-4 py-2 text-center text-[11px] text-muted-foreground">
          Cliquez un nœud pour le détail du chemin restant.
        </p>
      )}
    </div>
  );
}
