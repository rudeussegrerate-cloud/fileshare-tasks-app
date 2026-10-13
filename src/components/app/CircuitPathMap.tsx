import { cn } from "@/lib/utils";
import { Check, MapPin, Play, Clock, X } from "lucide-react";
import { useState } from "react";

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
 * Carte animée du parcours documentaire (style parcours / map).
 * Cliquable : détail de l'étape.
 */
export function CircuitPathMap({
  steps,
  currentStepIndex = 0,
  publicRef,
  isFullyTreated,
  className,
}: Props) {
  const [selected, setSelected] = useState<number | null>(
    isFullyTreated ? steps.length - 1 : currentStepIndex,
  );

  if (!steps.length) return null;

  const sel = selected != null ? steps.find((s) => s.stepIndex === selected) : null;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-violet-200/80 bg-gradient-to-b from-violet-50/80 to-white dark:from-violet-950/30 dark:to-background",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-violet-100 px-3 py-2 dark:border-violet-900/40">
        <div className="flex items-center gap-2 text-sm font-semibold text-violet-900 dark:text-violet-100">
          <MapPin className="size-4 text-violet-600" />
          Parcours du dossier
          {publicRef ? (
            <span className="font-mono text-[11px] font-normal text-violet-600/80">
              {publicRef}
            </span>
          ) : null}
        </div>
        <span className="text-[11px] text-muted-foreground">
          {isFullyTreated
            ? "Traité"
            : `Étape ${(currentStepIndex ?? 0) + 1}/${steps.length}`}
        </span>
      </div>

      {/* Map path */}
      <div className="relative px-3 py-5">
        {/* dotted background */}
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(139,92,246,0.25) 1px, transparent 1px)",
            backgroundSize: "16px 16px",
          }}
        />

        <div className="relative flex flex-wrap items-center justify-center gap-x-1 gap-y-6 sm:flex-nowrap sm:justify-start sm:overflow-x-auto sm:pb-2">
          {/* Start node */}
          <div className="flex shrink-0 flex-col items-center gap-1">
            <div className="flex size-11 items-center justify-center rounded-xl bg-violet-500 text-white shadow-md shadow-violet-300/50">
              <Play className="size-4 fill-current" />
            </div>
            <span className="max-w-[4.5rem] truncate text-center text-[10px] text-muted-foreground">
              Émission
            </span>
          </div>

          {steps.map((s, i) => {
            const done = s.status === "done";
            const active = s.status === "active";
            const rejected = s.status === "rejected";
            const waiting = s.status === "waiting";
            const isSel = selected === s.stepIndex;

            return (
              <div key={s.stepIndex} className="flex shrink-0 items-center gap-1">
                {/* connector */}
                <div className="relative mx-0.5 h-1.5 w-6 sm:w-10">
                  <div
                    className={cn(
                      "absolute inset-0 rounded-full",
                      done || active
                        ? "bg-violet-400"
                        : "bg-violet-100 dark:bg-violet-900/50",
                    )}
                  />
                  {(done || active) && (
                    <div
                      className={cn(
                        "absolute inset-y-0 left-0 rounded-full bg-violet-600",
                        active ? "circuit-pulse w-1/2" : "w-full",
                      )}
                    />
                  )}
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setSelected((prev) =>
                      prev === s.stepIndex ? null : s.stepIndex,
                    )
                  }
                  className={cn(
                    "group flex flex-col items-center gap-1 rounded-lg p-1 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                    isSel && "ring-2 ring-violet-400 ring-offset-2",
                  )}
                  title={`${s.assigneeName} — cliquer pour le détail`}
                >
                  <div
                    className={cn(
                      "relative flex size-12 items-center justify-center rounded-2xl border-2 shadow-md transition",
                      done &&
                        "border-emerald-300 bg-emerald-500 text-white shadow-emerald-200/60",
                      active &&
                        "circuit-node-active border-violet-400 bg-violet-500 text-white shadow-violet-300/70",
                      waiting &&
                        "border-violet-100 bg-white text-violet-300 dark:bg-violet-950/40",
                      rejected &&
                        "border-rose-300 bg-rose-500 text-white",
                    )}
                  >
                    {done ? (
                      <Check className="size-5" strokeWidth={2.5} />
                    ) : rejected ? (
                      <X className="size-5" />
                    ) : active ? (
                      <MapPin className="size-5" />
                    ) : (
                      <Clock className="size-4 opacity-70" />
                    )}
                    <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-white text-[9px] font-bold text-violet-700 shadow">
                      {s.stepIndex + 1}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "max-w-[5.5rem] truncate text-center text-[10px] font-medium",
                      active
                        ? "text-violet-700 dark:text-violet-300"
                        : "text-muted-foreground",
                    )}
                  >
                    {s.assigneeName}
                  </span>
                  {s.assigneeDepartmentName ? (
                    <span className="max-w-[5.5rem] truncate text-center text-[9px] text-muted-foreground/80">
                      {s.assigneeDepartmentName}
                    </span>
                  ) : null}
                </button>

                {/* end check after last if fully treated */}
                {i === steps.length - 1 && isFullyTreated ? (
                  <>
                    <div className="mx-0.5 h-1.5 w-6 rounded-full bg-emerald-400 sm:w-10" />
                    <div className="flex flex-col items-center gap-1">
                      <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-md">
                        <Check className="size-5" />
                      </div>
                      <span className="text-[10px] text-emerald-700">Clos</span>
                    </div>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail panel */}
      {sel ? (
        <div className="border-t border-violet-100 bg-white/90 px-3 py-3 text-sm dark:border-violet-900/40 dark:bg-background/80">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-foreground">
                Étape {sel.stepIndex + 1} — {sel.assigneeName}
              </p>
              {sel.assigneeDepartmentName ? (
                <p className="text-xs text-muted-foreground">
                  {sel.assigneeDepartmentName}
                </p>
              ) : null}
            </div>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-medium",
                sel.status === "done" &&
                  "bg-emerald-100 text-emerald-800",
                sel.status === "active" &&
                  "bg-violet-100 text-violet-800",
                sel.status === "waiting" &&
                  "bg-muted text-muted-foreground",
                sel.status === "rejected" &&
                  "bg-rose-100 text-rose-800",
              )}
            >
              {sel.statusLabel ??
                (sel.status === "done"
                  ? "Traité"
                  : sel.status === "active"
                    ? "En cours ici"
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
            <p className="mt-1 text-xs italic text-muted-foreground">
              Note : {sel.note}
            </p>
          ) : null}
          {sel.status === "active" ? (
            <p className="mt-2 text-xs text-violet-700 dark:text-violet-300">
              Le dossier se trouve actuellement chez cette personne. Les étapes
              suivantes restent grisées jusqu’à validation.
            </p>
          ) : sel.status === "waiting" ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Cette étape n’a pas encore commencé — le fichier doit d’abord
              passer par les intervenants précédents.
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
        <p className="border-t border-violet-100 px-3 py-2 text-center text-[11px] text-muted-foreground dark:border-violet-900/40">
          Cliquez une étape pour voir le détail du parcours restant.
        </p>
      )}
    </div>
  );
}
