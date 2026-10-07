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
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { EmptyState, StepDots, formatBytes, initialsOf } from "./shared";

const STEPS = ["Document", "Département", "Destinataire", "Objectif & envoi"];

function departmentRoleLabel(role?: string | null) {
  return role === "chef" ? "Chef" : role === "membre" ? "Membre" : "Statut non défini";
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
  const [departmentId, setDepartmentId] = useState<Id<"departments"> | null>(
    null,
  );
  const [recipientId, setRecipientId] = useState<Id<"users"> | null>(null);
  const [objective, setObjective] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [task, setTask] = useState("");
  const [sending, setSending] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const selectedDepartment = departments?.find((d) => d._id === departmentId);
  const selectableMembers =
    selectedDepartment?.members.filter((member) => member._id !== me?.user._id) ??
    [];
  const selectedRecipient = selectedDepartment?.members.find(
    (member) => member._id === recipientId,
  );

  useEffect(() => {
    if (!ownerName.trim() && me?.user?.name) {
      setOwnerName(me.user.name);
    }
  }, [me?.user?.name, ownerName]);

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
    setObjective("");
    setOwnerName(me?.user.name ?? "");
    setTask("");
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
          : objective.trim().length > 3 && task.trim().length > 3;

  const handleSend = async () => {
    // Chefs ne peuvent envoyer qu'aux membres de leur propre département.
    if (
      me?.isChef && !me?.isAdmin && me?.user.departmentId &&
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
        objective: objective.trim(),
        task: task.trim(),
        ownerName: ownerName.trim() || undefined,
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
          Transmettez un fichier en précisant l'objectif, l'origine du document,
          son destinataire et la tâche attendue.
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
                  deux temps — d'abord le département, puis un membre de ce
                  département. Cela évite les erreurs d'affectation.
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
                          {department.chief ? ` · chef : ${department.chief.name}` : ""}
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
                          <Badge
                            variant="outline"
                            className="border-brand-sky/30 bg-brand-soft text-[10px] text-brand-sky"
                          >
                            {departmentRoleLabel(member.departmentRole)}
                          </Badge>
                          {member.departmentRole === "chef" ? (
                            <Badge
                              variant="outline"
                              className="border-brand/30 bg-brand-soft text-[10px] text-brand"
                            >
                              Responsable
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
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="objective">Objectif de l'envoi</Label>
                <Textarea
                  id="objective"
                  value={objective}
                  onChange={(event) => setObjective(event.target.value)}
                  placeholder="Ex : Soumettre ce document pour validation avant transmission officielle."
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ownerName">Document de / transmis par</Label>
                <Input
                  id="ownerName"
                  value={ownerName}
                  onChange={(event) => setOwnerName(event.target.value)}
                  placeholder="Nom de la personne propriétaire ou émettrice du document"
                />
                <p className="text-xs text-muted-foreground">
                  Vous pouvez préciser le propriétaire du document s'il diffère de
                  l'expéditeur connecté.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="task">
                  Tâche à réaliser sur ce document
                </Label>
                <Textarea
                  id="task"
                  value={task}
                  onChange={(event) => setTask(event.target.value)}
                  placeholder="Ex : Vérifier les montants du budget, corriger les écarts puis renvoyer le fichier validé avant vendredi."
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">
                  Soyez précis : le destinataire verra cette consigne en même
                  temps que le résumé automatique.
                </p>
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
                    <dt className="text-muted-foreground">Objectif</dt>
                    <dd className="text-right font-medium">{objective || "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Document de</dt>
                    <dd className="text-right font-medium">{ownerName || "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Envoyé par</dt>
                    <dd className="text-right font-medium">
                      {me?.user.name ?? "—"}
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
