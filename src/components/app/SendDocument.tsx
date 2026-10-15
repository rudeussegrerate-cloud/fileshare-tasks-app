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
import { useRef, useState } from "react";
import { toast } from "sonner";
import { PresenceDot } from "./PresenceDot";
import { EmptyState, StepDots, formatBytes, initialsOf , PREDEFINED_TASKS } from "./shared";

const ONLINE_MS = 2 * 60 * 1000;
function isOnline(lastSeenAt?: number | null) {
  return Boolean(lastSeenAt && Date.now() - lastSeenAt < ONLINE_MS);
}


const STEPS = ["Document", "Destination", "Détails & envoi"];

const ACCEPT =
  ".pdf,.doc,.docx,.odt,.rtf,.txt,.md,.csv,.xls,.xlsx,.json,.xml,.png,.jpg,.jpeg,.webp,.heic,.heif,.gif,image/*";

export function SendDocument({
  onSent,
  onManageDepartments,
  initialPublicRef,
}: {
  onSent: (documentId?: Id<"documents">) => void;
  onManageDepartments: () => void;
  /** Préremplir l'identifiant (continuation de circuit). */
  initialPublicRef?: string;
}) {
  const me = useQuery(api.workspace.me);
  const departments = useQuery(api.workspace.listDepartments);
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const sendDocument = useMutation(api.documents.send);

  const [step, setStep] = useState(0);
  const [files, setFiles] = useState<File[]>([]);
  const [extractedText, setExtractedText] = useState("");
  const [extracting, setExtracting] = useState(false);
  /** Destinations structurelles (directions et/ou services) — multi-sélection */
  const [destIds, setDestIds] = useState<Id<"departments">[]>([]);
  const departmentId = destIds[0] ?? null;
  const [recipientId, setRecipientId] = useState<Id<"users"> | null>(null);
  /** Intervenants suivants dans le circuit (après le destinataire principal) */
  const [circuitExtra, setCircuitExtra] = useState<
    Array<{ userId: Id<"users">; name: string; dept?: string }>
  >([]);
  /** Autres directions/services destinataires (en plus de la destination principale) */
  const [extraDestIds, setExtraDestIds] = useState<Id<"departments">[]>([]);

  // Objet de l'envoi
  const [objet, setObjet] = useState("");
  const [observations, setObservations] = useState("");
  const [publicRef, setPublicRef] = useState(
    (initialPublicRef ?? "").toUpperCase(),
  );
  /** SLA par étape (heures) pour un nouveau circuit */
  const [stepDeadlineHours, setStepDeadlineHours] = useState(48);
  const refLookup = useQuery(
    api.documents.lookupByPublicRef,
    publicRef.trim().length >= 3 ? { publicRef: publicRef.trim() } : "skip",
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

  const reset = () => {
    setStep(0);
    setFiles([]); setDestIds([]);
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
        : (() => {
              if (!objet.trim()) return false;
              if (selectedTasks.length === 0 && !customTask.trim()) return false;
              if (onBehalfType === "internal") {
                return Boolean(onBehalfUserId || me?.user._id);
              }
              return onBehalfName.trim().length > 0;
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
    if (onBehalfType === "internal" && !onBehalfUserId && !me?.user._id) {
      toast.error("Choisissez la personne « de la part de ».");
      return;
    }
    setSending(true);
    try {
      const resolvedOnBehalfUserId =
        onBehalfType === "internal"
          ? (onBehalfUserId ?? me?.user._id ?? undefined)
          : undefined;

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
      // Chaque fichier × chaque destination structurelle
      for (const up of uploaded) {
        for (let di = 0; di < destIds.length; di++) {
          const dest = destIds[di]!;
          const isFirstDest = di === 0;
          const refBase = publicRef.trim();
          const ref =
            refBase && destIds.length === 1 && uploaded.length === 1
              ? refBase
              : refBase
                ? `${refBase}-${di + 1}${uploaded.length > 1 ? `-${count + 1}` : ""}`
                : undefined;
          lastId = await sendDocument({
            storageId: up.storageId,
            fileName: up.fileName,
            contentType: up.contentType,
            size: up.size,
            objet: objet.trim(),
            observations: observations.trim() || undefined,
            tasks: effectiveTasks,
            extractedText: isFirstDest ? extractedText || undefined : undefined,
            recipientDepartmentId: dest,
            recipientId: isFirstDest ? recipientId ?? undefined : undefined,
            publicRef: ref,
            stepDeadlineHours: stepDeadlineHours,
            circuitAssigneeIds:
              isFirstDest && circuitExtra.length > 0
                ? circuitExtra.map((c) => c.userId)
                : undefined,
            onBehalfOfType: onBehalfType,
            onBehalfOfUserId: resolvedOnBehalfUserId,
            onBehalfOfName:
              onBehalfType === "external" ? onBehalfName.trim() : undefined,
            onBehalfOfFunction:
              onBehalfType === "external"
                ? onBehalfFunction.trim() || undefined
                : undefined,
            onBehalfOfDepartment:
              onBehalfType === "external"
                ? onBehalfDepartmentText.trim() || undefined
                : undefined,
          });
          count += 1;
        }
      }

      toast.success(
        count === 1
          ? "Document transmis à la structure destinataire."
          : `${count} envois effectués (${uploaded.length} fichier${uploaded.length > 1 ? "s" : ""} × ${destIds.length} destination${destIds.length > 1 ? "s" : ""}).`,
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
        title="Aucun département pour l'instant"
        description={
          me?.isAdmin
            ? "Créez d'abord les départements de l'entreprise puis nommez leurs chefs. Vous pourrez ensuite transmettre des documents."
            : "Le DG doit encore créer les départements et nommer leurs chefs. Revenez un peu plus tard."
        }
        action={
          me?.isAdmin ? (
            <Button onClick={onManageDepartments} className="gap-2">
              <Building2 className="size-4" />
              Gérer les départements
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
          Transmettez un ou plusieurs fichiers vers une ou plusieurs directions/services ; précisez l&apos;objet, la personne au nom de
          qui vous envoyez et les tâches à réaliser.
        </p>
      </div>

      <Card className="border-border/80 ">
        <CardContent className="space-y-6 pt-6">
          <StepDots steps={STEPS} current={step} />

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
                  Le contenu du document est analysé automatiquement pour
                  produire un résumé que le destinataire lira avant le document
                  complet.
                </p>
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-4">
              <div className="flex items-start gap-2 rounded-sm border-l-4 border-brand-sky bg-brand-soft/70 px-4 py-3 text-xs leading-relaxed">
                <Info className="mt-0.5 size-4 shrink-0 text-brand-sky" />
                <p className="font-medium text-foreground">
                  Choisissez une ou plusieurs <strong>directions</strong> ou{" "}
                  <strong>services</strong> destinataires (cliquez pour
                  sélectionner / désélectionner). Les utilisateurs sont
                  membres des services ; un envoi à une direction est visible
                  par ses services. Vous n&apos;envoyez plus à une personne
                  nommée, mais à une structure.
                </p>
              </div>
              {destIds.length > 0 ? (
                <p className="text-xs font-medium text-foreground">
                  {destIds.length} destination{destIds.length > 1 ? "s" : ""} sélectionnée{destIds.length > 1 ? "s" : ""}
                </p>
              ) : null}
              {departments === undefined ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {departments.map((department) => {
                    const active = destIds.includes(department._id);
                    return (
                      <button
                        key={department._id}
                        type="button"
                        onClick={() => {
                          toggleDest(department._id);
                          setRecipientId(null);
                          setCircuitExtra([]);
                        }}
                        className={cn(
                          "rounded-sm border p-4 text-left transition-all",
                          active
                            ? "border-brand bg-brand-soft  "
                            : "border-border bg-card hover:border-brand-sky/50",
                        )}
                      >
                        <div className="flex items-center justify-between">
                          {"logoUrl" in department && department.logoUrl ? (
                            <img
                              src={department.logoUrl as string}
                              alt=""
                              className="size-10 rounded-lg border object-cover"
                            />
                          ) : (
                            <div className="flex size-10 items-center justify-center rounded-lg bg-brand text-primary-foreground">
                              <Building2 className="size-4" />
                            </div>
                          )}
                          {active ? (
                            <CheckCircle2 className="size-4 text-brand" />
                          ) : null}
                        </div>
                        <p className="mt-3 text-sm font-semibold">
                          {department.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {(department as { parentName?: string | null; kind?: string | null })
                            .parentName
                            ? `Service de ${(department as { parentName?: string | null }).parentName}`
                            : (department as { kind?: string | null }).kind === "service"
                              ? "Service"
                              : (department as { kind?: string | null }).kind === "direction"
                                ? "Direction / Département"
                                : (department as { kind?: string | null }).kind === "sg"
                                  ? "Secrétariat Général"
                                  : (department as { kind?: string | null }).kind === "cabinet"
                                    ? "Cabinet"
                                    : "Structure"}
                          {" · "}
                          {department.members.length} membre
                          {department.members.length > 1 ? "s" : ""}
                          {department.chief
                            ? ` · chef : ${department.chief.name}`
                            : ""}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}

          {false && step === 2 ? (
            <div className="space-y-3" data-scandoc-tour="send-recipient">
              <p className="text-xs text-muted-foreground">
                Destination :{" "}
                <span className="font-medium text-foreground">
                  {selectedDepartment?.name}
                </span>
              </p>
              <button
                type="button"
                onClick={() => setRecipientId(null)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-sm border p-3 text-left transition-all",
                  !recipientId
                    ? "border-brand bg-brand-soft"
                    : "border-border bg-card hover:border-brand-sky/50",
                )}
              >
                <span className="flex size-9 items-center justify-center rounded-full bg-brand text-xs font-semibold text-primary-foreground">
                  ∑
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">
                    Toute la structure
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Tous les membres de cette direction ou de ce service
                    recevront le document.
                  </span>
                </span>
              </button>
              <p className="text-[11px] text-muted-foreground">
                Optionnel — restreindre à une personne (confidentiel) :
              </p>
              {selectableMembers.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Aucun membre inscrit pour l&apos;instant : l&apos;envoi
                  structurel reste possible ; les futurs membres verront le
                  dossier selon les règles d&apos;appartenance.
                </p>
              ) : (
                <ul className="space-y-2">
                  {selectableMembers.map((member) => {
                    const active = member._id === recipientId;
                    return (
                      <li key={member._id}>
                        <button
                          type="button"
                          onClick={() => setRecipientId(member._id)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-sm border p-3 text-left transition-all",
                            active
                              ? "border-brand bg-brand-soft  "
                              : "border-border bg-card hover:border-brand-sky/50",
                          )}
                        >
                          <span className="relative flex size-9 items-center justify-center rounded-full bg-brand text-xs font-semibold text-primary-foreground">
                            {initialsOf(member.name)}
                            <PresenceDot
                              online={isOnline(
                                (member as { lastSeenAt?: number | null })
                                  .lastSeenAt,
                              )}
                              className="absolute bottom-0 right-0"
                            />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {member.name}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {member.email ?? "—"}
                              {" · "}
                              {isOnline(
                                (member as { lastSeenAt?: number | null })
                                  .lastSeenAt,
                              )
                                ? "En ligne"
                                : "Hors ligne"}
                            </span>
                          </span>
                          <Badge
                            variant="outline"
                            className="border-emerald-200 bg-emerald-50 text-[10px] text-emerald-800"
                          >
                            Validé
                          </Badge>
                          {member.departmentRole === "chef" ? (
                            <Badge
                              variant="outline"
                              className="border-brand-sky/30 bg-brand-soft text-[10px] text-brand-sky"
                            >
                              Chef
                            </Badge>
                          ) : null}
                          {active ? (
                            <CheckCircle2 className="size-4 text-brand" />
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {recipientId ? (
                <div className="mt-4 space-y-2 rounded-sm border border-dashed border-border p-3">
                  <p className="text-sm font-medium text-foreground">
                    Circuit de traitement (optionnel)
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Après le destinataire principal, le document passera
                    aux personnes suivantes dans l&apos;ordre — y compris
                    d&apos;autres départements. Le document n&apos;est « traité »
                    qu&apos;à la dernière étape.
                  </p>
                  <ol className="space-y-1 text-xs">
                    <li className="flex items-center gap-2 rounded-md bg-brand-soft/50 px-2 py-1.5">
                      <span className="flex size-5 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-primary-foreground">
                        1
                      </span>
                      <span className="font-medium">
                        {selectedRecipient?.name ?? "Destinataire"}
                      </span>
                      <span className="text-muted-foreground">(en premier)</span>
                    </li>
                    {circuitExtra.map((c, i) => (
                      <li
                        key={c.userId}
                        className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5"
                      >
                        <span className="flex size-5 items-center justify-center rounded-full bg-muted text-[10px] font-bold">
                          {i + 2}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {c.name}
                          {c.dept ? (
                            <span className="text-muted-foreground"> · {c.dept}</span>
                          ) : null}
                        </span>
                        <button
                          type="button"
                          className="text-[10px] text-destructive"
                          onClick={() =>
                            setCircuitExtra((prev) =>
                              prev.filter((x) => x.userId !== c.userId),
                            )
                          }
                        >
                          Retirer
                        </button>
                      </li>
                    ))}
                  </ol>
                  <div className="pt-1 space-y-2">
                    <p className="text-[11px] text-muted-foreground">
                      Ajouter une étape suivante (tous départements) :
                    </p>
                    {(departments ?? []).map((dep) => {
                      const candidates = (dep.members ?? []).filter(
                        (m) =>
                          m._id !== recipientId &&
                          m._id !== me?.user._id &&
                          !circuitExtra.some((c) => c.userId === m._id),
                      );
                      if (candidates.length === 0) return null;
                      return (
                        <div key={dep._id}>
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {dep.name}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {candidates.map((m) => (
                              <button
                                key={m._id}
                                type="button"
                                className="rounded-full border border-border px-2.5 py-1 text-[11px] hover:border-brand hover:bg-brand-soft"
                                onClick={() =>
                                  setCircuitExtra((prev) => [
                                    ...prev,
                                    {
                                      userId: m._id,
                                      name: m.name,
                                      dept: dep.name,
                                    },
                                  ])
                                }
                              >
                                + {m.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    {allCircuitCandidates.filter(
                      (c) =>
                        c.userId !== recipientId &&
                        !circuitExtra.some((x) => x.userId === c.userId),
                    ).length === 0 ? (
                      <p className="text-[11px] text-muted-foreground">
                        Aucun autre intervenant disponible.
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}

            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="publicRef">Identifiant du dossier</Label>
                <Input
                  id="publicRef"
                  value={publicRef}
                  onChange={(e) =>
                    setPublicRef(e.target.value.toUpperCase().trim())
                  }
                  placeholder="Ex. SD-2026-BUDGET-01"
                  className="font-mono"
                  autoComplete="off"
                />
                <p className="text-[11px] text-muted-foreground">
                  Nouvel envoi : choisissez un identifiant unique. Continuation
                  de circuit : saisissez l&apos;identifiant existant (le système
                  propose le prochain destinataire).
                </p>
                {refLookup?.found && !refLookup.isClosed ? (
                  <div
                    className={
                      refLookup.isMyTurn
                        ? "rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900"
                        : "rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950"
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
                <Label htmlFor="sla">Délai max par étape (heures)</Label>
                <Input
                  id="sla"
                  type="number"
                  min={1}
                  max={168}
                  value={stepDeadlineHours}
                  onChange={(e) =>
                    setStepDeadlineHours(
                      Math.min(168, Math.max(1, Number(e.target.value) || 48)),
                    )
                  }
                />
                <p className="text-[11px] text-muted-foreground">
                  Au-delà, le dossier apparaît en retard (défaut 48 h). Max 7
                  jours par étape.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="objet">Objet de l&apos;envoi</Label>
                <Textarea
                  id="objet" data-scandoc-tour="send-objet"
                  value={objet}
                  onChange={(e) => setObjet(e.target.value)}
                  placeholder="Ex : Transmission du rapport trimestriel pour validation et signature"
                  rows={2}
                />
                <p className="text-xs text-muted-foreground">
                  Indiquez pourquoi vous envoyez ce document.
                </p>
              </div>

              <div className="space-y-3">
                <Label>De la part de qui</Label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setOnBehalfType("internal");
                      setOnBehalfName("");
                      setOnBehalfFunction("");
                      setOnBehalfDepartmentText("");
                    }}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                      onBehalfType === "internal"
                        ? "border-brand bg-brand text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:border-brand-sky/40",
                    )}
                  >
                    Personne du service
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOnBehalfType("external");
                      setOnBehalfDepartmentId(null);
                      setOnBehalfUserId(null);
                    }}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                      onBehalfType === "external"
                        ? "border-brand bg-brand text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:border-brand-sky/40",
                    )}
                  >
                    Personne externe / autre
                  </button>
                </div>

                {onBehalfType === "internal" ? (
                  <div className="space-y-3 rounded-sm border border-border bg-card p-4">
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">
                        1. Département
                      </p>
                      {departments === undefined ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {departments.map((d) => (
                            <button
                              key={d._id}
                              type="button"
                              onClick={() => {
                                setOnBehalfDepartmentId(d._id);
                                setOnBehalfUserId(null);
                              }}
                              className={cn(
                                "rounded-sm border px-3 py-1.5 text-xs transition-colors",
                                onBehalfDepartmentId === d._id
                                  ? "border-brand bg-brand-soft text-brand"
                                  : "border-border hover:border-brand-sky/50",
                              )}
                            >
                              {d.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {onBehalfDepartmentId ? (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">
                          2. Personne
                        </p>
                        {onBehalfMembers.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            Aucun membre dans ce département.
                          </p>
                        ) : (
                          <ul className="max-h-40 space-y-1 overflow-y-auto">
                            {onBehalfMembers.map((member) => {
                              const active = member._id === onBehalfUserId;
                              return (
                                <li key={member._id}>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setOnBehalfUserId(member._id)
                                    }
                                    className={cn(
                                      "flex w-full items-center gap-2 rounded-sm border px-3 py-2 text-left text-sm transition-all",
                                      active
                                        ? "border-brand bg-brand-soft"
                                        : "border-border hover:border-brand-sky/50",
                                    )}
                                  >
                                    <span className="flex size-7 items-center justify-center rounded-full bg-brand text-[10px] font-semibold text-primary-foreground">
                                      {initialsOf(member.name)}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate">
                                      {member.name}
                                      {member.fonction
                                        ? ` · ${member.fonction}`
                                        : ""}
                                    </span>
                                    {active ? (
                                      <CheckCircle2 className="size-4 shrink-0 text-brand" />
                                    ) : null}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="space-y-3 rounded-sm border border-border bg-card p-4">
                    <div className="space-y-2">
                      <Label htmlFor="onBehalfName">
                        Nom <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="onBehalfName"
                        value={onBehalfName}
                        onChange={(e) => setOnBehalfName(e.target.value)}
                        placeholder="Nom complet"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="onBehalfFunction">Fonction</Label>
                      <Input
                        id="onBehalfFunction"
                        value={onBehalfFunction}
                        onChange={(e) => setOnBehalfFunction(e.target.value)}
                        placeholder="Ex : Directeur commercial"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="onBehalfDept">
                        Département{" "}
                        <span className="text-muted-foreground">
                          (optionnel)
                        </span>
                      </Label>
                      <Input
                        id="onBehalfDept"
                        value={onBehalfDepartmentText}
                        onChange={(e) =>
                          setOnBehalfDepartmentText(e.target.value)
                        }
                        placeholder="Ex : Direction générale"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <Label>
              <div className="space-y-2">
                <Label htmlFor="observations">Observations / instructions</Label>
                <Textarea
                  id="observations" data-scandoc-tour="send-observations"
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                  placeholder="Ex. DTD : M'en parler"
                  rows={3}
                  className="resize-y"
                />
                <p className="text-[11px] text-muted-foreground">
                  Zone Observations de la fiche de transmission MNDPT.
                </p>
              </div>

                  <span data-scandoc-tour="send-tasks">Tâches à réaliser{" "}</span>
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
                    placeholder="Ex : Vérifier les annexes et renvoyer avant vendredi"
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
                  Récapitulatif
                </p>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Document</dt>
                    <dd className="truncate text-right font-medium">
                      {files.length === 1
                        ? files[0]?.name
                        : `${files.length} fichiers`}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground" data-scandoc-tour="send-recipient">Destination</dt>
                    <dd className="text-right font-medium">
                      {destIds
                        .map((id) => {
                          const d = departments?.find((x) => x._id === id);
                          if (!d) return null;
                          const parent = (d as { parentName?: string | null }).parentName;
                          return parent ? `${parent} → ${d.name}` : d.name;
                        })
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </dd>
                  </div>
                  {circuitExtra.length > 0 ? (
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Circuit personnes</dt>
                      <dd className="text-right font-medium">
                        {circuitExtra.map((c) => c.name).join(" → ")}
                      </dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Objet</dt>
                    <dd className="line-clamp-2 text-right font-medium">
                      {objet.trim() || "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">De la part de</dt>
                    <dd className="text-right font-medium">
                      {onBehalfType === "internal"
                        ? (selectedOnBehalfUser?.name ?? "—")
                        : onBehalfName.trim() || "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Observations</dt>
                    <dd className="font-medium whitespace-pre-wrap">
                      {observations.trim() || "—"}
                    </dd>
                    <dt className="text-muted-foreground">Tâches</dt>
                    <dd className="text-right font-medium">
                      {effectiveTasks.length > 0
                        ? effectiveTasks.join(" · ")
                        : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Résumé automatique</dt>
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
              onClick={() => setStep((value) => Math.max(0, value - 1))}
            >
              <ArrowLeft className="size-4" />
              Retour
            </Button>

            {step < STEPS.length - 1 ? (
              <Button
                type="button"
                className="gap-2"
                disabled={!canContinue}
                onClick={() => setStep((value) => value + 1)}
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
