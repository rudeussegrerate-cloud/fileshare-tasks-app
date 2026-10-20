import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { MAX_FILE_BYTES, extractTextFromFile } from "@/lib/extract-text";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Camera,
  CheckCircle2,
  FileText,
  Info,
  Loader2,
  Send,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { PresenceDot } from "./PresenceDot";
import { EmptyState, StepDots, formatBytes, initialsOf , PREDEFINED_TASKS } from "./shared";

const ONLINE_MS = 2 * 60 * 1000;
function isOnline(lastSeenAt?: number | null) {
  return Boolean(lastSeenAt && Date.now() - lastSeenAt < ONLINE_MS);
}


const STEPS = ["Fichier", "Destinataires", "Détails"];

const ACCEPT =
  ".pdf,.doc,.docx,.odt,.rtf,.txt,.md,.csv,.xls,.xlsx,.json,.xml,.png,.jpg,.jpeg,.webp,.heic,.heif,.gif,image/*";

export function SendDocument({
  onSent,
  onManageDepartments,
  initialPublicRef,
  replyTo,
}: {
  onSent: (documentId?: Id<"documents">) => void;
  onManageDepartments: () => void;
  /** Préremplir l'identifiant (continuation de circuit). */
  initialPublicRef?: string;
  /** Mode réponse à un courrier reçu */
  replyTo?: {
    documentId: Id<"documents">;
    publicRef?: string | null;
    objet: string;
    senderDepartmentId?: Id<"departments"> | null;
  } | null;
}) {
  const me = useQuery(api.workspace.me);
  const departments = useQuery(api.workspace.listDepartments);
  const receivedRefs = useQuery(api.documents.listReceivedRefs);
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const sendDocument = useMutation(api.documents.send);

  const [step, setStep] = useState(0);
  // L'étape « Qui envoie » (index 2) est sautée : émetteur = profil connecté
  const goNext = () => setStep((s) => (s === 1 ? 3 : Math.min(3, s + 1)));
  const goBack = () => setStep((s) => (s === 3 ? 1 : Math.max(0, s - 1)));
  const stepDot = step === 3 ? 2 : step === 2 ? 1 : step;

  const [files, setFiles] = useState<File[]>([]);
  const [extractedText, setExtractedText] = useState("");
  const [extracting, setExtracting] = useState(false);
  /** Services destinataires (rattachés à une direction) */
  const [destIds, setDestIds] = useState<Id<"departments">[]>(
    replyTo?.senderDepartmentId ? [replyTo.senderDepartmentId] : [],
  );
  /** direction = envoi aux directions ; service = envoi aux services uniquement */
  const [destMode, setDestMode] = useState<"direction" | "service">("direction");
  const [selectedDirectionId, setSelectedDirectionId] = useState<
    Id<"departments"> | null
  >(null);
  const [emitMode, setEmitMode] = useState<"direction" | "service">("direction");
  const [emitParentDirectionId, setEmitParentDirectionId] = useState<
    Id<"departments"> | null
  >(null);
  const departmentId = destIds[0] ?? null;
  const [recipientId, setRecipientId] = useState<Id<"users"> | null>(null);
  /** Intervenants suivants dans le circuit (après le destinataire principal) */
  const [circuitExtra, setCircuitExtra] = useState<
    Array<{ userId: Id<"users">; name: string; dept?: string }>
  >([]);
  /** Autres directions/services destinataires (en plus de la destination principale) */
  const [extraDestIds, setExtraDestIds] = useState<Id<"departments">[]>([]);

  // Objet / références du courrier
  const [objet, setObjet] = useState(
    replyTo?.objet ? `Réponse à : ${replyTo.objet}` : "",
  );
  const [observations, setObservations] = useState("");
  const [customFields, setCustomFields] = useState<
    Array<{
      label: string;
      value: string;
      source?: "manual" | "courrier" | "structure";
    }>
  >([]);
  const [referenceText, setReferenceText] = useState(
    replyTo?.publicRef ? replyTo.publicRef : "",
  );
  const [requiresResponse, setRequiresResponse] = useState(false);
  const [destFonction, setDestFonction] = useState("");
  const [arriveeLe, setArriveeLe] = useState("");
  const [duField, setDuField] = useState("");
  const [dateCourrier, setDateCourrier] = useState("");

  const [refPickerOpen, setRefPickerOpen] = useState(false);
  const [publicRef, setPublicRef] = useState(initialPublicRef ?? "");
  const filteredReceivedRefs = useMemo(() => {
    const list = receivedRefs ?? [];
    const q = referenceText.trim().toLowerCase();
    // Afficher les N° bruts même si la valeur stockée est "Votre correspondance N°..."
    const qNorm = q.replace(/^votre correspondance\s+/i, "");
    if (!qNorm) return list.slice(0, 40);
    return list
      .filter(
        (r) =>
          r.publicRef.toLowerCase().includes(qNorm) ||
          r.objet.toLowerCase().includes(qNorm),
      )
      .slice(0, 40);
  }, [receivedRefs, referenceText]);
  /** SLA par étape (heures) pour un nouveau circuit */
  const [stepDeadlineHours, setStepDeadlineHours] = useState(48);
  const refLookup = useQuery(
    api.documents.lookupByPublicRef,
    // Recherche circuit uniquement si N° complet collé (pas la simple séquence)
    publicRef.trim().startsWith("N°") || publicRef.trim().startsWith("REF-")
      ? { publicRef: publicRef.trim() }
      : "skip",
  );

  // Tâches (multi-sélection)
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [customTask, setCustomTask] = useState("");

  // De la part de
  const [onBehalfType, setOnBehalfType] = useState<"internal" | "external">(
    "internal",
  );
  const [onBehalfDepartmentId, setOnBehalfDepartmentId] =
    useState<Id<"departments"> | null>(null);
  // initialisé quand me charge
  const [onBehalfUserId, setOnBehalfUserId] = useState<Id<"users"> | null>(
    null,
  );
  const [onBehalfName, setOnBehalfName] = useState("");
  const [onBehalfFunction, setOnBehalfFunction] = useState("");
  const [onBehalfDepartmentText, setOnBehalfDepartmentText] = useState("");

  const [sending, setSending] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const selectedDepartment = departments?.find((d) => d._id === departmentId);
  const selectableMembers =
    selectedDepartment?.members.filter(
      (member) => member._id !== me?.user._id,
    ) ?? [];
  const selectedRecipient = selectedDepartment?.members.find(
    (member) => member._id === recipientId,
  );

  /** Tous les membres validés de tous les départements (pour le circuit inter-services) */
  const allCircuitCandidates = (departments ?? []).flatMap((d) =>
    (d.members ?? [])
      .filter((m) => m._id !== me?.user._id)
      .map((m) => ({
        userId: m._id as Id<"users">,
        name: m.name,
        dept: d.name as string,
        deptId: d._id as Id<"departments">,
      })),
  );

  const onBehalfDepartment = departments?.find(
    (d) => d._id === onBehalfDepartmentId,
  );
  const onBehalfMembers = onBehalfDepartment?.members ?? [];
  const selectedOnBehalfUser = onBehalfMembers.find(
    (m) => m._id === onBehalfUserId,
  );

  useEffect(() => {
    if (onBehalfDepartmentId) return;
    if (me?.user?.departmentId) {
      setOnBehalfDepartmentId(me.user.departmentId as Id<"departments">);
    }
  }, [me?.user?.departmentId, onBehalfDepartmentId]);

  /** Aperçu du chemin N° selon la structure émettrice */
  const emittingPathPreview = useMemo(() => {
    if (!onBehalfDepartmentId || !departments) return null;
    const byId = new Map(departments.map((d) => [String(d._id), d]));
    const codes: string[] = [];
    let cur: string | null = String(onBehalfDepartmentId);
    let guard = 0;
    while (cur && guard < 12) {
      guard += 1;
      const d = byId.get(cur);
      if (!d) break;
      const code = (d.code ?? "").trim();
      if (code && code.toUpperCase() !== "MNDPT") codes.unshift(code);
      cur = d.parentId ? String(d.parentId) : null;
    }
    return codes.length ? `MNDPT/${codes.join("/")}` : "MNDPT";
  }, [onBehalfDepartmentId, departments]);

  const courrierYear = new Date().getFullYear();
  /** Seulement le n° saisi (ex. 071) ; le chemin est automatique */
  const sequenceOnly = publicRef.replace(/\D/g, "").slice(0, 4);
  const fullNumeroPreview = useMemo(() => {
    const path = emittingPathPreview ?? "MNDPT";
    if (!sequenceOnly) {
      return `N°___-${courrierYear}/${path}`;
    }
    const seq = sequenceOnly.padStart(3, "0");
    return `N°${seq}-${courrierYear}/${path}`;
  }, [sequenceOnly, emittingPathPreview, courrierYear]);

  const toggleTask = (task: string) => {
    setSelectedTasks((prev) =>
      prev.includes(task) ? prev.filter((t) => t !== task) : [...prev, task],
    );
  };

  const effectiveTasks = [
    ...selectedTasks,
    ...(customTask.trim() ? [customTask.trim()] : []),
  ];

  const handleFiles = async (list: FileList | File[] | null) => {
    if (!list || (Array.isArray(list) ? list.length === 0 : list.length === 0)) return;
    const incoming = Array.from(list as FileList | File[]);
    const accepted: File[] = [];
    for (const next of incoming) {
      if (next.size > MAX_FILE_BYTES) {
        toast.error(`« ${next.name} » trop volumineux (max 10 Mo)`);
        continue;
      }
      accepted.push(next);
    }
    if (accepted.length === 0) return;
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name + f.size));
      const merged = [...prev];
      for (const f of accepted) {
        const key = f.name + f.size;
        if (!names.has(key)) {
          merged.push(f);
          names.add(key);
        }
      }
      return merged.slice(0, 20);
    });
    setExtracting(true);
    try {
      const text = await extractTextFromFile(accepted[0]!);
      setExtractedText(text);
    } finally {
      setExtracting(false);
    }
  };

  const removeFileAt = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const toggleDest = (id: Id<"departments">) => {
    setDestIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const directions = (departments ?? [])
    .filter((d) => {
      if ((d as { active?: boolean }).active === false) return false;
      const k = (d as { kind?: string | null }).kind;
      return k !== "service";
    })
    .slice()
    .sort((a, b) =>
      (a.code ?? a.name).localeCompare(b.code ?? b.name, "fr"),
    );
  const emitServicesOfParent = (departments ?? [])
    .filter(
      (d) =>
        emitParentDirectionId &&
        d.parentId === emitParentDirectionId &&
        (d as { kind?: string | null }).kind === "service",
    )
    .slice()
    .sort((a, b) =>
      (a.code ?? a.name).localeCompare(b.code ?? b.name, "fr"),
    );

  const servicesOfSelected = (departments ?? [])
    .filter(
      (d) =>
        selectedDirectionId &&
        d.parentId === selectedDirectionId &&
        (d as { kind?: string | null }).kind === "service",
    )
    .slice()
    .sort((a, b) =>
      (a.code ?? a.name).localeCompare(b.code ?? b.name, "fr"),
    );
  const selectedDirection = (departments ?? []).find(
    (d) => d._id === selectedDirectionId,
  );

  const reset = () => {
    setStep(0);
    setFiles([]);
    setDestIds([]);
    setDestMode("direction");
    setSelectedDirectionId(null);
    setExtractedText("");
    // destIds cleared above
    setRecipientId(null);
    setCircuitExtra([]);
    setObjet("");
    setObservations("");
    setPublicRef("");
    setSelectedTasks([]);
    setCustomTask("");
    setOnBehalfType("internal");
    setOnBehalfDepartmentId(null);
    setOnBehalfUserId(null);
    setOnBehalfName("");
    setOnBehalfFunction("");
    setOnBehalfDepartmentText("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  const canContinue =
    step === 0
      ? files.length > 0
      : step === 1
        ? destIds.length > 0
        : step === 2
          ? Boolean(onBehalfDepartmentId) ||
            (onBehalfType === "external" && onBehalfName.trim().length > 0)
          : (() => {
              if (!objet.trim()) return false;
              if (selectedTasks.length === 0 && !customTask.trim()) return false;
              return true;
            })();

  const handleSend = async () => {
    if (files.length === 0 || destIds.length === 0) return;
    if (!objet.trim()) {
      toast.error("Précisez l'objet de l'envoi.");
      return;
    }
    if (effectiveTasks.length === 0) {
      toast.error("Sélectionnez au moins une tâche.");
      return;
    }
    if (!onBehalfDepartmentId && onBehalfType === "internal") {
      toast.error("Choisissez la structure qui émet le courrier.");
      return;
    }
    setSending(true);
    try {
      const resolvedOnBehalfUserId =
        onBehalfType === "internal"
          ? undefined
          : undefined;
      // Structure émettrice obligatoire (N° hiérarchique)

      const uploaded: Array<{
        storageId: Id<"_storage">;
        fileName: string;
        contentType: string | undefined;
        size: number;
      }> = [];

      for (const file of files) {
        const uploadUrl = await generateUploadUrl();
        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: {
            "Content-Type": file.type || "application/octet-stream",
          },
          body: file,
        });
        if (!response.ok) {
          throw new Error(
            `Échec d'envoi du fichier « ${files[0]?.name} » (${response.status}).`,
          );
        }
        const { storageId } = (await response.json()) as {
          storageId: Id<"_storage">;
        };
        uploaded.push({
          storageId,
          fileName: file.name || `document-${Date.now()}.bin`,
          contentType: file.type || undefined,
          size: file.size,
        });
      }

      let lastId: Id<"documents"> | undefined;
      let count = 0;

      // Destinations structurelles (traitement uniquement — document unique)
      const recipientTargets = destIds.map((departmentId) => ({
        departmentId,
        kind: "traitement" as const,
      }));

      for (let fi = 0; fi < uploaded.length; fi++) {
        const up = uploaded[fi]!;
        // N° complet = N°{séquence}-{année}/{hiérarchie émetteur}
        let refBase: string | undefined;
        if (publicRef.trim()) {
          refBase = publicRef.trim();
        } else {
          refBase = undefined;
        }
        const ref =
          refBase && uploaded.length === 1
            ? refBase
            : refBase
              ? `${refBase}#${fi + 1}`
              : undefined;
        const metaFields = [
          arriveeLe.trim()
            ? { label: "Arrivée le", value: arriveeLe.trim(), source: "manual" as const }
            : null,
          duField.trim()
            ? { label: "Du", value: duField.trim(), source: "manual" as const }
            : null,
          dateCourrier.trim()
            ? { label: "Date", value: dateCourrier.trim(), source: "manual" as const }
            : null,
          destFonction.trim()
            ? {
                label: "Fonction destinataire",
                value: destFonction.trim(),
                source: "structure" as const,
              }
            : null,
        ].filter(Boolean) as Array<{
          label: string;
          value: string;
          source?: "manual" | "courrier" | "structure";
        }>;
        const mergedFields = [
          ...customFields
            .filter((f) => f.label.trim() && f.value.trim())
            .map((f) => ({
              label: f.label.trim(),
              value: f.value.trim(),
              source: f.source,
            })),
          ...metaFields,
        ].slice(0, 8);

        lastId = await sendDocument({
          storageId: up.storageId,
          fileName: up.fileName,
          contentType: up.contentType,
          size: up.size,
          objet: objet.trim(),
          observations: observations.trim() || undefined,
          tasks: effectiveTasks,
          extractedText: fi === 0 ? extractedText || undefined : undefined,
          recipientDepartmentId: destIds[0],
          recipientTargets,
          recipientId: fi === 0 ? recipientId ?? undefined : undefined,
          publicRef: ref || undefined,
          stepDeadlineHours: undefined,
          parentCourrierId: replyTo?.documentId,
          referenceText: referenceText.trim() || undefined,
          requiresResponse: false,
          emittingDepartmentId:
            (me?.user?.departmentId as Id<"departments"> | undefined) ??
            onBehalfDepartmentId ??
            undefined,
          circuitAssigneeIds:
            fi === 0 && circuitExtra.length > 0
              ? circuitExtra.map((c) => c.userId)
              : undefined,
          onBehalfOfType: "internal",
          onBehalfOfUserId: me?.user?._id ?? undefined,
          onBehalfOfName: me?.user?.name?.trim() || undefined,
          onBehalfOfFunction: me?.user?.fonction?.trim() || undefined,
          onBehalfOfDepartment: me?.department?.name?.trim() || undefined,
          customFields: mergedFields.length ? mergedFields : undefined,
        });
        count += 1;
      }

      toast.success(
        count === 1
          ? destIds.length > 1
            ? `Courrier transmis à ${destIds.length} structures.`
            : "Courrier transmis."
          : `${count} courrier(s) créé(s).`,
      );
      reset();
      onSent(lastId);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Envoi impossible.";
      toast.error(message);
    } finally {
      setSending(false);
    }
  };


  if (departments !== undefined && departments.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title="Aucune structure pour l'instant"
        description={
          me?.isAdmin
            ? "Installez d'abord l'arbre MNDPT (menu Départements) ou créez les structures, puis nommez les chefs."
            : "Le DG doit encore installer les directions et services. Revenez un peu plus tard."
        }
        action={
          me?.isAdmin ? (
            <Button onClick={onManageDepartments} className="gap-2">
              <Building2 className="size-4" />
              Gérer les structures
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">
          Envoyer des documents
        </h2>
        <p className="text-xs text-muted-foreground">
          Envoi vers une ou plusieurs directions ou services. Indiquez l&apos;objet et la personne au nom de
          qui vous envoyez et les tâches à réaliser.
        </p>
      </div>

      <Card className="border-border/80 ">
        <CardContent className="space-y-6 pt-6">
          {replyTo ? (
            <p className="rounded-sm border border-brand/30 bg-brand-soft/50 px-3 py-2 text-xs">
              <strong>Réponse</strong> au courrier
              {replyTo.publicRef ? ` ${replyTo.publicRef}` : ""} — destinataire et
              référence préremplis.
            </p>
          ) : null}
          <StepDots steps={STEPS} current={stepDot} />

          {step === 0 ? (
            <div className="space-y-4">
                            {files.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {files.length} fichier{files.length > 1 ? "s" : ""} sélectionné
                    {files.length > 1 ? "s" : ""}
                    {extracting ? " · analyse…" : extractedText ? " · texte extrait" : ""}
                  </p>
                  <ul className="space-y-2">
                    {files.map((f, i) => (
                      <li
                        key={`${f.name}-${f.size}-${i}`}
                        className="flex items-center gap-3 rounded-sm border border-border bg-brand-soft/50 p-3"
                      >
                        <div className="flex size-9 items-center justify-center rounded-sm bg-card text-brand">
                          <FileText className="size-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{f.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatBytes(f.size)}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeFileAt(i)}
                          aria-label={`Retirer ${f.name}`}
                        >
                          <X className="size-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setFiles([]);
                      setExtractedText("");
                      if (fileInputRef.current) fileInputRef.current.value = "";
                      if (cameraInputRef.current) cameraInputRef.current.value = "";
                    }}
                  >
                    Tout retirer
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  PDF, Word, Excel, images ou texte · 10 Mo max par fichier · plusieurs fichiers possibles
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FileText className="size-4" />
                  Ajouter des fichiers
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => cameraInputRef.current?.click()}
                >
                  <Camera className="size-4" />
                  Prendre une photo
                </Button>
              </div>

              <input
                ref={fileInputRef}
                type="file" data-scandoc-tour="send-file"
                accept={ACCEPT}
                className="hidden"
                multiple
                onChange={(event) =>
                  void handleFiles(event.target.files)
                }
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(event) =>
                  void handleFiles(event.target.files)
                }
              />

              <div className="flex items-start gap-2 rounded-sm border border-brand-sky/25 bg-brand-soft/60 px-4 py-3 text-xs text-muted-foreground">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-brand-sky" />
                <p>
                  Le contenu est analysé pour proposer un résumé au destinataire.
                </p>
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-4" data-scandoc-tour="send-destination">
              <div className="flex items-start gap-2 rounded-sm border-l-4 border-brand-sky bg-brand-soft/70 px-4 py-3 text-xs leading-relaxed">
                <Info className="mt-0.5 size-4 shrink-0 text-brand-sky" />
                <p className="font-medium text-foreground">
                  <strong>Destinataires</strong> — cochez la{" "}
                  <strong>direction</strong> (chef / structure) et/ou un ou
                  plusieurs <strong>services</strong> rattachés. Vous pouvez
                  combiner des choix issus de <strong>plusieurs directions</strong>.
                </p>
              </div>

              {departments === undefined ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : directions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucune direction disponible. Demandez au DG d&apos;initialiser
                  l&apos;arbre organisationnel.
                </p>
              ) : (
                <div className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
                  {directions.map((dir) => {
                    const dirActive = destIds.includes(dir._id);
                    const services = (departments ?? [])
                      .filter(
                        (s) =>
                          s.parentId === dir._id &&
                          (s as { kind?: string | null }).kind === "service" &&
                          (s as { active?: boolean }).active !== false,
                      )
                      .slice()
                      .sort((a, b) =>
                        (a.code ?? a.name).localeCompare(
                          b.code ?? b.name,
                          "fr",
                        ),
                      );
                    const selectedSvcCount = services.filter((s) =>
                      destIds.includes(s._id),
                    ).length;
                    return (
                      <div
                        key={dir._id}
                        className={cn(
                          "rounded-lg border p-3 transition-colors",
                          dirActive || selectedSvcCount > 0
                            ? "border-brand/40 bg-brand-soft/40"
                            : "border-border bg-card",
                        )}
                      >
                        {/* Direction (chef / structure entière) */}
                        <label className="flex cursor-pointer items-start gap-3">
                          <input
                            type="checkbox"
                            className="mt-1 size-4 shrink-0 rounded border-border accent-[var(--brand,#5b4cdb)]"
                            checked={dirActive}
                            onChange={() => toggleDest(dir._id)}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-foreground">
                                {dir.code ? `${dir.code} — ` : ""}
                                {dir.name}
                              </span>
                              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                Direction
                              </span>
                            </span>
                            <span className="mt-0.5 block text-[11px] text-muted-foreground">
                              Cocher pour adresser au chef / à la direction
                              entière
                              {services.length > 0
                                ? ` · ${services.length} service${services.length > 1 ? "s" : ""} rattaché${services.length > 1 ? "s" : ""}`
                                : ""}
                            </span>
                          </span>
                        </label>

                        {/* Services de cette direction */}
                        {services.length > 0 ? (
                          <div className="mt-3 space-y-1.5 border-t border-border/60 pt-3 pl-7">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Services
                            </p>
                            {services.map((svc) => {
                              const svcActive = destIds.includes(svc._id);
                              return (
                                <label
                                  key={svc._id}
                                  className={cn(
                                    "flex cursor-pointer items-center gap-3 rounded-md border px-2.5 py-2 transition-colors",
                                    svcActive
                                      ? "border-brand bg-card shadow-sm"
                                      : "border-transparent hover:bg-muted/40",
                                  )}
                                >
                                  <input
                                    type="checkbox"
                                    className="size-4 shrink-0 rounded border-border accent-[var(--brand,#5b4cdb)]"
                                    checked={svcActive}
                                    onChange={() => toggleDest(svc._id)}
                                  />
                                  <span className="min-w-0 flex-1 text-sm">
                                    <span className="font-medium text-foreground">
                                      {svc.code ? `${svc.code} — ` : ""}
                                      {svc.name}
                                    </span>
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="mt-2 pl-7 text-[11px] text-muted-foreground">
                            Aucun service rattaché à cette direction.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {destIds.length > 0 ? (
                <div className="rounded-sm border border-border bg-muted/30 px-3 py-2">
                  <p className="text-xs font-semibold text-foreground">
                    Sélection ({destIds.length})
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {destIds.map((id) => {
                      const d = departments?.find((x) => x._id === id);
                      if (!d) return null;
                      const isSvc =
                        (d as { kind?: string | null }).kind === "service";
                      const label = d.code
                        ? `${d.code}`
                        : d.name.slice(0, 28);
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => toggleDest(id)}
                          className="inline-flex items-center gap-1 rounded-full border border-brand/40 bg-card px-2.5 py-1 text-[11px] font-medium text-foreground"
                          title={d.name}
                        >
                          <span className="text-[9px] uppercase text-muted-foreground">
                            {isSvc ? "Svc" : "Dir"}
                          </span>
                          {label}
                          <span className="text-muted-foreground">×</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-center text-xs text-muted-foreground">
                  Aucune destination sélectionnée.
                </p>
              )}

              {destIds.length > 0 ? (
                <div className="space-y-2 pt-1">
                  <Label htmlFor="destFonction">
                    Fonction dans le service{" "}
                    <span className="font-normal text-muted-foreground">
                      (optionnel)
                    </span>
                  </Label>
                  <Input
                    id="destFonction"
                    value={destFonction}
                    onChange={(e) => setDestFonction(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Ex. Comptable… Le document reste au service ; tous les
                    membres peuvent le voir.
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          
{false && step === 2 ? (
            <div className="space-y-4" data-scandoc-tour="send-emitter">
              <div className="rounded-sm border border-border bg-muted/40 px-4 py-3">
                <p className="text-sm font-semibold text-foreground">
                  Émetteur du courrier
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Indiquez <strong>d&apos;où part</strong> le courrier (votre
                  direction ou service). Ce choix fixe le chemin du N° officiel
                  (ex. MNDPT/SG/DGDN/DTD). Ce n&apos;est pas le destinataire.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEmitMode("direction");
                    setEmitParentDirectionId(null);
                  }}
                  className={cn(
                    "rounded-sm border px-3 py-2.5 text-left text-sm font-medium transition-all",
                    emitMode === "direction"
                      ? "border-brand bg-brand-soft text-foreground"
                      : "border-border bg-card text-muted-foreground hover:border-brand-sky/40",
                  )}
                >
                  Direction
                  <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
                    Qui signe / envoie
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEmitMode("service");
                    setOnBehalfDepartmentId(null);
                  }}
                  className={cn(
                    "rounded-sm border px-3 py-2.5 text-left text-sm font-medium transition-all",
                    emitMode === "service"
                      ? "border-brand bg-brand-soft text-foreground"
                      : "border-border bg-card text-muted-foreground hover:border-brand-sky/40",
                  )}
                >
                  Service
                  <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
                    Service précis
                  </span>
                </button>
              </div>

              {departments === undefined ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : emitMode === "direction" ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Structure émettrice (choix unique)
                  </p>
                  <div className="max-h-72 space-y-1.5 overflow-y-auto rounded-sm border border-border bg-card p-2">
                    {directions.length === 0 ? (
                      <p className="p-2 text-sm text-muted-foreground">
                        Aucune direction. Le DG doit installer l&apos;arbre
                        MNDPT.
                      </p>
                    ) : (
                      directions.map((dir) => {
                        const active = onBehalfDepartmentId === dir._id;
                        return (
                          <button
                            key={dir._id}
                            type="button"
                            onClick={() => {
                              setOnBehalfDepartmentId(dir._id);
                              setOnBehalfUserId(null);
                              setOnBehalfType("internal");
                            }}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-sm border px-3 py-2.5 text-left transition-all",
                              active
                                ? "border-brand bg-brand-soft shadow-sm"
                                : "border-transparent bg-card hover:border-brand-sky/40",
                            )}
                          >
                            <span
                              className={cn(
                                "flex size-4 shrink-0 items-center justify-center rounded-full border-2",
                                active
                                  ? "border-brand bg-brand"
                                  : "border-muted-foreground/40",
                              )}
                            >
                              {active ? (
                                <span className="size-1.5 rounded-full bg-white" />
                              ) : null}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold">
                                {dir.code ? `${dir.code} — ` : ""}
                                {dir.name}
                              </span>
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      1 · Direction de rattachement
                    </p>
                    <div className="max-h-36 space-y-1 overflow-y-auto rounded-sm border border-border p-2">
                      {directions.map((dir) => {
                        const svcCount = (departments ?? []).filter(
                          (s) =>
                            s.parentId === dir._id &&
                            (s as { kind?: string | null }).kind === "service",
                        ).length;
                        if (svcCount === 0) return null;
                        const active = emitParentDirectionId === dir._id;
                        return (
                          <button
                            key={dir._id}
                            type="button"
                            onClick={() => {
                              setEmitParentDirectionId(dir._id);
                              setOnBehalfDepartmentId(null);
                              setOnBehalfUserId(null);
                            }}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-sm border px-3 py-2 text-left text-sm",
                              active
                                ? "border-brand bg-brand-soft font-medium"
                                : "border-transparent bg-card hover:border-brand-sky/40",
                            )}
                          >
                            <span
                              className={cn(
                                "size-3 shrink-0 rounded-full border-2",
                                active
                                  ? "border-brand bg-brand"
                                  : "border-muted-foreground/40",
                              )}
                            />
                            {dir.code ? `${dir.code} — ` : ""}
                            {dir.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {emitParentDirectionId ? (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        2 · Service qui envoie
                      </p>
                      <div className="max-h-48 space-y-1 overflow-y-auto rounded-sm border border-border bg-card p-2">
                        {emitServicesOfParent.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            Aucun service rattaché.
                          </p>
                        ) : (
                          emitServicesOfParent.map((svc) => {
                            const active = onBehalfDepartmentId === svc._id;
                            return (
                              <button
                                key={svc._id}
                                type="button"
                                onClick={() => {
                                  setOnBehalfDepartmentId(svc._id);
                                  setOnBehalfUserId(null);
                                  setOnBehalfType("internal");
                                }}
                                className={cn(
                                  "flex w-full items-center gap-3 rounded-sm border px-3 py-2.5 text-left",
                                  active
                                    ? "border-brand bg-brand-soft shadow-sm"
                                    : "border-transparent bg-card hover:border-brand-sky/40",
                                )}
                              >
                                <span
                                  className={cn(
                                    "flex size-4 shrink-0 items-center justify-center rounded-full border-2",
                                    active
                                      ? "border-brand bg-brand"
                                      : "border-muted-foreground/40",
                                  )}
                                >
                                  {active ? (
                                    <span className="size-1.5 rounded-full bg-white" />
                                  ) : null}
                                </span>
                                <span className="text-sm font-medium">
                                  {svc.code ? `${svc.code} — ` : ""}
                                  {svc.name}
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Choisissez d&apos;abord la direction de rattachement.
                    </p>
                  )}
                </div>
              )}

              {onBehalfDepartmentId ? (
                <div className="rounded-sm border border-border bg-muted/50 px-3 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground">
                    Émetteur retenu
                  </p>
                  <p className="mt-1 text-sm font-semibold text-foreground">
                    {(() => {
                      const d = departments?.find(
                        (x) => x._id === onBehalfDepartmentId,
                      );
                      if (!d) return "—";
                      return d!.code ? `${d!.code} — ${d!.name}` : d!.name;
                    })()}
                  </p>
                  {emittingPathPreview ? (
                    <p className="mt-1 font-mono text-[11px] text-foreground/80">
                      N° : …/{emittingPathPreview}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {onBehalfDepartmentId ? (
                <div className="space-y-2 border-t border-border pt-3">
                  <p className="text-xs font-medium text-foreground">
                    Signataire — fonction (optionnel)
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Choisissez la <strong>fonction</strong> qui signe le courrier
                    (pas une personne nommément).
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setOnBehalfUserId(null);
                        setOnBehalfFunction("");
                      }}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs",
                        !onBehalfFunction.trim()
                          ? "border-brand bg-brand-soft font-medium"
                          : "border-border bg-card",
                      )}
                    >
                      Non précisé
                    </button>
                    {Array.from(
                      new Set(
                        onBehalfMembers
                          .map((m) => (m.fonction ?? "").trim())
                          .filter(Boolean),
                      ),
                    )
                      .sort((a, b) => a.localeCompare(b, "fr"))
                      .map((fn) => (
                        <button
                          key={fn}
                          type="button"
                          onClick={() => {
                            setOnBehalfUserId(null);
                            setOnBehalfFunction(fn);
                          }}
                          className={cn(
                            "rounded-full border px-3 py-1 text-xs",
                            onBehalfFunction.trim() === fn
                              ? "border-brand bg-brand-soft font-medium"
                              : "border-border bg-card",
                          )}
                        >
                          {fn}
                        </button>
                      ))}
                  </div>
                  <div className="space-y-1.5 pt-1">
                    <Label htmlFor="onBehalfFnCustom" className="text-xs">
                      Ou saisir une fonction
                    </Label>
                    <Input
                      id="onBehalfFnCustom"
                      value={onBehalfFunction}
                      onChange={(e) => {
                        setOnBehalfUserId(null);
                        setOnBehalfFunction(e.target.value);
                      }}
                      className="h-9 text-sm"
                    />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

{step === 3 ? (
            <div className="space-y-6">
              {(extractedText.trim() || objet.trim()) ? (
                <div className="rounded-sm border border-border bg-muted/30 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Résumé du document
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                    {extractedText.trim()
                      ? extractedText.trim().slice(0, 600) +
                        (extractedText.trim().length > 600 ? "…" : "")
                      : objet.trim()}
                  </p>
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="publicRef">N° du courrier</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm text-muted-foreground">
                    N°
                  </span>
                  <Input
                    id="publicRef"
                    value={publicRef}
                    onChange={(e) => setPublicRef(e.target.value)}
                    className="w-full font-mono text-base"
                    inputMode="numeric"
                    autoComplete="off"
                  />
                  <span className="font-mono text-sm text-muted-foreground">
                    -{courrierYear}/
                  </span>
                </div>
                <p className="rounded-sm border border-border bg-muted/30 px-3 py-2 font-mono text-xs break-all">
                  {fullNumeroPreview}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Saisissez le numéro de courrier manuellement (ex. N°071-2026/MNDPT/DTD).
                </p>
                <div className="relative space-y-1.5 pt-2">
                  <Label htmlFor="referenceText">Réf.</Label>
                  <Input
                    id="referenceText"
                    className="w-full font-mono text-sm"
                    value={referenceText}
                    onChange={(e) => {
                      setReferenceText(e.target.value);
                      setRefPickerOpen(true);
                    }}
                    onFocus={() => setRefPickerOpen(true)}
                    onBlur={() => {
                      window.setTimeout(() => setRefPickerOpen(false), 180);
                    }}
                    autoComplete="off"
                  />
                  {refPickerOpen ? (
                    <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-sm border border-border bg-card shadow-md">
                      {receivedRefs === undefined ? (
                        <p className="px-3 py-2 text-xs text-muted-foreground">
                          Chargement des courriers reçus…
                        </p>
                      ) : filteredReceivedRefs.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-muted-foreground">
                          {(receivedRefs?.length ?? 0) === 0
                            ? "Aucun courrier reçu — impossible de référencer."
                            : "Aucun N° ne correspond à la recherche."}
                        </p>
                      ) : (
                        <ul className="py-1">
                          {filteredReceivedRefs.map((r) => (
                            <li key={r.documentId}>
                              <button
                                type="button"
                                className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-muted/60"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  setReferenceText(r.publicRef);
                                  setRefPickerOpen(false);
                                }}
                              >
                                <span className="font-mono text-xs font-medium">
                                  {r.publicRef}
                                </span>
                                <span className="line-clamp-1 text-[11px] text-muted-foreground">
                                  {r.objet}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : null}
                  <p className="text-[11px] text-muted-foreground">
                    Uniquement les N° des courriers que vous avez reçus.
                  </p>
                </div>
                {refLookup?.found && !refLookup.isClosed ? (
                  <div
                    className={
                      refLookup.isMyTurn
                        ? "rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900"
                        : "rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-foreground"
                    }
                  >
                    {refLookup.isMyTurn ? (
                      <>
                        Circuit reconnu — « {refLookup.objet} ».{" "}
                        {refLookup.isLastStep
                          ? "Vous êtes la dernière étape : l'envoi clôturera le dossier."
                          : refLookup.suggestedNext
                            ? `Prochain suggéré : ${refLookup.suggestedNext.name}${refLookup.suggestedNext.department ? ` (${refLookup.suggestedNext.department})` : ""}.`
                            : "Transmettez à l'étape suivante."}
                      </>
                    ) : (
                      <>
                        Identifiant trouvé, mais ce n&apos;est pas votre tour
                        {refLookup.activeAssigneeName
                          ? ` (chez ${refLookup.activeAssigneeName})`
                          : ""}
                        . L&apos;envoi sera refusé.
                      </>
                    )}
                  </div>
                ) : null}
                {refLookup?.found && refLookup.isClosed ? (
                  <p className="text-xs text-red-700">
                    Ce dossier est déjà clôturé. Choisissez un autre identifiant.
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="objet">Objet de l&apos;envoi</Label>
                <Textarea
                  id="objet" data-scandoc-tour="send-objet"
                  value={objet}
                  onChange={(e) => setObjet(e.target.value)}
                  rows={2}
                />
                <p className="text-xs text-muted-foreground">
                  Indiquez l&apos;objet du courrier.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="arriveeLe">Arrivée le</Label>
                  <Input
                    id="arriveeLe"
                    type="date"
                    value={arriveeLe}
                    onChange={(e) => setArriveeLe(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="duField">Du</Label>
                  <Input
                    id="duField"
                    value={duField}
                    onChange={(e) => setDuField(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dateCourrier">Date</Label>
                  <Input
                    id="dateCourrier"
                    type="date"
                    value={dateCourrier}
                    onChange={(e) => setDateCourrier(e.target.value)}
                  />
                </div>
              </div>


              <div className="space-y-2">
                <Label htmlFor="observations">Observations / instructions</Label>
                <Textarea
                  id="observations"
                  data-scandoc-tour="send-observations"
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                  rows={3}
                  className="resize-y"
                />
                <p className="text-[11px] text-muted-foreground">
                  Zone Observations de la fiche de transmission MNDPT.
                </p>
              </div>

              <div className="space-y-3 rounded-lg border border-dashed border-border bg-muted/25 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">Champs complémentaires</p>
                    <p className="text-[11px] text-muted-foreground">
                      Optionnel — les champs de base restent obligatoires.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    disabled={customFields.length >= 8}
                    onClick={() =>
                      setCustomFields((prev) => [
                        ...prev,
                        { label: "", value: "", source: "manual" },
                      ])
                    }
                  >
                    + Ajouter un champ
                  </Button>
                </div>
                {customFields.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">
                    Ex. Priorité, mention spéciale, référence interne…
                  </p>
                ) : (
                  <div className="space-y-3">
                    {customFields.map((field, i) => (
                      <div
                        key={i}
                        className="space-y-2 rounded-md border border-border bg-card p-2.5"
                      >
                        <div className="flex gap-2">
                          <Input
                            value={field.label}
                            onChange={(e) => {
                              const v = e.target.value;
                              setCustomFields((prev) =>
                                prev.map((f, j) =>
                                  j === i ? { ...f, label: v } : f,
                                ),
                              );
                            }}
                            className="h-8 flex-1 text-sm"
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-8 text-destructive"
                            onClick={() =>
                              setCustomFields((prev) =>
                                prev.filter((_, j) => j !== i),
                              )
                            }
                          >
                            Retirer
                          </Button>
                        </div>
                        <Input
                          value={field.value}
                          onChange={(e) => {
                            const v = e.target.value;
                            setCustomFields((prev) =>
                              prev.map((f, j) =>
                                j === i
                                  ? { ...f, value: v, source: "manual" as const }
                                  : f,
                              ),
                            );
                          }}
                          className="h-8 text-sm"
                        />
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] text-muted-foreground">
                            Depuis le site :
                          </span>
                          <select
                            className="h-7 max-w-[12rem] rounded-md border border-border bg-background px-1.5 text-[11px]"
                            defaultValue=""
                            onChange={(e) => {
                              const ref = e.target.value;
                              if (!ref) return;
                              setCustomFields((prev) =>
                                prev.map((f, j) =>
                                  j === i
                                    ? {
                                        ...f,
                                        value: ref,
                                        source: "courrier" as const,
                                        label: f.label.trim() || "Réf. liée",
                                      }
                                    : f,
                                ),
                              );
                              e.target.value = "";
                            }}
                          >
                            <option value="">Courrier reçu…</option>
                            {(receivedRefs ?? []).map(
                              (r: { documentId: string; publicRef?: string | null }) =>
                                r.publicRef ? (
                                  <option key={r.documentId} value={r.publicRef}>
                                    {r.publicRef}
                                  </option>
                                ) : null,
                            )}
                          </select>
                          <select
                            className="h-7 max-w-[12rem] rounded-md border border-border bg-background px-1.5 text-[11px]"
                            defaultValue=""
                            onChange={(e) => {
                              const name = e.target.value;
                              if (!name) return;
                              setCustomFields((prev) =>
                                prev.map((f, j) =>
                                  j === i
                                    ? {
                                        ...f,
                                        value: name,
                                        source: "structure" as const,
                                        label:
                                          f.label.trim() || "Structure liée",
                                      }
                                    : f,
                                ),
                              );
                              e.target.value = "";
                            }}
                          >
                            <option value="">Structure…</option>
                            {(departments ?? [])
                              .filter(
                                (d: { active?: boolean }) => d.active !== false,
                              )
                              .map(
                                (d: {
                                  _id: string;
                                  code?: string | null;
                                  name: string;
                                }) => (
                                  <option
                                    key={d._id}
                                    value={
                                      d.code
                                        ? `${d.code} — ${d.name}`
                                        : d.name
                                    }
                                  >
                                    {d.code
                                      ? `${d.code} — ${d.name}`
                                      : d.name}
                                  </option>
                                ),
                              )}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <Label>
                  <span data-scandoc-tour="send-tasks">Tâches à réaliser </span>
                  <span className="font-normal text-muted-foreground">
                    (plusieurs choix possibles)
                  </span>
                </Label>
                <div className="grid max-h-56 gap-2 overflow-y-auto rounded-sm border border-border bg-card p-3 sm:grid-cols-2">
                  {/* tour: send-tasks */}
                  {PREDEFINED_TASKS.map((task) => {
                    const checked = selectedTasks.includes(task);
                    return (
                      <label
                        key={task}
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-sm border px-3 py-2 text-sm transition-colors",
                          checked
                            ? "border-brand bg-brand-soft"
                            : "border-transparent hover:bg-muted/50",
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleTask(task)}
                        />
                        <span>{task}</span>
                      </label>
                    );
                  })}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customTask">
                    Autre{" "}
                    <span className="font-normal text-muted-foreground">
                      (si la tâche n&apos;est pas dans la liste)
                    </span>
                  </Label>
                  <Input
                    id="customTask"
                    value={customTask}
                    onChange={(e) => setCustomTask(e.target.value)}
                  />
                </div>
                {effectiveTasks.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {effectiveTasks.length} tâche
                    {effectiveTasks.length > 1 ? "s" : ""} sélectionnée
                    {effectiveTasks.length > 1 ? "s" : ""}
                  </p>
                ) : null}
              </div>

              <div className="rounded-sm border border-border bg-brand-soft/40 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Récapitulatif — vérifiez avant d&apos;envoyer
                </p>
                <dl className="mt-3 space-y-2.5 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="shrink-0 text-muted-foreground">Fichier(s)</dt>
                    <dd className="text-right font-medium break-all">
                      {files.length === 0
                        ? "—"
                        : files.length === 1
                          ? files[0]?.name
                          : files.map((f) => f.name).join(", ")}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt
                      className="shrink-0 text-muted-foreground"
                      data-scandoc-tour="send-recipient"
                    >
                      Qui reçoit
                    </dt>
                    <dd className="text-right font-medium">
                      {destIds
                        .map((id) => {
                          const d = departments?.find((x) => x._id === id);
                          if (!d) return null;
                          return d.code ? `${d.code} — ${d.name}` : d.name;
                        })
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="shrink-0 text-muted-foreground">Qui envoie</dt>
                    <dd className="text-right font-medium">
                      {onBehalfDepartment
                        ? onBehalfDepartment.code
                          ? `${onBehalfDepartment.code} — ${onBehalfDepartment.name}`
                          : onBehalfDepartment.name
                        : "—"}
                    </dd>
                  </div>
                  {emittingPathPreview ? (
                    <div className="flex justify-between gap-4">
                      <dt className="shrink-0 text-muted-foreground">
                        Chemin N°
                      </dt>
                      <dd className="text-right font-mono text-xs font-medium break-all">
                        {emittingPathPreview}
                      </dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-4">
                    <dt className="shrink-0 text-muted-foreground">
                      De la part de
                    </dt>
                    <dd className="text-right font-medium">
                      {onBehalfType === "external"
                        ? [
                            onBehalfFunction.trim() || null,
                            onBehalfName.trim() || null,
                            onBehalfDepartmentText.trim() || null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "—"
                        : [
                            onBehalfFunction.trim() || null,
                            onBehalfDepartment
                              ? onBehalfDepartment.code
                                ? `${onBehalfDepartment.code} — ${onBehalfDepartment.name}`
                                : onBehalfDepartment.name
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="shrink-0 text-muted-foreground">N° courrier</dt>
                    <dd className="text-right font-mono text-xs font-medium break-all">
                      {fullNumeroPreview}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="shrink-0 text-muted-foreground">Réf.</dt>
                    <dd className="text-right font-medium break-all">
                      {referenceText.trim() || "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="shrink-0 text-muted-foreground">
                      Réponse attendue
                    </dt>
                    <dd className="text-right font-medium">
                      {requiresResponse ? "Oui" : "Non"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="shrink-0 text-muted-foreground">Objet</dt>
                    <dd className="line-clamp-3 text-right font-medium">
                      {objet.trim() || "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="shrink-0 text-muted-foreground">
                      Observations
                    </dt>
                    <dd className="max-w-[65%] text-right font-medium whitespace-pre-wrap break-words">
                      {observations.trim() || "—"}
                    </dd>
                  </div>
                  {customFields.some((f) => f.label.trim() && f.value.trim()) ? (
                    <div className="flex justify-between gap-4">
                      <dt className="shrink-0 text-muted-foreground">
                        Compléments
                      </dt>
                      <dd className="max-w-[65%] text-right text-xs leading-relaxed">
                        {customFields
                          .filter((f) => f.label.trim() && f.value.trim())
                          .map((f) => `${f.label} : ${f.value}`)
                          .join(" · ")}
                      </dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-4">
                    <dt className="shrink-0 text-muted-foreground">Tâches</dt>
                    <dd className="max-w-[65%] text-right font-medium">
                      {effectiveTasks.length > 0
                        ? effectiveTasks.join(" · ")
                        : "—"}
                    </dd>
                  </div>
                  {circuitExtra.length > 0 ? (
                    <div className="flex justify-between gap-4">
                      <dt className="shrink-0 text-muted-foreground">
                        Circuit personnes
                      </dt>
                      <dd className="text-right font-medium">
                        {circuitExtra.map((c) => c.name).join(" → ")}
                      </dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-4">
                    <dt className="shrink-0 text-muted-foreground">
                      Résumé automatique
                    </dt>
                    <dd className="text-right font-medium">
                      {extracting
                        ? "en préparation…"
                        : extractedText
                          ? "activé"
                          : "indisponible (fichier sans texte)"}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-between border-t border-border pt-4">
            <Button
              type="button"
              variant="ghost"
              className="gap-2"
              disabled={step === 0 || sending}
              onClick={goBack}
            >
              <ArrowLeft className="size-4" />
              Retour
            </Button>

            {step < STEPS.length - 1 ? (
              <Button
                type="button"
                className="gap-2"
                disabled={!canContinue}
                onClick={goNext}
              >
                Continuer
                <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button
                type="button"
                className="gap-2"
                disabled={!canContinue || sending}
                onClick={() => void handleSend()}
              >
                {sending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                Envoyer le document
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
