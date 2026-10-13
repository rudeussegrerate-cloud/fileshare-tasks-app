import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock,
  Loader2,
  MapPin,
  Route,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { StatusBadge, formatDateTime } from "./shared";

type Category = "en_attente" | "en_cours" | "en_retard" | "termines";

const TABS: Array<{ id: Category; label: string }> = [
  { id: "en_attente", label: "En attente" },
  { id: "en_cours", label: "En cours" },
  { id: "en_retard", label: "En retard" },
  { id: "termines", label: "Terminés" },
];

export function CircuitTrackingView({
  onOpen,
  onContinue,
}: {
  onOpen: (id: Id<"documents">) => void;
  onContinue?: (publicRef: string) => void;
}) {
  const data = useQuery(api.documents.circuitTracking);
  const alertStep = useMutation(api.documents.alertActiveStep);
  const [tab, setTab] = useState<Category>("en_cours");
  const [busyId, setBusyId] = useState<string | null>(null);

  if (data === undefined) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (data === null) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        Impossible de charger le suivi.
      </p>
    );
  }

  const list = data[tab] ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Route className="size-5 text-brand" />
          Suivi de mes envois
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Dossiers classés par statut. Relancez la personne en charge si besoin.
          Pour transmettre dans un circuit, renvoyez le fichier avec le{" "}
          <strong>même identifiant</strong>.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const count = (data[t.id] ?? []).length;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={
                active
                  ? "rounded-full bg-brand px-3 py-1.5 text-xs font-medium text-primary-foreground"
                  : "rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary"
              }
            >
              {t.label}
              <span className="ml-1.5 tabular-nums opacity-80">{count}</span>
            </button>
          );
        })}
      </div>

      {list.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
          Aucun dossier dans cette catégorie.
        </p>
      ) : (
        <ul className="space-y-2">
          {list.map((doc) => (
            <li
              key={doc._id}
              className="rounded-xl border border-border bg-card p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => onOpen(doc._id as Id<"documents">)}
                >
                  <p className="font-medium text-foreground">
                    {doc.objet || doc.fileName}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                    {doc.publicRef ?? "Sans identifiant"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {doc.senderName} → {doc.recipientName}
                    {doc.hasCircuit
                      ? ` · étape ${doc.currentStepIndex + 1}/${doc.circuitTotalSteps || "?"}`
                      : ""}
                  </p>
                </button>
                <StatusBadge
                  status={
                    doc.status as
                      | "envoye"
                      | "consulte"
                      | "en_cours"
                      | "traite"
                  }
                />
              </div>

              {doc.status !== "traite" ? (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-900">
                  <MapPin className="size-3.5 shrink-0" />
                  {doc.isMyTurn
                    ? "C'est votre tour — traitez puis renvoyez avec le même identifiant"
                    : `Actuellement chez ${doc.activeAssigneeName}${
                        doc.activeDepartment
                          ? ` (${doc.activeDepartment})`
                          : ""
                      }`}
                </p>
              ) : (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-800">
                  <CheckCircle2 className="size-3.5" />
                  Circuit terminé
                </p>
              )}

              {doc.status !== "traite" && doc.dueAt != null ? (
                <p
                  className={
                    doc.isOverdue
                      ? "mt-1 flex items-center gap-1.5 text-xs font-medium text-red-700"
                      : doc.hoursLeft != null && doc.hoursLeft <= 12
                        ? "mt-1 flex items-center gap-1.5 text-xs font-medium text-amber-800"
                        : "mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"
                  }
                >
                  <Clock className="size-3.5 shrink-0" />
                  {doc.isOverdue
                    ? `En retard · échéance étape dépassée (${formatDateTime(doc.dueAt)})`
                    : doc.hoursLeft != null
                      ? `Échéance étape · ${formatDateTime(doc.dueAt)} · reste ~${doc.hoursLeft} h (SLA ${doc.stepDeadlineHours ?? 48} h)`
                      : `Échéance · ${formatDateTime(doc.dueAt)}`}
                </p>
              ) : null}

              <p className="mt-1 text-[11px] text-muted-foreground">
                Mis à jour · {formatDateTime(doc.updatedAt)}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onOpen(doc._id as Id<"documents">)}
                >
                  Ouvrir
                </Button>
                {doc.isMyTurn && doc.publicRef && onContinue ? (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => onContinue(doc.publicRef!)}
                  >
                    Transmettre (même id)
                  </Button>
                ) : null}
                {doc.canAlert ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={busyId === doc._id}
                    onClick={async () => {
                      setBusyId(doc._id);
                      try {
                        const res = await alertStep({
                          documentId: doc._id as Id<"documents">,
                        });
                        toast.success(`Alerte envoyée à ${res.to}`);
                      } catch (e) {
                        toast.error(
                          e instanceof Error ? e.message : "Alerte impossible",
                        );
                      } finally {
                        setBusyId(null);
                      }
                    }}
                  >
                    {busyId === doc._id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Bell className="size-3.5" />
                    )}
                    Alerter
                  </Button>
                ) : null}
                {doc.category === "en_retard" ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-700">
                    <AlertTriangle className="size-3.5" />
                    &gt; 48 h
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="flex items-start gap-2 text-[11px] text-muted-foreground">
        <Clock className="mt-0.5 size-3.5 shrink-0" />
        Un dossier en circuit avance quand l&apos;intervenant envoie le fichier
        avec le <em>même identifiant</em> vers l&apos;étape suivante. Des
        alertes automatiques sont envoyées ~12 h avant l&apos;échéance et en
        cas de retard (intervenant + émetteur).
      </p>
    </div>
  );
}
