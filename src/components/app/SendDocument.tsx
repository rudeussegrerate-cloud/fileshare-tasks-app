import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  CloudUpload,
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

const STEPS = [
  "Objet & document",
  "Provenance",
  "Département destinataire",
  "Destinataire",
  "Résumé & envoi",
];

type SourceMode = "department" | "other";

function departmentRoleLabel(role?: string | null) {
  return role === "chef"
    ? "Chef"
    : role === "membre"
      ? "Membre"
      : "Statut non défini";
}

const ACCEPT =
  ".pdf,.doc,.docx,.odt,.rtf,.txt,.md,.csv,.xls,.xlsx,.json,.xml,.png,.jpg,.jpeg,.webp";

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

  const [objective, setObjective] = useState("");

  const [sourceMode, setSourceMode] = useState<SourceMode>("department");
  const [sourceDepartmentId, setSourceDepartmentId] = useState<Id<"departments"> | null>(
    null,
  );
  const [sourceUserId, setSourceUserId] = useState<Id<"users"> | null>(null);
  const [externalSourceName, setExternalSourceName] = useState("");
  const [externalSourceFunction, setExternalSourceFunction] = useState("");
  const [externalSourceDepartment, setExternalSourceDepartment] = useState("");

  const [recipientDepartmentId, setRecipientDepartmentId] = useState<Id<"departments"> | null>(
    null,
  );
  const [recipientId, setRecipientId] = useState<Id<"users"> | null>(null);
  const [task, setTask] = useState("");
  const [sending, setSending] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const selectedSourceDepartment = departments?.find((d) => d._id === sourceDepartmentId);
  const selectableSourceMembers = selectedSourceDepartment?.members ?? [];
  const selectedSourceMember = selectedSourceDepartment?.members.find(
    (member) => member._id === sourceUserId,
  );

  const selectedRecipientDepartment = departments?.find(
    (d) => d._id === recipientDepartmentId,
  );
  const selectableRecipientMembers =
    selectedRecipientDepartment?.members.filter(
      (member) => member._id !== me?.user._id,
    ) ?? [];
  const selectedRecipient = selectedRecipientDepartment?.members.find(
    (member) => member._id === recipientId,
  );

  const resolvedSourceName =
    sourceMode === "department"
      ? selectedSourceMember?.name ?? "—"
      : externalSourceName.trim() || "—";
  const resolvedSourceFunction =
    sourceMode === "department"
      ? selectedSourceMember?.fonction ?? "—"
      : externalSourceFunction.trim() || "—";
  const resolvedSourceDepartment =
    sourceMode === "department"
      ? selectedSourceDepartment?.name ?? "—"
      : externalSourceDepartment.trim() || "—";

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
    setObjective("");
    setSourceMode("department");
    setSourceDepartmentId(null);
    setSourceUserId(null);
    setExternalSourceName("");
    setExternalSourceFunction("");
    setExternalSourceDepartment("");
    setRecipientDepartmentId(null);
    setRecipientId(null);
    setTask("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  const canContinue =
    step === 0
      ? objective.trim().length > 3 && Boolean(file)
      : step === 1
        ? sourceMode === "department"
          ? Boolean(sourceDepartmentId && sourceUserId)
          : externalSourceName.trim().length > 2 &&
            externalSourceFunction.trim().length > 1
        : step === 2
          ? Boolean(recipientDepartmentId)
          : step === 3
            ? Boolean(recipientId)
            : task.trim().length > 3;

  const handleSend = async () => {
    // Chefs ne peuvent envoyer qu'aux membres de leur propre département.
    if (
      me?.isChef && !me?.isAdmin && me?.user.departmentId &&
      recipientDepartmentId !== me.user.departmentId
    ) {
      toast.error(
        "Vous ne pouvez envoyer un document qu'aux membres de votre propre département.",
      );
      return;
    }
    if (!file || !recipientId) return;

    if (sourceMode === "department" && (!sourceDepartmentId || !sourceUserId)) {
      toast.error("Choisissez la provenance du document.");
      return;
    }
    if (
      sourceMode === "other" &&
      (externalSourceName.trim().length < 3 ||
        externalSourceFunction.trim().length < 2)
    ) {
      toast.error("Complétez les informations de provenance.");
      return;
    }

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
        objective: objective.trim(),
        task: task.trim(),
        ownerName: resolvedSourceName !== "—" ? resolvedSourceName : undefined,
        sourceType: sourceMode === "department" ? "departement" : "autre",
        sourceUserId: sourceMode === "department" ? sourceUserId ?? undefined : undefined,
        sourceName: sourceMode === "other" ? externalSourceName.trim() : undefined,
        sourceFunction:
          sourceMode === "other" ? externalSourceFunction.trim() : undefined,
        sourceDepartmentName:
          sourceMode === "other" && externalSourceDepartment.trim()
            ? externalSourceDepartment.trim()
            : undefined,
        extractedText: extractedText || undefined,
        recipientId,
      });

      toast.success("Document envoyé !", {
        description: "Le résumé automatique est en cours de génération.",
      });
      reset();
      onSent(documentId);
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : "Impossible d'envoyer le document.",
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
          Définissez d'abord l'objet, la provenance, puis le destinataire avant
          validation finale.
        </p>
      </div>

      <Card className="border-border/80 shadow-none">
        <CardContent className="space-y-6 pt-6">
          <StepDots steps={STEPS} current={step} />

          {step === 0 ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="objective">Objet de l'envoi</Label>
                <Textarea
                  id="objective"
                  value={objective}
                  onChange={(event) => setObjective(event.target.value)}
                  placeholder="Ex : Transmission du dossier pour validation finale"
                  rows={3}
                />
              </div>

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
                          : " · pas de texte lisible, résumé contextuel"}
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
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    void handleFile(event.dataTransfer.files?.[0] ?? null);
                  }}
                  className="flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-card px-6 py-12 text-center transition-colors hover:border-brand-sky/60 hover:bg-brand-soft/40"
                >
                  <div className="flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand">
                    <CloudUpload className="size-6" />
                  </div>
                  <p className="mt-4 text-sm font-medium">
                    Glissez un fichier ici ou cliquez pour parcourir
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    PDF, Word, Excel, image ou texte · 10 Mo maximum
                  </p>
                </button>
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
                onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
              />
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Provenance du document</Label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={sourceMode === "department" ? "default" : "outline"}
                    onClick={() => {
                      setSourceMode("department");
                      setExternalSourceName("");
                      setExternalSourceFunction("");
                      setExternalSourceDepartment("");
                    }}
                  >
                    Personne d'un département existant
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={sourceMode === "other" ? "default" : "outline"}
                    onClick={() => {
                      setSourceMode("other");
                      setSourceDepartmentId(null);
                      setSourceUserId(null);
                    }}
                  >
                    Autre
                  </Button>
                </div>
              </div>

              {sourceMode === "department" ? (
                <div className="space-y-4">
                  <p className="text-xs text-muted-foreground">
                    Choisissez le département d'origine, puis la personne.
                  </p>
                  {departments === undefined ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {departments.map((department) => {
                        const active = department._id === sourceDepartmentId;
                        return (
                          <button
                            key={department._id}
                            type="button"
                            onClick={() => {
                              setSourceDepartmentId(department._id);
                              setSourceUserId(null);
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
                            <p className="mt-3 text-sm font-semibold">{department.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {department.members.length} membre
                              {department.members.length > 1 ? "s" : ""}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {sourceDepartmentId ? (
                    selectableSourceMembers.length === 0 ? (
                      <EmptyState
                        icon={UserRound}
                        title="Aucun membre"
                        description="Ce département ne contient personne pour l'instant."
                      />
                    ) : (
                      <ul className="space-y-2">
                        {selectableSourceMembers.map((member) => {
                          const active = member._id === sourceUserId;
                          return (
                            <li key={member._id}>
                              <button
                                type="button"
                                onClick={() => setSourceUserId(member._id)}
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
                                    {member.fonction ?? "Fonction non définie"}
                                  </span>
                                </span>
                                <Badge
                                  variant="outline"
                                  className="border-brand-sky/30 bg-brand-soft text-[10px] text-brand-sky"
                                >
                                  {departmentRoleLabel(member.departmentRole)}
                                </Badge>
                                {active ? (
                                  <CheckCircle2 className="size-4 text-brand" />
                                ) : null}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )
                  ) : null}
                </div>
              ) : (
                <div className="space-y-3 rounded-xl border border-border bg-card p-4">
                  <div className="space-y-2">
                    <Label htmlFor="sourceName">Nom de la personne</Label>
                    <Input
                      id="sourceName"
                      value={externalSourceName}
                      onChange={(event) => setExternalSourceName(event.target.value)}
                      placeholder="Nom complet"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sourceFunction">Fonction</Label>
                    <Input
                      id="sourceFunction"
                      value={externalSourceFunction}
                      onChange={(event) =>
                        setExternalSourceFunction(event.target.value)}
                      placeholder="Ex : Consultant, Fournisseur, Directeur..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sourceDepartment">
                      Département (optionnel)
                    </Label>
                    <Input
                      id="sourceDepartment"
                      value={externalSourceDepartment}
                      onChange={(event) =>
                        setExternalSourceDepartment(event.target.value)}
                      placeholder="Ex : Partenaire externe"
                    />
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-4">
              <div className="flex items-start gap-2 rounded-lg border-l-4 border-brand-sky bg-brand-soft/70 px-4 py-3 text-xs leading-relaxed">
                <Info className="mt-0.5 size-4 shrink-0 text-brand-sky" />
                <p className="font-medium text-foreground">
                  Le destinataire se choisit en deux temps : département puis
                  membre.
                </p>
              </div>
              {departments === undefined ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {departments.map((department) => {
                    const active = department._id === recipientDepartmentId;
                    return (
                      <button
                        key={department._id}
                        type="button"
                        onClick={() => {
                          setRecipientDepartmentId(department._id);
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
                        <p className="mt-3 text-sm font-semibold">{department.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {department.members.length} membre
                          {department.members.length > 1 ? "s" : ""}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Département :{" "}
                <span className="font-medium text-foreground">
                  {selectedRecipientDepartment?.name}
                </span>
              </p>
              {selectableRecipientMembers.length === 0 ? (
                <EmptyState
                  icon={UserRound}
                  title="Aucun membre dans ce département"
                  description="Choisissez un autre département ou demandez au chef d'ajouter des membres."
                />
              ) : (
                <ul className="space-y-2">
                  {selectableRecipientMembers.map((member) => {
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
                              {member.fonction ?? member.email ?? "—"}
                            </span>
                          </span>
                          <Badge
                            variant="outline"
                            className="border-brand-sky/30 bg-brand-soft text-[10px] text-brand-sky"
                          >
                            {departmentRoleLabel(member.departmentRole)}
                          </Badge>
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

          {step === 4 ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="task">Instruction au destinataire</Label>
                <Textarea
                  id="task"
                  value={task}
                  onChange={(event) => setTask(event.target.value)}
                  placeholder="Ex : Vérifier, corriger et valider ce document avant vendredi."
                  rows={4}
                />
              </div>

              <div className="flex items-start gap-2 rounded-lg border border-brand-sky/25 bg-brand-soft/60 px-4 py-3 text-xs text-muted-foreground">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-brand-sky" />
                <p>
                  Le résumé automatique sera généré à partir du contenu du fichier
                  et des informations de contexte que vous avez renseignées.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-brand-soft/40 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Récapitulatif
                </p>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Objet</dt>
                    <dd className="text-right font-medium">{objective || "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Document</dt>
                    <dd className="truncate text-right font-medium">{file?.name}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Provenance</dt>
                    <dd className="text-right font-medium">{resolvedSourceName}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Fonction source</dt>
                    <dd className="text-right font-medium">{resolvedSourceFunction}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Département source</dt>
                    <dd className="text-right font-medium">{resolvedSourceDepartment}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Destinataire</dt>
                    <dd className="text-right font-medium">
                      {selectedRecipient?.name}
                      {selectedRecipient?.departmentRole
                        ? ` (${departmentRoleLabel(selectedRecipient.departmentRole)})`
                        : ""}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Résumé automatique</dt>
                    <dd className="text-right font-medium">
                      {extracting
                        ? "en préparation…"
                        : extractedText
                          ? "activé"
                          : "contextuel (photo/scan)"}
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
