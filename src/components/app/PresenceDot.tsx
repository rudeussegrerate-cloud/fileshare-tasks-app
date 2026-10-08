import { cn } from "@/lib/utils";

/** Pastille verte (en ligne) / grise (hors ligne). */
export function PresenceDot({
  online,
  className,
  title,
}: {
  online?: boolean | null;
  className?: string;
  title?: string;
}) {
  const isOn = Boolean(online);
  return (
    <span
      title={title ?? (isOn ? "En ligne" : "Hors ligne")}
      className={cn(
        "inline-block size-2.5 shrink-0 rounded-full border border-background",
        isOn ? "bg-emerald-500" : "bg-muted-foreground/40",
        className,
      )}
      aria-label={isOn ? "En ligne" : "Hors ligne"}
    />
  );
}
