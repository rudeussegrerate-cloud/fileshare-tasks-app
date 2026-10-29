import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  CheckCircle2,
  Clock3,
  Eye,
  File as FileIcon,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

export type DocumentStatus =
  | "envoye"
  | "consulte"
  | "en_cours"
  | "en_retard"
  | "traite";

/** Statuts orientés gestion de courrier (pas dossier technique). */
export const STATUS_META: Record<
  DocumentStatus,
  {
    label: string;
    /** Libellé côté destinataire */
    labelRecipient?: string;
    className: string;
    icon: LucideIcon;
    /** Court texte d'aide */
    hint: string;
  }
> = {
  envoye: {
    label: "Envoyé",
    labelRecipient: "Reçu",
    className: "border-amber-200 bg-amber-50 text-amber-700",
    icon: Clock3,
    hint: "Courrier reçu, pas encore ouvert — déjà à traiter.",
  },
  consulte: {
    label: "Lu",
    labelRecipient: "À traiter",
    className: "border-sky-200 bg-sky-50 text-sky-700",
    icon: Eye,
    hint: "Courrier ouvert — à traiter (plus seulement « reçu »).",
  },
  en_cours: {
    label: "En traitement",
    labelRecipient: "À traiter",
    className: "border-indigo-200 bg-indigo-50 text-indigo-700",
    icon: Loader2,
    hint: "Courrier ouvert et en cours de traitement.",
  },
  en_retard: {
    label: "En retard",
    className: "border-red-300 bg-red-50 text-red-700",
    icon: Clock3,
    hint: "Délai de 24 h dépassé — traitement attendu.",
  },
  traite: {
    label: "Classé",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    icon: CheckCircle2,
    hint: "Traitement terminé — courrier classé.",
  },
};

export const STATUS_ORDER: DocumentStatus[] = [
  "envoye",
  "consulte",
  "en_cours",
  "en_retard",
  "traite",
];

export function MailKindBadge({
  kind,
  className,
}: {
  kind?: "envoi" | "transmission" | string | null;
  className?: string;
}) {
  if (kind !== "transmission") return null;
  return (
    <Badge
      variant="outline"
      title="Courrier papier enregistré et transmis (sans N° de sortie)"
      className={cn(
        "rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-800",
        className,
      )}
    >
      Transmission
    </Badge>
  );
}

export function StatusBadge({
  status,
  className,
  asRecipient = false,
}: {
  status: DocumentStatus;
  className?: string;
  /** Libellés côté destinataire (ex. Non lu au lieu d'Envoyé) */
  asRecipient?: boolean;
}) {
  const meta = STATUS_META[status] ?? STATUS_META.envoye;
  const Icon = meta.icon;
  const label =
    asRecipient && meta.labelRecipient ? meta.labelRecipient : meta.label;
  return (
    <Badge
      variant="outline"
      title={meta.hint}
      className={cn(
        "gap-1.5 rounded-full border px-2.5 py-0.5 font-medium shadow-sm transition-shadow hover:shadow-md",
        meta.className,
        className,
      )}
    >
      <span className="status-dot" aria-hidden />
      <Icon className="size-3 opacity-80" />
      {label}
    </Badge>
  );
}

export function UrgentBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      title="Courrier signalé comme urgent"
      className={cn(
        "rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700",
        className,
      )}
    >
      Urgent
    </Badge>
  );
}

export function fileIconFor(fileName: string) {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (["pdf"].includes(ext)) return FileText;
  if (["doc", "docx", "rtf", "odt"].includes(ext)) return FileText;
  if (["xls", "xlsx", "csv", "ods"].includes(ext)) return FileSpreadsheet;
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "heic"].includes(ext))
    return FileImage;
  if (["json", "xml", "html", "js", "ts", "sql", "yml", "yaml"].includes(ext))
    return FileCode2;
  return FileIcon;
}


export function isImageFile(name: string, contentType?: string | null) {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.startsWith("image/")) return true;
  return /\.(jpe?g|png|gif|webp|bmp|heic)$/i.test(name);
}

export function isPdfFile(name: string, contentType?: string | null) {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("pdf")) return true;
  return /\.pdf$/i.test(name);
}

/** Miniature aperçu (image / PDF / carte document). */
export function FileThumb({
  fileName,
  contentType,
  fileUrl,
  size = "md",
}: {
  fileName: string;
  contentType?: string | null;
  fileUrl?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const box =
    size === "sm" ? "size-10" : size === "lg" ? "size-16" : "size-14";
  // PDF : jamais d'URL distante (évite téléchargement auto Android)
  if (isPdfFile(fileName, contentType)) {
    return (
      <div
        className={cn(
          "relative flex shrink-0 flex-col items-center justify-center overflow-hidden rounded-md border border-border bg-red-50 shadow-sm",
          box,
        )}
      >
        <FileText className="size-5 text-red-600 sm:size-6" />
        <span className="absolute bottom-0.5 left-0.5 rounded bg-red-600 px-1 text-[8px] font-bold text-white">
          PDF
        </span>
      </div>
    );
  }
  if (fileUrl && isImageFile(fileName, contentType)) {
    return (
      <div
        className={cn(
          "relative shrink-0 overflow-hidden rounded-md border border-border bg-muted shadow-sm",
          box,
        )}
      >
        <img
          src={fileUrl}
          alt=""
          className="size-full object-cover"
          loading="lazy"
        />
      </div>
    );
  }
  const Icon = fileIconFor(fileName);
  return (
    <div
      className={cn(
        "flex shrink-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-md border border-border bg-white p-1 shadow-sm",
        box,
      )}
    >
      <div className="h-6 w-8 rounded-sm border border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100 p-0.5 sm:h-7 sm:w-9">
        <div className="space-y-0.5">
          <div className="h-0.5 w-full rounded bg-slate-300" />
          <div className="h-0.5 w-4/5 rounded bg-slate-200" />
          <div className="h-0.5 w-full rounded bg-slate-200" />
          <div className="h-0.5 w-3/5 rounded bg-slate-200" />
        </div>
      </div>
      <Icon className="size-3 text-brand" />
    </div>
  );
}


export function formatBytes(bytes?: number | null) {
  if (!bytes || bytes <= 0) return "—";
  const units = ["o", "Ko", "Mo", "Go"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

/** Champs utiles pour afficher expéditeur / destinataire (personne → personne). */
export type StructureDocFields = {
  senderName?: string | null;
  recipientName?: string | null;
  senderDepartmentName?: string | null;
  recipientDepartmentName?: string | null;
  senderFonction?: string | null;
  recipientFonction?: string | null;
};

/**
 * Connecteurs d'affichage institutionnels :
 *   Nom · Fonction · CODE — Structure
 * Ex. : Lanja Andriarimamy · DTD — MNDPT
 */
export function formatIdentity(parts: {
  name?: string | null;
  fonction?: string | null;
  /** Libellé structure déjà formé (ex. « DTD — Direction… ») ou simple nom */
  department?: string | null;
  /** Code court optionnel si department n'inclut pas déjà « — » */
  departmentCode?: string | null;
}): string {
  const name = parts.name?.trim() || "";
  const fonction = parts.fonction?.trim() || "";
  let dept = parts.department?.trim() || "";
  const code = parts.departmentCode?.trim() || "";
  if (code && dept && !dept.includes("—") && !dept.startsWith(code)) {
    dept = `${code} — ${dept}`;
  } else if (code && !dept) {
    dept = code;
  }

  const left: string[] = [];
  if (name) left.push(name);
  if (fonction && fonction !== name) left.push(fonction);

  if (left.length && dept) return `${left.join(" · ")} · ${dept}`;
  if (left.length) return left.join(" · ");
  if (dept) return dept;
  return "—";
}

export function structureFrom(
  structureName?: string | null,
  fallbackPersonOrLabel?: string | null,
): string {
  const s = structureName?.trim();
  if (s) return s;
  const f = fallbackPersonOrLabel?.trim();
  if (f) return f;
  return "—";
}

/** Expéditeur : Nom · structure (CODE — libellé). */
export function structureSender(doc: StructureDocFields): string {
  return formatIdentity({
    name: doc.senderName,
    fonction: doc.senderFonction,
    department: doc.senderDepartmentName,
  });
}

/** Destinataire : Nom · structure (CODE — libellé). */
export function structureRecipient(doc: StructureDocFields): string {
  return formatIdentity({
    name: doc.recipientName,
    fonction: doc.recipientFonction,
    department: doc.recipientDepartmentName,
  });
}

export function formatDateTime(timestamp?: number | null) {
  if (!timestamp) return "—";
  return format(new Date(timestamp), "d MMM yyyy 'à' HH:mm", { locale: fr });
}

export function formatDay(timestamp?: number | null) {
  if (!timestamp) return "—";
  return format(new Date(timestamp), "d MMM yyyy", { locale: fr });
}

export function initialsOf(name?: string | null) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/60 px-6 py-12 text-center",
        className,
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand">
        <Icon className="size-5" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function StepDots({
  steps,
  current,
}: {
  steps: string[];
  current: number;
}) {
  return (
    <ol className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {steps.map((label, index) => {
        const state =
          index < current ? "done" : index === current ? "active" : "todo";
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-full text-xs font-semibold",
                state === "done" && "bg-brand text-primary-foreground",
                state === "active" &&
                  "bg-brand-sky text-primary-foreground ring-4 ring-brand-sky/15",
                state === "todo" &&
                  "bg-muted text-muted-foreground",
              )}
            >
              {index + 1}
            </span>
            <span
              className={cn(
                "text-xs font-medium",
                state === "todo" ? "text-muted-foreground" : "text-foreground",
              )}
            >
              {label}
            </span>
            {index < steps.length - 1 ? (
              <span className="hidden h-px w-6 bg-border sm:block" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}


/** Tâches prédéfinies (fiche de transmission MNDPT) */
export const PREDEFINED_TASKS = [
  "Pour compte rendu",
  "Pour compétence",
  "Pour signature",
  "Pour études",
  "Pour avis",
  "Pour documentation",
  "Pour information",
  "Suite à votre demande",
  "Prière de m'en parler",
  "Prière de nous représenter",
  "Pour affichage",
  "Pour attribution",
  "Pour suite à donner",
  "Pour exploitation",
  "Réunion à ce sujet",
  "Après visa",
  "Urgent",
  "Pour classement",
  "Scan et e-mail",
  "Pour large diffusion",
] as const;
