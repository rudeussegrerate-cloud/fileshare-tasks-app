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
      className={cn("shrink-0 rounded-md object-contain", className)}
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
      <Logo
        size={compact ? 36 : 40}
        className="rounded-lg border border-white/15 bg-white p-0.5 shadow-sm"
      />
      {compact ? null : (
        <span className="min-w-0 leading-tight">
          <span className="block text-[17px] font-bold tracking-tight text-white">
            Mailaka
          </span>
          <span className="mt-0.5 block text-[10px] font-medium text-white/70">
            MNDPT · Échange de documents
          </span>
        </span>
      )}
    </div>
  );
}
