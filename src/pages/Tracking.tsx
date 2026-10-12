import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery } from "convex/react";
import { CheckCircle2, FileSearch, Loader2, QrCode } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";

/**
 * Page publique de suivi documentaire (QR / n° de référence).
 * Ne nécessite pas d'être connecté pour consulter le statut.
 */
export default function Tracking() {
  const { ref: refParam } = useParams<{ ref?: string }>();
  const [search] = useSearchParams();
  const tokenFromUrl = search.get("t") ?? undefined;

  const [manualRef, setManualRef] = useState("");
  const [lookup, setLookup] = useState(
    (refParam ?? "").toUpperCase().trim(),
  );

  const publicRef = lookup || (refParam ?? "").toUpperCase().trim();

  const data = useQuery(
    api.documents.trackByRef,
    publicRef
      ? { publicRef, token: tokenFromUrl }
      : "skip",
  );

  const qrUrl = useMemo(() => {
    if (!publicRef) return null;
    const base =
      typeof window !== "undefined"
        ? `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}`
        : "";
    const target = `${base}/suivi/${encodeURIComponent(publicRef)}${
      tokenFromUrl ? `?t=${encodeURIComponent(tokenFromUrl)}` : ""
    }`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(target)}`;
  }, [publicRef, tokenFromUrl]);

  return (
    <div className="min-h-screen bg-[#f3efe6] px-4 py-10 text-[#3d2c1e]">
      <div className="mx-auto max-w-lg space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-[#5c4033]/10">
            <FileSearch className="size-6 text-[#5c4033]" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Suivi documentaire
          </h1>
          <p className="mt-1 text-sm text-[#5c4033]/80">
            Identité unique du dossier — même après impression ou photocopie
          </p>
        </div>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setLookup(manualRef.trim().toUpperCase());
          }}
        >
          <Input
            className="bg-white"
            placeholder="N° de référence (ex. SD-2026-ABC123)"
            value={manualRef}
            onChange={(e) => setManualRef(e.target.value)}
          />
          <Button type="submit" className="shrink-0 bg-[#5c4033]">
            Suivre
          </Button>
        </form>

        {!publicRef ? (
          <p className="text-center text-sm text-[#5c4033]/70">
            Scannez le QR code imprimé sur le document, ou saisissez le numéro de
            référence.
          </p>
        ) : data === undefined ? (
          <div className="flex justify-center py-12">
            <Loader2 className="size-6 animate-spin text-[#5c4033]" />
          </div>
        ) : data === null ? (
          <div className="rounded-xl border border-red-200 bg-white p-6 text-center text-sm">
            <p className="font-medium text-red-800">Référence introuvable</p>
            <p className="mt-1 text-muted-foreground">
              Vérifiez le numéro sur le document ou le QR code.
            </p>
          </div>
        ) : (
          <div className="space-y-4 rounded-xl border border-[#5c4033]/15 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#5c4033]/60">
                  Référence
                </p>
                <p className="font-mono text-lg font-bold tracking-wide">
                  {data.publicRef}
                </p>
              </div>
              {data.isComplete || data.archived ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-900">
                  <CheckCircle2 className="size-3.5" />
                  Traité
                  {data.archived ? " · Archivé" : ""}
                </span>
              ) : (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">
                  {data.statusLabel}
                </span>
              )}
            </div>

            <div className="grid gap-2 text-sm">
              <div>
                <span className="text-[#5c4033]/60">Objet · </span>
                <span className="font-medium">{data.objet}</span>
              </div>
              <div>
                <span className="text-[#5c4033]/60">Émetteur · </span>
                {data.senderName}
              </div>
              {!data.isComplete ? (
                <div>
                  <span className="text-[#5c4033]/60">En possession de · </span>
                  <span className="font-medium">{data.currentHolder}</span>
                </div>
              ) : null}
            </div>

            {data.hasCircuit && data.steps.length > 0 ? (
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[#5c4033]/60">
                  Circuit ({Math.min(data.currentStepIndex + 1, data.circuitTotalSteps)}/
                  {data.circuitTotalSteps})
                </p>
                <ol className="space-y-1.5">
                  {data.steps.map((s) => (
                    <li
                      key={s.stepIndex}
                      className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                        s.status === "active" ? "bg-amber-50" : ""
                      }`}
                    >
                      <span className="flex size-5 items-center justify-center rounded-full bg-[#5c4033]/10 text-[10px] font-bold">
                        {s.stepIndex + 1}
                      </span>
                      <span className="flex-1 font-medium">{s.assigneeName}</span>
                      <span className="text-xs text-[#5c4033]/70">
                        {s.statusLabel}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            {qrUrl ? (
              <div className="flex flex-col items-center gap-2 border-t border-[#5c4033]/10 pt-4">
                <img
                  src={qrUrl}
                  alt={`QR ${data.publicRef}`}
                  className="size-[140px] rounded-md border bg-white p-1"
                />
                <p className="flex items-center gap-1 text-[11px] text-[#5c4033]/60">
                  <QrCode className="size-3.5" />
                  QR de suivi de ce dossier
                </p>
              </div>
            ) : null}

            {data.isComplete ? (
              <p className="rounded-md bg-emerald-50 px-3 py-2 text-center text-xs text-emerald-900">
                Traitement terminé. Si vous scannez ce QR sur une photocopie, le
                système confirme que le dossier est clos et archivé.
              </p>
            ) : (
              <p className="text-center text-[11px] text-[#5c4033]/60">
                Les intervenants connectés valident leur étape dans ScanDoc
                (Reçus → fiche document).
              </p>
            )}
          </div>
        )}

        <p className="text-center text-xs text-[#5c4033]/50">
          <Link to="/auth" className="underline hover:text-[#5c4033]">
            Connexion ScanDoc
          </Link>
        </p>
      </div>
    </div>
  );
}
