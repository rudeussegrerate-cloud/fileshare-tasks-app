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

export type DocumentStatus = "envoye" | "consulte" | "en_cours" | "traite";

export const STATUS_META: Record<
  DocumentStatus,
  { label: string; className: string; icon: LucideIcon }
> = {
  envoye: {
    label: "Envoyé",
    className: "border-amber-200 bg-amber-50 text-amber-700",
    icon: Clock3,
  },
  consulte: {
    label: "Consulté",
    className: "border-sky-200 bg-sky-50 text-sky-700",
    icon: Eye,
  },
  en_cours: {
    label: "En cours de traitement",
    className: "border-indigo-200 bg-indigo-50 text-indigo-700",
    icon: Loader2,
  },
  traite: {
    label: "Traité",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    icon: CheckCircle2,
  },
};

export const STATUS_ORDER: DocumentStatus[] = [
  "envoye",
  "consulte",
  "en_cours",
  "traite",
];

export function StatusBadge({
  status,
  className,
}: {
  status: DocumentStatus;
  className?: string;
}) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <Badge
      variant="outline"
      className={cn("gap-1 border font-medium", meta.className, className)}
    >
      <Icon className="size-3" />
      {meta.label}
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
