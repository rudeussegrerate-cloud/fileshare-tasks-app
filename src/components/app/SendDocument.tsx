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
import { EmptyState, StepDots, formatBytes, initialsOf } from "./shared";

const STEPS = ["Document", "Département", "Destinataire", "Détails & envoi"];

const ACCEPT =
  ".pdf,.doc,.docx,.odt,.rtf,.txt,.md,.csv,.xls,.xlsx,.json,.xml,.png,.jpg,.jpeg,.webp";

/** Tâches prédéfinies (cases à cocher multiples) */
export const PREDEFINED_TASKS = [
  "Pour compte rendu",
  "Pour compétence",
  "Pour signature",
  "Pour études",
  "Pour avis",
  "Pour documentation",
  "Pour information",
  "Suite a votre demande",
  "Prière de m'en parler",
  "Prière de nous représenter",
  "Pour affichage",
  "Pour attribution",
  "Pour suite a donner",
  "Pour exploitation",
  "Réunion a ce sujet",
  "Après visa",
  "Urgent",
  "Pour classement",
  "Pour large diffusion",
] as const;

export function SendDocument({
  onSent,
  onManageDepartments,
}: {
  onSent: (documentId: Id<"documents">) => void;
  onManageDepartments: () => void;
}) {
  const me = useQuery(api.workspace.me);
  const departments = useQuery(api.workspace.listDepartments);
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const sendDocument = useMutation(api.documents.send);

  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [extractedText, setExtractedText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [departmentId, setDepartmentId] = useState<Id<"departments"> | null>(
    null,
  );
  const [recipientId, setRecipientId] = useState<Id<"users"> | null>(null);

  // Objet de l'envoi
  const [objet, setObjet] = useState("");

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

  const handleFile = async (next: File | null) => {
    if (!next) return;
    if (next.size > MAX_FILE_BYTES) {
      toast.error("Fichier trop volumineux", {
        description: "La taille maximale est de 10 Mo.",
      });
      return;
    }
    setFile(next);
    setExtracting(true);
    const text = await extractTextFromFile(next);
    setExtractedText(text);
    setExtracting(false);
  };

  const reset = () => {
    setStep(0);
    setFile(null);
    setExtractedText("");
    setDepartmentId(null);
    setRecipientId(null);
    setObjet("");
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
      ? Boolean(file)
      : step === 1
        ? Boolean(departmentId)
        : step === 2
          ? Boolean(recipientId)
          : (() => {
              if (!objet.trim()) return false;
              if (selectedTasks.length === 0 && !customTask.trim()) return false;
              if (onBehalfType === "internal") {
                return Boolean(onBehalfUserId);
              }
              return onBehalfName.trim().length > 0;
            })();

  const handleSend = async () => {
    if (
      me?.isChef &&
      !me?.isAdmin &&
      me?.user.departmentId &&
      departmentId !== me.user.departmentId
    ) {
      toast.error(
        "Vous ne pouvez envoyer un document qu'aux membres de votre propre département.",
      );
      return;
    }
    if (!file || !recipientId) return;
    setSending(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: file.type
          ? { "Content-Type": file.type }
          : { "Content-Type": "application/octet-stream" },
        body: file,
      });
      if (!response.ok) throw new Error("L'envoi du fichier a échoué.");
      const { storageId } = (await response.json()) as {
        storageId: Id<"_storage">;
      };

      const documentId = await sendDocument({
        storageId,
        fileName: file.name,
        contentType: file.type || undefined,
        size: file.size,
        objet: objet.trim(),
        tasks: effectiveTasks,
        extractedText: extractedText || undefined,
        recipientId,
        onBehalfOfType: onBehalfType,
        onBehalfOfUserId:
          onBehalfType === "internal" ? onBehalfUserId ?? undefined : undefined,
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

      toast.success("Document envoyé !", {
        description: "Le résumé automatique est en cours de génération.",
      });
      reset();
      onSent(documentId);
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Impossible d'envoyer le document.",
      );
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
          Envoyer un document
        </h2>
        <p className="text-xs text-muted-foreground">
          Transmettez un fichier, précisez l&apos;objet, la personne au nom de
          qui vous envoyez et les tâches à réaliser.
        </p>
      </div>

      <Card className="border-border/80 shadow-none">
        <CardContent className="space-y-6 pt-6">
          <StepDots steps={STEPS} current={step} />

          {step === 0 ? (
            <div className="space-y-4">
              {file ? (
                <div className="flex items-center gap-4 rounded-xl border border-border bg-brand-soft/50 p-4">
                  <div className="flex size-11 items-center justify-center rounded-lg bg-card text-brand shadow-sm">
                    <FileText className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatBytes(file.size)}
                      {extracting
                        ? " · lecture du contenu…"
                        : extractedText
                          ? " · texte extrait pour le résumé automatique"
                          : " · pas de texte lisible, résumé indisponible"}
                    </p>
                  </div>
                  {extracting ? (
                    <Loader2 className="size-4 animate-spin text-brand-sky" />
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setFile(null);
                        setExtractedText("");
                      }}
                    >
                      <X className="size-4" />
                    </Button>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  PDF, Word, Excel, image ou texte · 10 Mo maximum
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
                  Importer un fichier
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
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(event) =>
                  void handleFile(event.target.files?.[0] ?? null)
                }
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(event) =>
                  void handleFile(event.target.files?.[0] ?? null)
                }
              />

              <div className="flex items-start gap-2 rounded-lg border border-brand-sky/25 bg-brand-soft/60 px-4 py-3 text-xs text-muted-foreground">
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
              <div className="flex items-start gap-2 rounded-lg border-l-4 border-brand-sky bg-brand-soft/70 px-4 py-3 text-xs leading-relaxed">
                <Info className="mt-0.5 size-4 shrink-0 text-brand-sky" />
                <p className="font-medium text-foreground">
                  Règle fondamentale : le destinataire se choisit toujours en
                  deux temps — d&apos;abord le département, puis un membre de ce
                  département. Cela évite les erreurs d&apos;affectation.
                </p>
              </div>
              {departments === undefined ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {departments.map((department) => {
                    const active = department._id === departmentId;
                    return (
                      <button
                        key={department._id}
                        type="button"
                        onClick={() => {
                          setDepartmentId(department._id);
                          setRecipientId(null);
                        }}
                        className={cn(
                          "rounded-xl border p-4 text-left transition-all",
                          active
                            ? "border-brand bg-brand-soft shadow-sm ring-1 ring-brand/20"
                            : "border-border bg-card hover:border-brand-sky/50",
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex size-9 items-center justify-center rounded-lg bg-brand text-primary-foreground">
                            <Building2 className="size-4" />
                          </div>
                          {active ? (
                            <CheckCircle2 className="size-4 text-brand" />
                          ) : null}
                        </div>
                        <p className="mt-3 text-sm font-semibold">
                          {department.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
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

          {step === 2 ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Département :{" "}
                <span className="font-medium text-foreground">
                  {selectedDepartment?.name}
                </span>
              </p>
              {selectableMembers.length === 0 ? (
                <EmptyState
                  icon={UserRound}
                  title="Aucun membre dans ce département"
                  description="Choisissez un autre département ou demandez au chef d'ajouter des membres."
                />
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
                            "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all",
                            active
                              ? "border-brand bg-brand-soft shadow-sm ring-1 ring-brand/20"
                              : "border-border bg-card hover:border-brand-sky/50",
                          )}
                        >
                          <span className="flex size-9 items-center justify-center rounded-full bg-brand text-xs font-semibold text-primary-foreground">
                            {initialsOf(member.name)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {member.name}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {member.email ?? "—"}
                            </span>
                          </span>
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
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="objet">Objet de l&apos;envoi</Label>
                <Textarea
                  id="objet"
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
                  <div className="space-y-3 rounded-xl border border-border bg-card p-4">
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
                                "rounded-lg border px-3 py-1.5 text-xs transition-colors",
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
                                      "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-all",
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
                  <div className="space-y-3 rounded-xl border border-border bg-card p-4">
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
                  Tâches à réaliser{" "}
                  <span className="font-normal text-muted-foreground">
                    (plusieurs choix possibles)
                  </span>
                </Label>
                <div className="grid max-h-56 gap-2 overflow-y-auto rounded-xl border border-border bg-card p-3 sm:grid-cols-2">
                  {PREDEFINED_TASKS.map((task) => {
                    const checked = selectedTasks.includes(task);
                    return (
                      <label
                        key={task}
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
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

              <div className="rounded-xl border border-border bg-brand-soft/40 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Récapitulatif
                </p>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Document</dt>
                    <dd className="truncate text-right font-medium">
                      {file?.name}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Département</dt>
                    <dd className="text-right font-medium">
                      {selectedDepartment?.name}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Destinataire</dt>
                    <dd className="text-right font-medium">
                      {selectedRecipient?.name}
                    </dd>
                  </div>
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
