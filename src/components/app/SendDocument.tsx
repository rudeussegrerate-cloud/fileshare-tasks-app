import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { MAX_FILE_BYTES, extractTextFromFile, renderCoverThumbnail } from "@/lib/extract-text";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Camera,
  CheckCircle2,
  FileText,
  Loader2,
  Plus,
  Send,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { PresenceDot } from "./PresenceDot";
import { EmptyState, formatBytes, initialsOf , PREDEFINED_TASKS } from "./shared";

const ONLINE_MS = 2 * 60 * 1000;
function isOnline(lastSeenAt?: number | null) {
  return Boolean(lastSeenAt && Date.now() - lastSeenAt < ONLINE_MS);
}



const ACCEPT_DOCS =
  ".pdf,.doc,.docx,.odt,.rtf,.txt,.md,.csv,.xls,.xlsx,.json,.xml,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,text/csv";

const ACCEPT_PHOTOS = "image/*,.png,.jpg,.jpeg,.webp,.heic,.heif,.gif";

const DOC_EXT = new Set([
  "pdf", "doc", "docx", "odt", "rtf", "txt", "md", "csv", "xls", "xlsx", "json", "xml",
]);
const PHOTO_EXT = new Set(["png", "jpg", "jpeg", "webp", "heic", "heif", "gif", "bmp"]);

type FilePickKind = "document" | "photo";

function fileExtension(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

function isDocumentFile(file: File) {
  const ext = fileExtension(file.name);
  if (DOC_EXT.has(ext)) return true;
  const t = (file.type || "").toLowerCase();
  if (!t) return DOC_EXT.has(ext);
  if (t.startsWith("image/")) return false;
  return (
    t.startsWith("application/") ||
    t.startsWith("text/") ||
    t === "application/pdf"
  );
}

function isPhotoFile(file: File) {
  const ext = fileExtension(file.name);
  if (PHOTO_EXT.has(ext)) return true;
  return (file.type || "").toLowerCase().startsWith("image/");
}

export function SendDocument({
  onSent,
  onManageDepartments,
  initialPublicRef,
  replyTo,
  mode = "envoi",
}: {
  onSent: (documentId?: Id<"documents">) => void;
  onManageDepartments: () => void;
  /** envoi = N° officiel · transmission = papier (Réf. seule) */
  mode?: "envoi" | "transmission";
  /** Préremplir le N° (optionnel). */
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
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const sendDocument = useMutation(api.documents.send);

  const isTransmission = mode === "transmission";
  const [step, setStep] = useState(0);
  // L'étape « Qui envoie » (index 2) est sautée : émetteur = profil connecté
  const goNext = () => setStep((s) => (s === 1 ? 3 : Math.min(3, s + 1)));
  const goBack = () => setStep((s) => (s === 3 ? 1 : Math.max(0, s - 1)));

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
  /** Autres directions/services destinataires (en plus de la destination principale) */
  const [extraDestIds, setExtraDestIds] = useState<Id<"departments">[]>([]);

  // Objet / références du courrier
  const [objet, setObjet] = useState(
    replyTo?.objet ? `Réponse à : ${replyTo.objet}` : "",
  );
  const [observations, setObservations] = useState("");
  const [referenceText, setReferenceText] = useState(
    replyTo?.publicRef ? replyTo.publicRef : "",
  );
  const [requiresResponse, setRequiresResponse] = useState(false);
  const [arriveeLe, setArriveeLe] = useState("");
  const [duField, setDuField] = useState("");
  const [dateCourrier, setDateCourrier] = useState("");
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [thumbUrls, setThumbUrls] = useState<Record<number, string>>({});

  const [publicRef, setPublicRef] = useState(initialPublicRef ?? "");
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
  const selectedRecipient = (() => {
    if (!recipientId) return null;
    for (const id of destIds) {
      const d = departments?.find((x) => x._id === id);
      const m = d?.members?.find((member) => member._id === recipientId);
      if (m) return m;
    }
    return (
      departments
        ?.flatMap((d) => d.members ?? [])
        .find((member) => member._id === recipientId) ?? null
    );
  })();

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

  const handleFiles = async (
    list: FileList | File[] | null,
    kind: FilePickKind = "document",
  ) => {
    if (!list || (Array.isArray(list) ? list.length === 0 : list.length === 0))
      return;
    const incoming = Array.from(list as FileList | File[]);
    const accepted: File[] = [];
    for (const next of incoming) {
      if (next.size > MAX_FILE_BYTES) {
        toast.error(`« ${next.name} » trop volumineux (max 10 Mo)`);
        continue;
      }
      if (kind === "document" && !isDocumentFile(next)) {
        toast.error(
          `« ${next.name} » n'est pas un document accepté (PDF, Word, Excel, texte…). Utilisez « Prendre une photo » pour une image.`,
        );
        continue;
      }
      if (kind === "photo" && !isPhotoFile(next)) {
        toast.error(
          `« ${next.name} » n'est pas une photo. Utilisez « Ajouter des fichiers » pour un document (PDF, Word…).`,
        );
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
    setFiles((prev) => {
      const next = prev.filter((_, i) => i !== index);
      setPreviewIndex((pi) => {
        if (pi === null) return null;
        if (next.length === 0) return null;
        if (pi === index) return null;
        if (pi > index) return pi - 1;
        return pi;
      });
      return next;
    });
  };

  /** Ouvre le fichier dans le visualiseur / éditeur du navigateur ou de l'appareil. */
  const openFilePreview = (index: number) => {
    const file = files[index];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const win = window.open(url, "_blank", "noopener,noreferrer");
    if (!win) {
      // Popup bloquée : lien temporaire
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.click();
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  // Miniatures : images + 1re page des PDF
  useEffect(() => {
    let cancelled = false;
    const objectUrls: string[] = [];

    setPreviewIndex((pi) =>
      pi !== null && pi < files.length ? pi : null,
    );

    (async () => {
      const next: Record<number, string> = {};
      await Promise.all(
        files.map(async (f, i) => {
          try {
            const url = await renderCoverThumbnail(f);
            if (!url || cancelled) return;
            if (url.startsWith("blob:")) objectUrls.push(url);
            next[i] = url;
          } catch {
            /* ignore */
          }
        }),
      );
      if (cancelled) {
        objectUrls.forEach((u) => URL.revokeObjectURL(u));
        return;
      }
      setThumbUrls((prev) => {
        Object.values(prev).forEach((u) => {
          if (u.startsWith("blob:")) URL.revokeObjectURL(u);
        });
        return next;
      });
    })();

    return () => {
      cancelled = true;
      objectUrls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [files]);

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
              // Étape détails (index 3) — fichier obligatoire (envoi et transmission)
              if (files.length === 0) return false;
              if (isTransmission && !referenceText.trim()) return false;
              if (!arriveeLe.trim()) return false;
              if (!duField.trim()) return false;
              if (!dateCourrier.trim()) return false;
              if (!objet.trim()) return false;
              if (selectedTasks.length === 0 && !customTask.trim()) return false;
              return true;
            })();

  const handleSend = async () => {
    if (files.length === 0) {
      toast.error("Joignez au moins un document pour envoyer ou transmettre.");
      return;
    }
    if (destIds.length === 0) {
      toast.error("Choisissez au moins un destinataire.");
      return;
    }
    if (!arriveeLe.trim()) {
      toast.error("Indiquez la date d'arrivée (Arrivée le).");
      return;
    }
    if (!duField.trim()) {
      toast.error('Indiquez le champ « Émetteur ».');
      return;
    }
    if (!dateCourrier.trim()) {
      toast.error("Indiquez la date du courrier.");
      return;
    }
    if (!objet.trim()) {
      toast.error("Précisez l'objet de l'envoi.");
      return;
    }
    if (effectiveTasks.length === 0) {
      toast.error("Sélectionnez au moins une tâche.");
      return;
    }
    if (!me?.user?._id) {
      toast.error("Profil non chargé. Reconnectez-vous puis réessayez.");
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
          contentType: file.type?.trim() || undefined,
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
            ? { label: "Émetteur", value: duField.trim(), source: "manual" as const }
            : null,
          dateCourrier.trim()
            ? { label: "Date", value: dateCourrier.trim(), source: "manual" as const }
            : null,
        ].filter(Boolean) as Array<{
          label: string;
          value: string;
          source?: "manual" | "courrier" | "structure";
        }>;
        const mergedFields = [...metaFields].slice(0, 8);

        if (isTransmission && !referenceText.trim()) {
          toast.error("Indiquez la Réf. du courrier papier.");
          setSending(false);
          return;
        }
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
          publicRef: isTransmission ? undefined : ref || undefined,
          mailKind: isTransmission ? "transmission" : "envoi",
          stepDeadlineHours: undefined,
          parentCourrierId: replyTo?.documentId,
          referenceText: referenceText.trim() || undefined,
          requiresResponse: false,
          emittingDepartmentId:
            (me?.user?.departmentId as Id<"departments"> | undefined) ??
            onBehalfDepartmentId ??
            undefined,
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
      let message = "Envoi impossible.";
      if (error instanceof Error && error.message) {
        message = error.message;
        // Convex enveloppe parfois : "[CONVEX ...] Server Error\nMessage"
        const lines = message.split("\n").map((l) => l.trim()).filter(Boolean);
        const last = lines[lines.length - 1];
        if (last && !last.startsWith("[CONVEX") && !last.startsWith("Called by")) {
          message = last;
        }
      }
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
    <div className="space-y-8">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">
          {isTransmission
            ? "Transmission de courrier"
            : "Nouveau courrier"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {isTransmission
            ? "Numérisez le courrier reçu et transmettez-le au service compétent."
            : "Joignez le fichier, choisissez les destinataires, puis validez."}
        </p>
      </div>

      <Card className="border-border/80 shadow-sm">
        <CardContent className="space-y-8 px-5 py-8 sm:px-8">
          {/* Toujours montés pour permettre d'ajouter des fichiers à toute étape */}
          <input
            ref={fileInputRef}
            type="file"
            data-scandoc-tour="send-file"
            accept={ACCEPT_DOCS}
            className="hidden"
            multiple
            onChange={(event) => {
              void handleFiles(event.target.files, "document");
              event.target.value = "";
            }}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept={ACCEPT_PHOTOS}
            capture="environment"
            className="hidden"
            onChange={(event) => {
              void handleFiles(event.target.files, "photo");
              event.target.value = "";
            }}
          />
          {replyTo ? (
            <p className="rounded-lg border border-brand/30 bg-brand-soft/50 px-4 py-3 text-sm">
              <strong>Réponse</strong> au courrier
              {replyTo.publicRef ? ` ${replyTo.publicRef}` : ""}
            </p>
          ) : null}

          {step === 0 ? (
            <div className="space-y-8">
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
              ) : null}

              <div className="flex flex-wrap items-start justify-center gap-10">
                <div className="flex min-w-[12rem] max-w-[17rem] flex-col items-center gap-2 text-center">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 gap-2"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <FileText className="size-4" />
                    Ajouter des fichiers
                  </Button>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Documents uniquement · PDF, Word, Excel, texte · 10&nbsp;Mo max
                  </p>
                </div>
                <div className="flex min-w-[12rem] max-w-[17rem] flex-col items-center gap-2 text-center">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 gap-2"
                    onClick={() => cameraInputRef.current?.click()}
                  >
                    <Camera className="size-4" />
                    Prendre une photo
                  </Button>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Photos uniquement · JPG, PNG, WebP…
                  </p>
                </div>
              </div>

            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-6" data-scandoc-tour="send-destination">

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
                                {dir.name}
                              </span>
                              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                Direction
                              </span>
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
                                      {svc.name}
                                    </span>
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}


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
                            {/* vide */}
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
                      return d!.name;
                    })()}
                  </p>
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
            <div className="space-y-8">

              <div className="space-y-2">
                {!isTransmission ? (
                  <>
                    <Label htmlFor="publicRef">
                      N° du courrier
                      <span className="ml-1 text-destructive" aria-hidden>
                        *
                      </span>
                    </Label>
                    <Input
                      id="publicRef"
                      value={publicRef}
                      onChange={(e) => setPublicRef(e.target.value)}
                      className="w-full font-mono text-base"
                      autoComplete="off"
                    />
                  </>
                ) : null}
                <div className={isTransmission ? "space-y-1.5" : "space-y-1.5 pt-2"}>
                  <Label htmlFor="referenceText">
                    Réf.
                    {isTransmission ? (
                      <span className="ml-1 text-destructive" aria-hidden>
                        *
                      </span>
                    ) : null}
                  </Label>
                  <Textarea
                    id="referenceText"
                    className="w-full resize-y font-mono text-sm"
                    value={referenceText}
                    onChange={(e) => setReferenceText(e.target.value)}
                    rows={2}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="objet">
                  Objet de l&apos;envoi
                  <span className="ml-1 text-destructive" aria-hidden>
                    *
                  </span>
                </Label>
                <Textarea
                  id="objet"
                  data-scandoc-tour="send-objet"
                  className="w-full resize-y text-sm"
                  value={objet}
                  onChange={(e) => setObjet(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="arriveeLe">
                    Arrivée le
                    <span className="ml-1 text-destructive" aria-hidden>
                      *
                    </span>
                  </Label>
                  <Input
                    id="arriveeLe"
                    type="date"
                    value={arriveeLe}
                    onChange={(e) => setArriveeLe(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="duField">
                    Émetteur
                    <span className="ml-1 text-destructive" aria-hidden>
                      *
                    </span>
                  </Label>
                  <Input
                    id="duField"
                    value={duField}
                    onChange={(e) => setDuField(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dateCourrier">
                    Date
                    <span className="ml-1 text-destructive" aria-hidden>
                      *
                    </span>
                  </Label>
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
              </div>

              
              <div className="space-y-3">
                <Label>
                  <span data-scandoc-tour="send-tasks">
                    Tâches à réaliser
                    <span className="ml-1 text-destructive" aria-hidden>
                      *
                    </span>{" "}
                  </span>
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
                  <Label htmlFor="customTask">Autre</Label>
                  <Input
                    id="customTask"
                    value={customTask}
                    onChange={(e) => setCustomTask(e.target.value)}
                  />
                </div>
              </div>

                            <div className="rounded-lg border border-border bg-brand-soft/40 p-5 text-center sm:text-left">
                <p className="text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Récapitulatif — vérifiez avant d&apos;envoyer
                </p>
                <dl className="mx-auto mt-4 max-w-lg space-y-2.5 text-sm">
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
                    <dt className="shrink-0 text-muted-foreground">Qui reçoit</dt>
                    <dd className="max-w-[65%] text-right font-medium">
                      {destIds
                        .map((id) => {
                          const d = departments?.find((x) => x._id === id);
                          if (!d) return null;
                          const kind =
                            (d as { kind?: string | null }).kind === "service"
                              ? "Service"
                              : "Direction";
                          return `${kind} : ${d.name}`;
                        })
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </dd>
                  </div>

                  <div className="flex justify-between gap-4">
                    <dt className="shrink-0 text-muted-foreground">Envoyé par</dt>
                    <dd className="max-w-[65%] text-right font-medium">
                      {[
                        me?.user?.name?.trim() || null,
                        me?.user?.fonction?.trim() || null,
                        me?.department?.name?.trim() || null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="shrink-0 text-muted-foreground">N° courrier</dt>
                    <dd className="text-right font-mono text-xs font-medium break-all">
                      {publicRef.trim() || "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="shrink-0 text-muted-foreground">Réf.</dt>
                    <dd className="text-right font-medium break-all">
                      {referenceText.trim() || "—"}
                    </dd>
                  </div>
                  {arriveeLe.trim() ? (
                    <div className="flex justify-between gap-4">
                      <dt className="shrink-0 text-muted-foreground">
                        Arrivée le
                      </dt>
                      <dd className="text-right font-medium">{arriveeLe}</dd>
                    </div>
                  ) : null}
                  {duField.trim() ? (
                    <div className="flex justify-between gap-4">
                      <dt className="shrink-0 text-muted-foreground">Émetteur</dt>
                      <dd className="text-right font-medium">{duField.trim()}</dd>
                    </div>
                  ) : null}
                  {dateCourrier.trim() ? (
                    <div className="flex justify-between gap-4">
                      <dt className="shrink-0 text-muted-foreground">Date</dt>
                      <dd className="text-right font-medium">{dateCourrier}</dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-4">
                    <dt className="shrink-0 text-muted-foreground">Objet</dt>
                    <dd className="line-clamp-3 max-w-[65%] text-right font-medium">
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
                  <div className="flex justify-between gap-4">
                    <dt className="shrink-0 text-muted-foreground">Tâches</dt>
                    <dd className="max-w-[65%] text-right font-medium">
                      {effectiveTasks.length > 0
                        ? effectiveTasks.join(" · ")
                        : "—"}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-4">
              <p className="text-center text-sm font-medium text-foreground">
                {files.length > 0
                  ? "Voici les documents à envoyer"
                  : "Aucun document — ajoutez-en un"}
              </p>
              <div className="flex justify-center gap-3 overflow-x-auto pb-2 pt-1">
                {files.map((f, i) => {
                  const selected = previewIndex === i;
                  const isImg = f.type.startsWith("image/");
                  const ext = (f.name.split(".").pop() || "").toUpperCase();
                  return (
                    <div
                      key={`${f.name}-${f.size}-${i}`}
                      className={cn(
                        "relative flex w-[7.5rem] shrink-0 flex-col overflow-hidden rounded-lg border bg-card text-left shadow-sm transition-all",
                        selected
                          ? "border-brand ring-2 ring-brand/40"
                          : "border-border",
                      )}
                    >
                      <button
                        type="button"
                        className="absolute left-1.5 top-1.5 z-10 flex size-7 items-center justify-center rounded-full bg-black/65 text-white shadow hover:bg-destructive"
                        title="Retirer ce document"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFileAt(i);
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewIndex((cur) => (cur === i ? null : i))
                        }
                        className="flex w-full flex-col text-left"
                      >
                        <div className="relative aspect-[2/3] w-full overflow-hidden bg-muted">
                          {thumbUrls[i] ? (
                            <img
                              src={thumbUrls[i]}
                              alt=""
                              className="size-full object-cover object-top"
                            />
                          ) : (
                            <div className="flex size-full flex-col items-center justify-center gap-2 bg-gradient-to-b from-muted to-muted/60 p-2">
                              <FileText className="size-8 text-muted-foreground/70" />
                              <span className="rounded bg-foreground/80 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-background">
                                {ext || "FICHIER"}
                              </span>
                            </div>
                          )}
                          <span className="absolute right-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
                            {isImg ? "Photo" : ext || "Doc"}
                          </span>
                        </div>
                        <p className="line-clamp-2 px-2 py-1.5 text-[10px] font-medium leading-snug text-foreground">
                          {f.name}
                        </p>
                      </button>
                    </div>
                  );
                })}
                {files.length < 20 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex aspect-[2/3] w-[7.5rem] shrink-0 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 text-muted-foreground transition-colors hover:border-brand/50 hover:bg-brand-soft/30 hover:text-brand"
                      title="Ajouter un document"
                    >
                      <span className="flex size-10 items-center justify-center rounded-full border border-dashed border-current">
                        <Plus className="size-5" />
                      </span>
                      <span className="px-2 text-center text-[10px] font-medium">
                        Document
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="flex aspect-[2/3] w-[7.5rem] shrink-0 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 text-muted-foreground transition-colors hover:border-brand/50 hover:bg-brand-soft/30 hover:text-brand"
                      title="Ajouter une photo"
                    >
                      <span className="flex size-10 items-center justify-center rounded-full border border-dashed border-current">
                        <Camera className="size-5" />
                      </span>
                      <span className="px-2 text-center text-[10px] font-medium">
                        Photo
                      </span>
                    </button>
                  </>
                ) : null}
              </div>
              {previewIndex !== null && files[previewIndex] ? (
                <div className="flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => openFilePreview(previewIndex)}
                  >
                    <FileText className="size-4" />
                    Visualiser ce document
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
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

            {step === 0 || step === 1 ? (
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
                className="gap-2 px-6"
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
