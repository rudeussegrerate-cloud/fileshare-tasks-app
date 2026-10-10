import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import { Search, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { PresenceDot } from "./PresenceDot";
import { initialsOf } from "./shared";

/** Annuaire de présence type Facebook, avec recherche. */
export function OnlinePeople({
  compact = false,
  onMessage,
}: {
  compact?: boolean;
  onMessage?: (userId: string) => void;
}) {
  const directory = useQuery(api.presence.onlineDirectory);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    if (!directory) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return directory;
    return directory.filter(
      (p) =>
        p.name.toLowerCase().includes(needle) ||
        (p.email ?? "").toLowerCase().includes(needle) ||
        (p.departmentName ?? "").toLowerCase().includes(needle) ||
        (p.fonction ?? "").toLowerCase().includes(needle),
    );
  }, [directory, q]);

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
      <div className="px-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher…"
            className="h-8 pl-7 text-xs"
          />
        </div>
      </div>
      <ul className="max-h-40 space-y-0.5 overflow-y-auto px-1.5">
        {filtered.length === 0 ? (
          <li className="px-2 py-2 text-xs text-muted-foreground">
            Aucun résultat.
          </li>
        ) : (
          filtered.map((person) => (
            <li key={person._id}>
              <button
              type="button"
              disabled={person.isSelf || !onMessage}
              onClick={() => {
                if (!person.isSelf && onMessage) onMessage(person._id);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-left",
                person.isSelf && "bg-muted/60",
                !person.isSelf && onMessage && "hover:bg-muted/70 cursor-pointer",
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
            </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
