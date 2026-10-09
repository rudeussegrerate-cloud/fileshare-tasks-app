import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import { Users } from "lucide-react";
import { PresenceDot } from "./PresenceDot";
import { initialsOf } from "./shared";

/**
 * Liste des personnes (type Facebook) : en ligne en premier.
 */
export function OnlinePeople({ compact = false }: { compact?: boolean }) {
  const directory = useQuery(api.presence.onlineDirectory);

  if (directory === undefined) {
    return (
      <div className="px-3 py-2 text-xs text-muted-foreground">
        Chargement des présences…
      </div>
    );
  }

  const onlineCount = directory.filter((p) => p.online && !p.isSelf).length;

  return (
    <div className={cn("flex flex-col", compact ? "gap-1" : "gap-2")}>
      <div className="flex items-center gap-2 px-3 pt-1">
        <Users className="size-3.5 text-muted-foreground" />
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Personnes
        </p>
        {onlineCount > 0 ? (
          <span className="ml-auto rounded-full bg-emerald-100 px-1.5 text-[10px] font-semibold text-emerald-700">
            {onlineCount} en ligne
          </span>
        ) : null}
      </div>
      <ul className="max-h-56 space-y-0.5 overflow-y-auto px-1.5">
        {directory.length === 0 ? (
          <li className="px-2 py-2 text-xs text-muted-foreground">
            Aucun utilisateur visible pour le moment.
          </li>
        ) : (
          directory.map((person) => (
            <li
              key={person._id}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                person.isSelf && "bg-muted/60",
              )}
            >
              <div className="relative shrink-0">
                <div className="flex size-8 items-center justify-center rounded-full bg-brand-soft text-[11px] font-semibold text-brand">
                  {initialsOf(person.name)}
                </div>
                <span className="absolute -bottom-0.5 -right-0.5">
                  <PresenceDot online={person.online} className="size-2.5" />
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium leading-tight">
                  {person.name}
                  {person.isSelf ? " (vous)" : ""}
                </p>
                <p className="truncate text-[10px] text-muted-foreground">
                  {person.online
                    ? "En ligne"
                    : person.departmentName
                      ? person.departmentName
                      : person.fonction || "Hors ligne"}
                </p>
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
