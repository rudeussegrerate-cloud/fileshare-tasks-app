import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Eye,
  Forward,
  Inbox,
  Loader2,
  Send,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "./shared";

const STATUS_LABEL: Record<string, string> = {
  brouillon: "Brouillon",
  envoye: "Envoyé",
  recu: "Reçu",
  lu: "Lu",
  traite: "Traité",
  retourne: "Retourné",
  transmis: "Transmis plus loin",
};

const MODE_LABEL: Record<string, string> = {
  hierarchique: "Voie hiérarchique",
  direct: "Envoi direct",
  ampliation: "Ampliation",
};

type Tab = "inbox" | "sent";

export function TransmissionsView() {
  const [tab, setTab] = useState<Tab>("inbox");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [actingId, setActingId] = useState<Id<"transmissions"> | null>(null);
  const [note, setNote] = useState("");
  const [forwardEntity, setForwardEntity] = useState("");

  const inbox = useQuery(
    api.transmissions.inbox,
    statusFilter === "all" ? {} : { status: statusFilter as "envoye" },
  );
  const sent = useQuery(api.transmissions.sent, {});
  const tree = useQuery(api.entities.listTree, {});
  const setStatus = useMutation(api.transmissions.setStatus);
  const forward = useMutation(api.transmissions.forward);

  const rows = (tab === "inbox" ? inbox : sent) as
    | Array<Record<string, any>>
    | undefined;

  async function handleStatus(
    id: Id<"transmissions">,
    status: "recu" | "lu" | "traite" | "retourne",
  ) {
    setActingId(id);
    try {
      await setStatus({
        transmissionId: id,
        status,
        note: note.trim() || undefined,
      });
      toast.success(`Statut : ${STATUS_LABEL[status]}`);
      setNote("");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Action impossible");
    } finally {
      setActingId(null);
    }
  }

  async function handleForward(id: Id<"transmissions">) {
    if (!forwardEntity) {
      toast.error("Choisissez l'entité destinataire");
      return;
    }
    setActingId(id);
    try {
      await forward({
        transmissionId: id,
        toEntityId: forwardEntity as Id<"departments">,
        routingMode: "direct",
        comment: note.trim() || undefined,
      });
      toast.success("Document transmis plus loin");
      setNote("");
      setForwardEntity("");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Transmission impossible");
    } finally {
      setActingId(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Transmissions entre entités
        </h1>
        <p className="text-sm text-muted-foreground">
          Envois administratifs d&apos;une direction ou d&apos;un service vers un
          autre. Accusé de réception, traitement et ampliation.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={tab === "inbox" ? "default" : "outline"}
          onClick={() => setTab("inbox")}
        >
          <Inbox className="mr-1.5 size-4" />
          Réception
        </Button>
        <Button
          type="button"
          size="sm"
          variant={tab === "sent" ? "default" : "outline"}
          onClick={() => setTab("sent")}
        >
          <Send className="mr-1.5 size-4" />
          Émises
        </Button>
        {tab === "inbox" && (
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-[160px]">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="envoye">Envoyé</SelectItem>
              <SelectItem value="recu">Reçu</SelectItem>
              <SelectItem value="lu">Lu</SelectItem>
              <SelectItem value="traite">Traité</SelectItem>
              <SelectItem value="retourne">Retourné</SelectItem>
              <SelectItem value="transmis">Transmis</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {rows === undefined ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Aucune transmission"
          description={
            tab === "inbox"
              ? "Les documents adressés à votre entité apparaîtront ici."
              : "Les envois émis par votre entité apparaîtront ici."
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r._id}>
              <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
                  <div className="min-w-0 space-y-1">
                    <CardTitle className="text-base leading-snug">
                      {r.objet}
                    </CardTitle>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <Building2 className="size-3.5" />
                      <span className="font-medium text-foreground">
                        {r.fromEntityName}
                      </span>
                      <ArrowRight className="size-3.5" />
                      <span className="font-medium text-foreground">
                        {r.toEntityName}
                      </span>
                      {r.publicRef && (
                        <Badge
                          variant="secondary"
                          className="font-mono text-[10px]"
                        >
                          {r.publicRef}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge variant={r.isAmpliation ? "outline" : "default"}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">
                      {MODE_LABEL[r.routingMode] ?? r.routingMode}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <p className="text-xs text-muted-foreground">
                    {r.fileName}
                    {r.taskLabel ? ` · ${r.taskLabel}` : ""}
                    {r.fromUserName ? ` · par ${r.fromUserName}` : ""}
                    {" · "}
                    {new Date(r.createdAt).toLocaleString("fr-FR")}
                  </p>
                  {r.comment && (
                    <p className="rounded-md bg-muted/60 px-3 py-2 text-sm">
                      {r.comment}
                    </p>
                  )}
                  {tab === "inbox" &&
                    r.status !== "traite" &&
                    r.status !== "transmis" && (
                      <div className="space-y-2 rounded-lg border border-border/60 p-3">
                        <Textarea
                          placeholder="Note optionnelle…"
                          value={actingId === r._id ? note : ""}
                          onChange={(e) => {
                            setActingId(r._id);
                            setNote(e.target.value);
                          }}
                          rows={2}
                          className="text-sm"
                        />
                        <div className="flex flex-wrap gap-2">
                          {r.status === "envoye" && (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={actingId === r._id}
                              onClick={() => handleStatus(r._id, "recu")}
                            >
                              <CheckCircle2 className="mr-1 size-3.5" />
                              Accuser réception
                            </Button>
                          )}
                          {(r.status === "envoye" || r.status === "recu") && (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={actingId === r._id}
                              onClick={() => handleStatus(r._id, "lu")}
                            >
                              <Eye className="mr-1 size-3.5" />
                              Marquer lu
                            </Button>
                          )}
                          {!r.isAmpliation && (
                            <Button
                              size="sm"
                              disabled={actingId === r._id}
                              onClick={() => handleStatus(r._id, "traite")}
                            >
                              Traité
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={actingId === r._id}
                            onClick={() => handleStatus(r._id, "retourne")}
                          >
                            Retourner
                          </Button>
                        </div>
                        {!r.isAmpliation && (
                          <div className="flex flex-wrap items-end gap-2 border-t border-border/50 pt-2">
                            <div className="min-w-[200px] flex-1">
                              <Select
                                value={actingId === r._id ? forwardEntity : ""}
                                onValueChange={(v) => {
                                  setActingId(r._id);
                                  setForwardEntity(v);
                                }}
                              >
                                <SelectTrigger className="h-9">
                                  <SelectValue placeholder="Transmettre vers…" />
                                </SelectTrigger>
                                <SelectContent>
                                  {((tree ?? []) as Array<{ _id: string; name: string; code?: string | null }>).map((e) => (
                                    <SelectItem key={e._id} value={e._id}>
                                      {e.code ? `${e.code} — ` : ""}
                                      {e.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={actingId === r._id}
                              onClick={() => handleForward(r._id)}
                            >
                              <Forward className="mr-1 size-3.5" />
                              Transmettre
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
