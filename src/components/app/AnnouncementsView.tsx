import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import {
  Globe,
  Loader2,
  Lock,
  Megaphone,
  Pin,
  Trash2,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { formatDateTime, initialsOf } from "./shared";

const REACTIONS = ["👍", "❤️", "👏", "🎉", "😮"] as const;

const PRIORITY_LABEL: Record<string, string> = {
  normal: "Normale",
  important: "Importante",
  urgent: "Urgente",
};

export function AnnouncementsView() {
  const me = useQuery(api.workspace.me);
  const list = useQuery(api.announcements.list, "skip"); // fil = Actualités
  const create = useMutation(api.announcements.create);
  const remove = useMutation(api.announcements.remove);
  const react = useMutation(api.announcements.react);
  const potentialViewers = useQuery(api.announcements.listPotentialViewers);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [origin, setOrigin] = useState("");
  const [priority, setPriority] = useState<"normal" | "important" | "urgent">(
    "normal",
  );
  const [pinned, setPinned] = useState(false);
  const [visibility, setVisibility] = useState<"public" | "private" | "custom">(
    "public",
  );
  const [selectedViewers, setSelectedViewers] = useState<string[]>([]);
  const [viewerSearch, setViewerSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(true);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const genMediaUrl = useMutation(api.announcements.generateMediaUploadUrl);

  const canPin = Boolean(me?.isAdmin || me?.isRoot || me?.isChef);

  const defaultOrigin =
    me?.department && "name" in me.department && me.department.name
      ? `Département ${me.department.name}`
      : me?.isAdmin
        ? "Direction générale"
        : "Organisation";

  const onPublish = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      let mediaStorageId: Id<"_storage"> | undefined;
      let mediaType: "image" | "video" | undefined;
      if (mediaFile) {
        const postUrl = await genMediaUrl({});
        const res = await fetch(postUrl, {
          method: "POST",
          headers: { "Content-Type": mediaFile.type || "application/octet-stream" },
          body: mediaFile,
        });
        if (!res.ok) throw new Error("Échec de l'envoi du média");
        const json = (await res.json()) as { storageId: string };
        mediaStorageId = json.storageId as Id<"_storage">;
        mediaType = mediaFile.type.startsWith("video/") ? "video" : "image";
      }
      await create({
        title: title.trim(),
        body: body.trim(),
        origin: (origin.trim() || defaultOrigin).trim(),
        priority,
        pinned: canPin ? pinned : false,
        visibility,
        viewerIds:
          visibility === "custom"
            ? (selectedViewers as Id<"users">[])
            : undefined,
        mediaStorageId,
        mediaType,
      });
      toast.success("Annonce publiée");
      setTitle("");
      setBody("");
      setOrigin("");
      setPriority("normal");
      setPinned(false);
      setVisibility("public");
      setSelectedViewers([]);
      setMediaFile(null);
      setShowForm(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Publication impossible");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col space-y-5 animate-in-up">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Megaphone className="size-5 text-brand" />
            Annonces
          </h2>
          <p className="text-sm text-muted-foreground">
            Publiez une annonce (publique, privée ou personnalisée). Le fil
            public se consulte dans <strong>Actualités</strong>.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="gap-2 self-start"
        >
          <Megaphone className="size-4" />
          {showForm ? "Fermer" : "Nouvelle annonce"}
        </Button>
      </div>

      {showForm ? (
        <Card className="border-border shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Publier une annonce</CardTitle>
            <CardDescription>
              Indiquez clairement la provenance et le message. Votre nom, poste
              et département seront affichés automatiquement.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={(e) => void onPublish(e)}>
              <div className="space-y-1.5">
                <Label htmlFor="ann-title">Titre *</Label>
                <Input
                  id="ann-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex : Réunion générale du vendredi"
                  maxLength={120}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ann-origin">Provenance / origine *</Label>
                <Input
                  id="ann-origin"
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  placeholder={defaultOrigin}
                  maxLength={80}
                />
                <p className="text-[11px] text-muted-foreground">
                  Ex. Direction, RH, Département Finance, Service informatique…
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ann-body">Message *</Label>
                <Textarea
                  id="ann-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={5}
                  placeholder="Rédigez l'annonce…"
                  maxLength={4000}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Visibilité *</Label>
                <div className="grid gap-2 sm:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => setVisibility("public")}
                    className={cn(
                      "flex flex-col items-start gap-1 rounded-md border p-3 text-left text-sm transition-colors",
                      visibility === "public"
                        ? "border-brand bg-brand-soft"
                        : "border-border hover:bg-muted/50",
                    )}
                  >
                    <span className="flex items-center gap-1.5 font-medium">
                      <Globe className="size-3.5" />
                      Publique
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Tous les départements
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setVisibility("private")}
                    className={cn(
                      "flex flex-col items-start gap-1 rounded-md border p-3 text-left text-sm transition-colors",
                      visibility === "private"
                        ? "border-brand bg-brand-soft"
                        : "border-border hover:bg-muted/50",
                    )}
                  >
                    <span className="flex items-center gap-1.5 font-medium">
                      <Lock className="size-3.5" />
                      Privée
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Uniquement mon département
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setVisibility("custom")}
                    className={cn(
                      "flex flex-col items-start gap-1 rounded-md border p-3 text-left text-sm transition-colors",
                      visibility === "custom"
                        ? "border-brand bg-brand-soft"
                        : "border-border hover:bg-muted/50",
                    )}
                  >
                    <span className="flex items-center gap-1.5 font-medium">
                      <UserRound className="size-3.5" />
                      Personnalisée
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Personnes choisies
                    </span>
                  </button>
                </div>
                {visibility === "private" && !(me?.department && "_id" in me.department) ? (
                  <p className="text-xs text-amber-700">
                    Vous n&apos;êtes rattaché à aucun département : l&apos;annonce
                    privée ne sera visible que pour vous (et le DG).
                  </p>
                ) : null}
                {visibility === "custom" ? (
                  <div className="space-y-2 rounded-md border border-border p-3">
                    <Input
                      className="h-8 text-xs"
                      placeholder="Filtrer les personnes…"
                      value={viewerSearch}
                      onChange={(e) => setViewerSearch(e.target.value)}
                    />
                    <ul className="max-h-40 space-y-1 overflow-y-auto">
                      {(potentialViewers ?? [])
                        .filter(
                          (p) =>
                            viewerSearch.trim() === "" ||
                            p.name
                              .toLowerCase()
                              .includes(viewerSearch.toLowerCase()) ||
                            (p.fonction ?? "")
                              .toLowerCase()
                              .includes(viewerSearch.toLowerCase()),
                        )
                        .map((p) => {
                          const checked = selectedViewers.includes(p._id);
                          return (
                            <li key={p._id}>
                              <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60">
                                <input
                                  type="checkbox"
                                  className="size-4"
                                  checked={checked}
                                  onChange={() => {
                                    setSelectedViewers((prev) =>
                                      checked
                                        ? prev.filter((id) => id !== p._id)
                                        : [...prev, p._id],
                                    );
                                  }}
                                />
                                <span className="min-w-0 flex-1 truncate">
                                  {p.name}
                                  {p.fonction ? (
                                    <span className="text-xs text-muted-foreground">
                                      {" "}
                                      · {p.fonction}
                                    </span>
                                  ) : null}
                                </span>
                              </label>
                            </li>
                          );
                        })}
                    </ul>
                    <p className="text-[11px] text-muted-foreground">
                      {selectedViewers.length} personne
                      {selectedViewers.length > 1 ? "s" : ""} sélectionnée
                      {selectedViewers.length > 1 ? "s" : ""}
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-3">
                <div className="space-y-1.5">
                  <Label>Priorité</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        ["normal", "Normale"],
                        ["important", "Importante"],
                        ["urgent", "Urgente"],
                      ] as const
                    ).map(([id, label]) => (
                      <Button
                        key={id}
                        type="button"
                        size="sm"
                        variant={priority === id ? "default" : "outline"}
                        onClick={() => setPriority(id)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
                {canPin ? (
                  <label className="mt-6 flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={pinned}
                      onChange={(e) => setPinned(e.target.checked)}
                      className="size-4"
                    />
                    Épingler en haut
                  </label>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label>Photo ou vidéo (optionnel)</Label>
                <Input
                  type="file"
                  accept="image/*,video/*"
                  onChange={(e) => setMediaFile(e.target.files?.[0] ?? null)}
                />
                {mediaFile ? (
                  <p className="text-[11px] text-muted-foreground">
                    Fichier : {mediaFile.name}
                  </p>
                ) : null}
              </div>
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Auteur (automatique)</p>
                <p>
                  {me?.user.name ?? "—"}
                  {me?.user.fonction ? ` · ${me.user.fonction}` : ""}
                  {me?.department?.name ? ` · ${me.department.name}` : ""}
                </p>
              </div>
              <Button type="submit" disabled={busy} className="gap-2">
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                Publier
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {list === undefined ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : list.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Aucune annonce pour le moment. Soyez le premier à en publier une.
        </p>
      ) : (
        <ul className="max-h-[calc(100vh-12rem)] space-y-4 overflow-y-auto pb-8 pr-1">
          {list.map((a) => (
            <li key={a._id}>
              <Card
                className={cn(
                  "border-border shadow-none transition-shadow hover:shadow-sm",
                  a.priority === "urgent" && "border-red-300 bg-red-50/30",
                  a.priority === "important" && "border-amber-300 bg-amber-50/20",
                  a.pinned && "ring-1 ring-brand/30",
                )}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start gap-3">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand">
                      {initialsOf(a.authorName)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-base leading-snug">
                          {a.title}
                        </CardTitle>
                        {a.pinned ? (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-semibold text-brand">
                            <Pin className="size-3" />
                            Épinglée
                          </span>
                        ) : null}
                        {a.priority !== "normal" ? (
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                              a.priority === "urgent"
                                ? "bg-red-100 text-red-800"
                                : "bg-amber-100 text-amber-900",
                            )}
                          >
                            {PRIORITY_LABEL[a.priority]}
                          </span>
                        ) : null}
                      </div>
                      <CardDescription className="mt-1 space-y-0.5 text-xs">
                        <span className="block">
                          <strong className="text-foreground">De :</strong>{" "}
                          {a.authorName}
                          {a.authorFonction ? ` · ${a.authorFonction}` : ""}
                          {a.authorRoleLabel ? ` · ${a.authorRoleLabel}` : ""}
                        </span>
                        <span className="block">
                          <strong className="text-foreground">Provenance :</strong>{" "}
                          {a.origin}
                          {a.authorDepartmentName
                            ? ` · ${a.authorDepartmentName}`
                            : ""}
                        </span>
                        <span className="block">
                          <strong className="text-foreground">Visibilité :</strong>{" "}
                          {a.visibilityLabel}
                          {a.visibility === "custom" && a.viewerCount != null
                            ? ` (${a.viewerCount})`
                            : ""}
                        </span>
                        <span className="block text-muted-foreground">
                          {formatDateTime(a.createdAt)}
                        </span>
                      </CardDescription>
                    </div>
                    {a.canDelete ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={async () => {
                          if (!confirm("Supprimer cette annonce ?")) return;
                          try {
                            await remove({
                              announcementId: a._id as Id<"announcements">,
                            });
                            toast.message("Annonce supprimée");
                          } catch (err) {
                            toast.error(
                              err instanceof Error ? err.message : "Erreur",
                            );
                          }
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
                    {a.body}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
                    {REACTIONS.map((emoji) => {
                      const count = a.reactionCounts[emoji] ?? 0;
                      const active = a.myReaction === emoji;
                      return (
                        <button
                          key={emoji}
                          type="button"
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm transition-colors",
                            active
                              ? "border-brand bg-brand-soft"
                              : "border-border hover:bg-muted/70",
                          )}
                          onClick={async () => {
                            try {
                              await react({
                                announcementId: a._id as Id<"announcements">,
                                emoji,
                              });
                            } catch (err) {
                              toast.error(
                                err instanceof Error ? err.message : "Erreur",
                              );
                            }
                          }}
                        >
                          <span>{emoji}</span>
                          {count > 0 ? (
                            <span className="text-xs font-medium tabular-nums text-muted-foreground">
                              {count}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                    {a.reactionTotal > 0 ? (
                      <span className="ml-auto text-[11px] text-muted-foreground">
                        {a.reactionTotal} réaction
                        {a.reactionTotal > 1 ? "s" : ""}
                      </span>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
