import { cn } from "@/lib/utils";
import { Building2, Check, MapPin, Send, User } from "lucide-react";

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
 * « Part traitée » uniquement si l'étape est status === done.
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
        "relative min-h-[280px] overflow-x-auto rounded-xl border border-border bg-[radial-gradient(#e8e8f1_1px,transparent_1px)] bg-[size:18px_18px] p-8 sm:min-h-[320px] sm:p-10",
        className,
      )}
    >
      <div className="flex min-w-max flex-col items-stretch gap-0 py-4 md:flex-row md:items-center md:justify-center">
        {nodes.map((node, i) => (
          <div
            key={node.id}
            className="flex flex-col items-center md:flex-row md:items-center"
          >
            <div
              className={cn(
                "relative z-[1] flex w-[11.5rem] flex-col items-center gap-2.5 rounded-2xl border-2 bg-card px-4 py-4 text-center shadow-sm transition sm:w-[13rem] sm:py-5",
                node.status === "current" &&
                  "border-brand bg-brand-soft/50 shadow-md ring-2 ring-brand/35",
                node.status === "done" && "border-emerald-300 bg-emerald-50/60",
                node.status === "pending" &&
                  "border-dashed border-border/80 bg-muted/20 opacity-80",
              )}
            >
              <div
                className={cn(
                  "flex size-12 items-center justify-center rounded-full sm:size-14",
                  node.status === "current" && "bg-brand text-white",
                  node.status === "done" && "bg-emerald-600 text-white",
                  node.status === "pending" && "bg-muted text-muted-foreground",
                )}
              >
                {node.status === "done" ? (
                  <Check className="size-6" />
                ) : node.status === "current" ? (
                  <MapPin className="size-6" />
                ) : node.kind === "start" ? (
                  <Send className="size-6" />
                ) : node.kind === "close" ? (
                  <Check className="size-6" />
                ) : (
                  <User className="size-6" />
                )}
              </div>
              <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
                {node.title}
              </p>
              {node.service ? (
                <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">
                  {node.service}
                </p>
              ) : null}
              {node.subtitle ? (
                <p
                  className={cn(
                    "text-[11px] font-semibold",
                    node.status === "current" && "text-brand",
                    node.status === "done" && "text-emerald-700",
                    node.status === "pending" && "text-muted-foreground",
                  )}
                >
                  {node.subtitle}
                </p>
              ) : null}
              {node.status === "current" ? (
                <span className="rounded-full bg-brand px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                  Ici maintenant
                </span>
              ) : null}
            </div>
            {i < nodes.length - 1 ? (
              <>
                <div
                  className={cn(
                    "h-10 w-1 rounded-full md:hidden",
                    nodes[i + 1]?.status === "pending"
                      ? "bg-border"
                      : "bg-brand/45",
                  )}
                  aria-hidden
                />
                <div
                  className={cn(
                    "mx-2 hidden h-1 w-14 shrink-0 rounded-full md:block",
                    nodes[i + 1]?.status === "pending"
                      ? "bg-border"
                      : "bg-brand/45",
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
      subtitle: "A envoyé",
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
      subtitle: tracking.isClosed ? "Classé" : "Chez cette personne",
      status: tracking.isClosed ? "done" : "current",
      kind: "person",
    });
  } else {
    for (const s of steps) {
      // Strict : « part traitée » seulement si done (pas waiting / active)
      const isDone = s.status === "done" || s.status === "rejected";
      const isCurrent = s.status === "active";
      const isPending = s.status === "waiting" || (!isDone && !isCurrent);

      let subtitle = "En attente";
      if (isDone) subtitle = "Part traitée";
      else if (isCurrent) subtitle = "Chez cette personne";

      nodes.push({
        id: `step-${s.stepIndex}`,
        title: s.assigneeName,
        subtitle,
        service: s.service || s.assigneeFonction || null,
        status: isDone ? "done" : isCurrent ? "current" : "pending",
        kind: "person",
      });
    }
  }

  if (tracking.isClosed) {
    for (const n of nodes) {
      if (n.kind === "person" && n.status === "current") {
        n.status = "done";
        n.subtitle = "Part traitée";
      }
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
  } else {
    // Exactement un nœud "current" : la première étape active
    const activeIdx = nodes.findIndex(
      (n) => n.kind === "person" && n.status === "current",
    );
    if (activeIdx < 0) {
      const firstPending = nodes.find(
        (n) => n.kind === "person" && n.status === "pending",
      );
      if (firstPending) {
        firstPending.status = "current";
        firstPending.subtitle = "Chez cette personne";
      }
    } else {
      // ne pas transformer les autres en "done"
      nodes.forEach((n, i) => {
        if (n.kind === "person" && i !== activeIdx && n.status === "current") {
          n.status = "pending";
          n.subtitle = "En attente";
        }
      });
    }
  }

  return nodes;
}
