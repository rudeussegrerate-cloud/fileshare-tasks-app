import { cn } from "@/lib/utils";
import mndptLogo from "@/assets/mndpt-logo.jpg";

/**
 * Logo MNDPT — Ministère du Développement Numérique,
 * des Postes et des Télécommunications.
 */
export function Logo({
  className,
  size = 36,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <img
      src={mndptLogo}
      alt="MNDPT"
      width={size}
      height={size}
      className={cn("shrink-0 object-contain", className)}
      style={{ width: size, height: size }}
    />
  );
}

export function BrandLogo({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <img
        src={mndptLogo}
        alt="MNDPT"
        className={cn(
          "shrink-0 object-contain",
          compact ? "h-9 w-9" : "h-11 w-11",
        )}
      />
      {compact ? null : (
        <span className="min-w-0 leading-tight">
          <span className="block text-sm font-bold tracking-tight text-foreground">
            ScanDoc
          </span>
          <span className="block text-[10px] font-medium text-muted-foreground">
            MNDPT · Échange de documents
          </span>
        </span>
      )}
    </div>
  );
}
