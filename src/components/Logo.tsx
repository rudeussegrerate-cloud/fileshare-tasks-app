import { cn } from "@/lib/utils";

/**
 * Logo ScanDoc — document avec coin doré (style institutionnel).
 */
export function Logo({
  className,
  size = 36,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <rect width="64" height="64" rx="6" fill="#1e3a5f" />
      <path
        d="M18 12h20l10 10v30a2 2 0 0 1-2 2H18a2 2 0 0 1-2-2V14a2 2 0 0 1 2-2z"
        fill="#ffffff"
      />
      <path d="M38 12v8a2 2 0 0 0 2 2h8" fill="#c5ccd6" />
      <rect x="22" y="28" width="20" height="2.5" rx="1" fill="#1e3a5f" />
      <rect x="22" y="34" width="16" height="2.5" rx="1" fill="#1e3a5f" />
      <rect x="22" y="40" width="18" height="2.5" rx="1" fill="#1e3a5f" />
      <path d="M38 12v8a2 2 0 0 0 2 2h8L38 12z" fill="#9a7b0f" />
    </svg>
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
      <Logo size={compact ? 32 : 36} />
      {!compact ? (
        <span className="leading-tight">
          <span className="block text-[15px] font-semibold text-foreground">
            ScanDoc
          </span>
          <span className="block text-xs text-muted-foreground">
            Échange de documents
          </span>
        </span>
      ) : null}
    </div>
  );
}
