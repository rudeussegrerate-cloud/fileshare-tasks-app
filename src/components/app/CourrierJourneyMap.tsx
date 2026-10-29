import { cn } from "@/lib/utils";
import { Building2, Check, MapPin, User } from "lucide-react";

export type JourneyNode = {
  id: string;
  title: string;
  subtitle?: string | null;
  service?: string | null;
  status: "done" | "current" | "pending";
  kind: "start" | "person" | "close";
};

/**
 * Diagramme de parcours du courrier (personne / service → suivant).
 * Style carte : nœuds reliés, position actuelle mise en avant.
 */
export function CourrierJourneyMap({
  nodes,
  className,
}: {
  nodes: JourneyNode[];
  className?: string;
}) {
  if (!nodes.length) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Aucun parcours enregistré pour le moment.
      </p>
    );
  }

  return (
    <div
      className={cn(
        "relative overflow-x-auto rounded-xl border border-border bg-[radial-gradient(#e8e8f1_1px,transparent_1px)] bg-[size:16px_16px] p-6",
        className,
      )}
    >
      <div className="flex min-w-max flex-col items-stretch gap-0 py-2 md:flex-row md:items-center md:justify-center md:gap-0">
        {nodes.map((node, i) => (
          <div
            key={node.id}
            className="flex flex-col items-center md:flex-row md:items-center"
          >
            <div
              className={cn(
                "relative z-[1] flex w-[9.5rem] flex-col items-center gap-2 rounded-2xl border-2 bg-card px-3 py-3 text-center shadow-sm transition",
                node.status === "current" &&
                  "border-brand bg-brand-soft/40 shadow-md ring-2 ring-brand/30",
                node.status === "done" && "border-emerald-200 bg-emerald-50/50",
                node.status === "pending" && "border-dashed border-border opacity-70",
              )}
            >
              <div
                className={cn(
                  "flex size-10 items-center justify-center rounded-full",
                  node.status === "current" && "bg-brand text-white",
                  node.status === "done" && "bg-emerald-600 text-white",
                  node.status === "pending" && "bg-muted text-muted-foreground",
                )}
              >
                {node.status === "done" ? (
                  <Check className="size-5" />
                ) : node.status === "current" ? (
                  <MapPin className="size-5" />
                ) : node.kind === "start" ? (
                  <User className="size-5" />
                ) : (
                  <Building2 className="size-5" />
                )}
              </div>
              <p className="line-clamp-2 text-xs font-semibold leading-tight text-foreground">
                {node.title}
              </p>
              {node.service ? (
                <p className="line-clamp-2 text-[10px] leading-tight text-muted-foreground">
                  {node.service}
                </p>
              ) : null}
              {node.subtitle ? (
                <p className="text-[10px] font-medium text-muted-foreground">
                  {node.subtitle}
                </p>
              ) : null}
              {node.status === "current" ? (
                <span className="rounded-full bg-brand px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                  Ici maintenant
                </span>
              ) : null}
            </div>
            {i < nodes.length - 1 ? (
              <>
                {/* Connecteur vertical mobile */}
                <div
                  className={cn(
                    "h-8 w-0.5 md:hidden",
                    nodes[i + 1]?.status === "pending"
                      ? "bg-border"
                      : "bg-brand/50",
                  )}
                  aria-hidden
                />
                {/* Connecteur horizontal desktop */}
                <div
                  className={cn(
                    "mx-1 hidden h-0.5 w-10 shrink-0 md:block",
                    nodes[i + 1]?.status === "pending"
                      ? "bg-border"
                      : "bg-brand/50",
                  )}
                  aria-hidden
                />
              </>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Construit les nœuds à partir du suivi mailTracking.getTracking */
export function buildJourneyNodes(tracking: {
  senderName: string;
  isClosed: boolean;
  closed?: { byName: string | null } | null;
  steps: Array<{
    stepIndex: number;
    assigneeName: string;
    assigneeFonction?: string | null;
    service?: string | null;
    status: string;
    completedAt?: number | null;
  }>;
  currentHolder?: { name: string | null } | null;
}): JourneyNode[] {
  const nodes: JourneyNode[] = [
    {
      id: "start",
      title: tracking.senderName || "Expéditeur",
      subtitle: "Envoi",
      service: null,
      status: "done",
      kind: "start",
    },
  ];

  const steps = [...(tracking.steps ?? [])].sort(
    (a, b) => a.stepIndex - b.stepIndex,
  );

  if (steps.length === 0 && tracking.currentHolder?.name) {
    nodes.push({
      id: "holder",
      title: tracking.currentHolder.name,
      subtitle: tracking.isClosed ? "Classé" : "En cours",
      status: tracking.isClosed ? "done" : "current",
      kind: "person",
    });
  } else {
    for (const s of steps) {
      const isCurrent = s.status === "active" || s.status === "waiting";
      const isDone = s.status === "done" || s.status === "rejected";
      nodes.push({
        id: `step-${s.stepIndex}`,
        title: s.assigneeName,
        subtitle: isDone
          ? "Part traitée"
          : isCurrent
            ? "En charge"
            : "En attente",
        service: s.service || s.assigneeFonction || null,
        status: isDone ? "done" : isCurrent ? "current" : "pending",
        kind: "person",
      });
    }
  }

  if (tracking.isClosed) {
    // dernière pastille classement
    const last = nodes[nodes.length - 1];
    if (last) {
      last.status = "done";
      last.subtitle = "Classé";
    }
    if (tracking.closed?.byName) {
      nodes.push({
        id: "closed",
        title: tracking.closed.byName,
        subtitle: "Classement définitif",
        status: "done",
        kind: "close",
      });
    }
  }

  // Un seul "current"
  const currents = nodes.filter((n) => n.status === "current");
  if (currents.length > 1) {
    currents.slice(0, -1).forEach((n) => {
      n.status = "done";
    });
  }
  if (!tracking.isClosed && !nodes.some((n) => n.status === "current")) {
    const lastPerson = [...nodes].reverse().find((n) => n.kind === "person");
    if (lastPerson) lastPerson.status = "current";
  }

  return nodes;
}
