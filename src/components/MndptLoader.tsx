import mndptLogo from "@/assets/mndpt-login-bg.jpg";
import { cn } from "@/lib/utils";

type Props = {
  /** full = écran entier ; section = zone de contenu ; inline = petit */
  size?: "full" | "section" | "inline";
  className?: string;
  label?: string;
};

/**
 * Chargement institutionnel : logo MNDPT animé (pulse + léger zoom).
 */
export function MndptLoader({
  size = "section",
  className,
  label,
}: Props) {
  const imgClass =
    size === "full"
      ? "h-28 w-auto sm:h-36"
      : size === "inline"
        ? "h-10 w-auto"
        : "h-16 w-auto sm:h-20";

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3",
        size === "full" && "min-h-screen bg-background",
        size === "section" && "py-16",
        size === "inline" && "py-2",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={label ?? "Chargement"}
    >
      <div className="relative">
        <img
          src={mndptLogo}
          alt="MNDPT"
          className={cn(
            "object-contain select-none mndpt-loader-logo",
            imgClass,
          )}
          draggable={false}
        />
        <div
          className="pointer-events-none absolute inset-0 mndpt-loader-ring rounded-full"
          aria-hidden
        />
      </div>
      {label ? (
        <p className="text-xs text-muted-foreground">{label}</p>
      ) : null}
      <span className="sr-only">Chargement en cours…</span>
    </div>
  );
}

export default MndptLoader;
