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
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-[13px] bg-white font-extrabold tracking-tight text-[#4C3EC7] shadow-md",
          compact ? "size-9 text-xs" : "size-10 text-[15px]",
        )}
      >
        SD
      </span>
      {compact ? null : (
        <span className="min-w-0 leading-tight">
          <span className="block text-[19px] font-extrabold tracking-tight text-white">
            ScanDoc
          </span>
          <span className="mt-0.5 block text-[10px] font-medium text-[#B6B1DB]">
            Courrier interne · MNDPT
          </span>
        </span>
      )}
    </div>
  );
}
