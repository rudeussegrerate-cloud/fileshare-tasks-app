import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  Archive,
  FileSearch,
  Loader2,
  RotateCcw,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { MndptLoader } from "@/components/MndptLoader";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  StatusBadge,
  formatDateTime,
  structureRecipient,
  structureSender,
} from "./shared";

type Scope = "all" | "sent" | "received" | "archived";

const SCOPES: Array<{ id: Scope; label: string }> = [
  { id: "all", label: "Actifs" },
  { id: "sent", label: "Envoyés" },
  { id: "received", label: "Reçus" },
  { id: "archived", label: "Archivés" },
];

export function FileManagerView({
  onOpen,
  onSend,
}: {
  onOpen: (id: Id<"documents">) => void;
  onSend: () => void;
}) {
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<Id<"documents"> | null>(null);

  const debounced = useMemo(() => search.trim(), [search]);
  const rows = useQuery(api.documents.fileManager, {
    search: debounced.length > 0 ? debounced : undefined,
    scope,
  });
  const archive = useMutation(api.documents.archive);
  const unarchive = useMutation(api.documents.unarchive);
  const remove = useMutation(api.documents.remove);
  const history = useQuery(
    api.documents.documentHistory,
    historyId ? { documentId: historyId } : "skip",
  );

  return (
    <div className="mx-auto max-w-4xl space-y-5" data-scandoc-tour="files-search">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <FileSearch className="size-5 text-brand" />
            Gestionnaire de fichiers
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Recherchez par <strong>identifiant REF-</strong>, objet ou fichier.
            Consultez l&apos;historique par structure (parcours organisationnel).
          </p>
        </div>
        <Button type="button" className="gap-1.5" onClick={onSend}>
          <Upload className="size-4" />
          Nouvel envoi
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Identifiant (ex. SD-2026-…), objet, fichier, personne…"
          className="pl-9 font-mono text-sm"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {SCOPES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setScope(s.id)}
            className={
              scope === s.id
                ? "rounded-full bg-brand px-3 py-1.5 text-xs font-medium text-primary-foreground"
                : "rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary"
            }
          >
            {s.label}
          </button>
        ))}
      </div>

      {rows === undefined ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
          Aucun document trouvé
          {debounced ? ` pour « ${debounced} »` : ""}.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((doc) => (
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
                    {doc.publicRef ?? "Sans identifiant"} · {doc.fileName}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {structureSender(doc)} → {structureRecipient(doc)}
                    {doc.hasCircuit ? " · circuit" : ""}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {formatDateTime(doc.updatedAt ?? doc.createdAt)}
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

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onOpen(doc._id as Id<"documents">)}
                >
                  Ouvrir
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setHistoryId(
                      historyId === doc._id
                        ? null
                        : (doc._id as Id<"documents">),
                    )
                  }
                >
                  Historique
                </Button>
                {doc.canArchive ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={busyId === doc._id}
                    onClick={async () => {
                      setBusyId(doc._id);
                      try {
                        await archive({
                          documentId: doc._id as Id<"documents">,
                        });
                        toast.success("Document archivé");
                      } catch (e) {
                        toast.error(
                          e instanceof Error ? e.message : "Archivage impossible",
                        );
                      } finally {
                        setBusyId(null);
                      }
                    }}
                  >
                    <Archive className="size-3.5" />
                    Archiver
                  </Button>
                ) : null}
                {doc.canUnarchive ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={busyId === doc._id}
                    onClick={async () => {
                      setBusyId(doc._id);
                      try {
                        await unarchive({
                          documentId: doc._id as Id<"documents">,
                        });
                        toast.success("Document restauré");
                      } catch (e) {
                        toast.error(
                          e instanceof Error ? e.message : "Restauration impossible",
                        );
                      } finally {
                        setBusyId(null);
                      }
                    }}
                  >
                    <RotateCcw className="size-3.5" />
                    Restaurer
                  </Button>
                ) : null}
                {doc.canDelete ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-red-700"
                    disabled={busyId === doc._id}
                    onClick={async () => {
                      if (
                        !confirm(
                          "Supprimer définitivement ce document ? Cette action est irréversible.",
                        )
                      )
                        return;
                      setBusyId(doc._id);
                      try {
                        await remove({
                          documentId: doc._id as Id<"documents">,
                        });
                        toast.success("Document supprimé");
                      } catch (e) {
                        toast.error(
                          e instanceof Error ? e.message : "Suppression impossible",
                        );
                      } finally {
                        setBusyId(null);
                      }
                    }}
                  >
                    <Trash2 className="size-3.5" />
                    Supprimer
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {historyId ? (
        <div className="fixed inset-x-0 bottom-0 z-40 max-h-[55vh] overflow-y-auto border-t border-border bg-card p-4 shadow-lg sm:inset-x-auto sm:bottom-4 sm:right-4 sm:max-w-md sm:rounded-lg sm:border">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">
              Historique organisationnel
            </h3>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setHistoryId(null)}
            >
              Fermer
            </Button>
          </div>
          {history === undefined ? (
            <MndptLoader size="inline" />
          ) : history === null ? (
            <p className="text-xs text-muted-foreground">
              Historique non accessible.
            </p>
          ) : (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium">{history.objet}</p>
                {history.publicRef ? (
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {history.publicRef}
                  </p>
                ) : null}
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Actuellement : {history.currentStructure} ·{" "}
                  {history.currentStatus}
                </p>
              </div>
              <ol className="space-y-2 border-l-2 border-brand/30 pl-3">
                {history.events.map((ev, i) => (
                  <li key={`${ev.at}-${i}`} className="relative text-xs">
                    <span className="absolute -left-[calc(0.75rem+5px)] top-1 size-2 rounded-full bg-brand" />
                    <p className="font-medium">{ev.structure}</p>
                    <p className="text-muted-foreground">
                      {ev.status}
                      {ev.note ? ` · ${ev.note}` : ""}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatDateTime(ev.at)}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
