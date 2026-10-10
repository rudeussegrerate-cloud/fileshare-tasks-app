import { JoinGroupsPanel } from "./JoinGroupsPanel";
import { MembershipPanel } from "./MembershipPanel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useRef } from "react";
import {
  ArrowLeft,
  Building2,
  Crown,
  Info,
  Loader2,
  Plus,
  Trash2,
  UserPlus,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState, initialsOf } from "./shared";

type PersonMode = "member" | "chief";

type AssignablePerson = {
  _id: Id<"users">;
  name: string;
  email: string | null;
  fonction: string | null;
  departmentRole: string | null;
  isCurrentMember: boolean;
};

const EMPTY_PEOPLE =
  "Aucun compte disponible pour l'instant. Une personne doit d'abord se connecter à ScanDoc et compléter ses informations (nom, fonction) pour être sélectionnable.";

function PersonSelect({
  people,
  value,
  onChange,
  placeholder,
}: {
  people: AssignablePerson[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <Select value={value || undefined} onValueChange={onChange} disabled={people.length === 0}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {people.map((person) => (
          <SelectItem key={person._id} value={person._id}>
            {person.name}
            {person.fonction ? ` — ${person.fonction}` : ""}
            {person.email ? ` · ${person.email}` : ""}
            {person.isCurrentMember ? " (déjà membre)" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function AssignPersonDialog({
  mode,
  departmentId,
  departmentName,
  onOpenChange,
}: {
  mode: PersonMode | null;
  departmentId: Id<"departments"> | null;
  departmentName?: string;
  onOpenChange: (open: boolean) => void;
}) {
  const people = useQuery(
    api.workspace.listAssignablePeople,
    departmentId ? { departmentId } : "skip",
  );
  const addMember = useMutation(api.workspace.addMember);
  const addChief = useMutation(api.workspace.addChief);
  const [selectedId, setSelectedId] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!departmentId || !selectedId) return;
    setSaving(true);
    try {
      if (mode === "chief") {
        await addChief({
          departmentId,
          chiefId: selectedId as Id<"users">,
        });
        toast.success("Chef de département nommé.");
      } else {
        await addMember({
          departmentId,
          memberId: selectedId as Id<"users">,
        });
        toast.success("Membre ajouté au département.");
      }
      setSelectedId("");
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Impossible d'ajouter cette personne.",
      );
    } finally {
      setSaving(false);
    }
  };

  const list = (people ?? []) as AssignablePerson[];

  return (
    <Dialog open={mode !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "chief"
              ? "Nommer un chef de département"
              : "Ajouter un membre"}
          </DialogTitle>
          <DialogDescription>
            {mode === "chief"
              ? `Le chef de ${departmentName ?? "ce département"} doit déjà avoir un compte ScanDoc avec ses informations renseignées.`
              : `Sélectionnez un compte existant à rattacher au département ${departmentName ?? ""}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Compte à sélectionner</Label>
            {people === undefined ? (
              <div className="flex h-9 items-center justify-center rounded-md border">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <PersonSelect
                people={list}
                value={selectedId}
                onChange={setSelectedId}
                placeholder="Choisir une personne"
              />
            )}
          </div>

          {people !== undefined && list.length === 0 ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              <p>{EMPTY_PEOPLE}</p>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Annuler
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={saving || !selectedId}
            className="gap-2"
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : mode === "chief" ? (
              <Crown className="size-4" />
            ) : (
              <UserPlus className="size-4" />
            )}
            {mode === "chief" ? "Nommer" : "Ajouter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateSubDepartmentDialog({
  parent,
  onOpenChange,
}: {
  parent: { id: Id<"departments">; name: string } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const createSub = useMutation(api.workspace.createSubDepartment);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!parent || !name.trim()) {
      toast.error("Le nom du groupe est obligatoire.");
      return;
    }
    setSaving(true);
    try {
      await createSub({
        parentId: parent.id,
        name: name.trim(),
        description: description.trim() || undefined,
      });
      toast.success("Groupe créé.");
      setName("");
      setDescription("");
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Création impossible.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={parent !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Groupe</DialogTitle>
          <DialogDescription>
            Créer un groupe dans « {parent?.name} ».
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="sub-name">Nom</Label>
            <Input
              id="sub-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex. : Cellule qualité"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sub-desc">Description (optionnel)</Label>
            <Textarea
              id="sub-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Créer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateDepartmentDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const people = useQuery(api.workspace.listAssignablePeople, {});
  const createDepartment = useMutation(api.workspace.createDepartment);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [chiefId, setChiefId] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Le nom du département est obligatoire.");
      return;
    }
    setSaving(true);
    try {
      await createDepartment({
        name: name.trim(),
        description: description.trim() || undefined,
        chiefId: chiefId ? (chiefId as Id<"users">) : undefined,
      });
      toast.success("Département créé.");
      setName("");
      setDescription("");
      setChiefId("");
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Création impossible.",
      );
    } finally {
      setSaving(false);
    }
  };

  const list = (people ?? []) as AssignablePerson[];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Créer un département</DialogTitle>
          <DialogDescription>
            En tant que DG, vous créez le département puis désignez son chef
            parmi les comptes qui ont déjà complété leurs informations.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="dept-name">Nom du département</Label>
            <Input
              id="dept-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex : Ressources humaines"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dept-desc">Description (optionnel)</Label>
            <Textarea
              id="dept-desc"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Rôle du département dans l'entreprise"
              rows={2}
            />
          </div>
          <div className="space-y-2 rounded-lg border border-dashed border-border bg-brand-soft/40 p-3">
            <Label>Chef du département</Label>
            {people === undefined ? (
              <div className="flex h-9 items-center justify-center rounded-md border">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <PersonSelect
                people={list}
                value={chiefId}
                onChange={setChiefId}
                placeholder="Sélectionner un compte existant"
              />
            )}
            <p className="text-[11px] text-muted-foreground">
              Le chef est choisi parmi les personnes qui ont déjà un compte
              ScanDoc. Il pourra ensuite ajouter les membres de son
              département. Vous pouvez aussi le désigner plus tard.
            </p>
            {people !== undefined && list.length === 0 ? (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                <p>{EMPTY_PEOPLE}</p>
              </div>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={() => void submit()} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Créer le département
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DepartmentsView() {
  const genLogoUrl = useMutation(api.workspace.generateDepartmentLogoUploadUrl);
  const setLogo = useMutation(api.workspace.setDepartmentLogo);
  const clearLogo = useMutation(api.workspace.clearDepartmentLogo);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [logoBusy, setLogoBusy] = useState(false);

  const me = useQuery(api.workspace.me);
  const inviteAllToSub = useMutation(
    api.departmentMembership.inviteParentMembersToSubgroup,
  );
  const departments = useQuery(api.workspace.listDepartments);
  const removeMember = useMutation(api.workspace.removeMember);
  const deleteDepartment = useMutation(api.workspace.deleteDepartment);

  const [creating, setCreating] = useState(false);
  const [subParent, setSubParent] = useState<{
    id: Id<"departments">;
    name: string;
  } | null>(null);
  const [personDialog, setPersonDialog] = useState<{
    mode: PersonMode;
    departmentId: Id<"departments">;
    departmentName: string;
  } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Id<"departments"> | null>(
    null,
  );
  /** Drill-down : département ouvert (style groupes) */
  const [openDeptId, setOpenDeptId] = useState<Id<"departments"> | null>(null);

  const handleRemove = async (userId: Id<"users">) => {
    try {
      await removeMember({ userId });
      toast.success("Membre retiré du département.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action impossible.");
    }
  };

  if (!departments || !me) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-lg bg-brand-soft text-brand">
            <Building2 className="size-4" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Départements</h2>
            <p className="text-xs text-muted-foreground">
              {me.isAdmin
                ? "Créez les départements, désignez les chefs et gardez une vue d'ensemble."
                : me.isChef
                  ? "Ajoutez les membres de votre département."
                  : "Composition des départements de l'entreprise."}
            </p>
          </div>
        </div>
        {me.isAdmin ? (
          <Button onClick={() => setCreating(true)} className="gap-2">
            <Plus className="size-4" />
            Nouveau département
          </Button>
        ) : null}
      </div>

      <JoinGroupsPanel />
      <MembershipPanel />

      {departments.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Aucun département"
          description={
            me.isAdmin
              ? "Commencez par créer les départements de l'entreprise, puis désignez leurs chefs."
              : "Le DG n'a pas encore créé de département."
          }
          action={
            me.isAdmin ? (
              <Button onClick={() => setCreating(true)} className="gap-2">
                <Plus className="size-4" />
                Créer un département
              </Button>
            ) : undefined
          }
        />
      ) : openDeptId ? (
        (() => {
          const department = departments.find((d) => d._id === openDeptId);
          if (!department) {
            return (
              <Button variant="outline" onClick={() => setOpenDeptId(null)}>
                Retour
              </Button>
            );
          }
          const children = departments.filter(
            (d) => d.parentId === department._id,
          );
          const isParentChef =
            me.isChef && me.department?._id === department._id;
          const canManage =
            me.isAdmin ||
            isParentChef ||
            (me.isChef && me.department?._id === department._id);

          return (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setOpenDeptId(null)}
                >
                  <ArrowLeft className="size-4" />
                  Tous les départements
                </Button>
              </div>

              <Card className="border-border">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-3">
                        {"logoUrl" in department && department.logoUrl ? (
                          <img
                            src={department.logoUrl as string}
                            alt=""
                            className="size-12 rounded-lg border object-cover"
                          />
                        ) : (
                          <div className="flex size-12 items-center justify-center rounded-lg border bg-secondary">
                            <Building2 className="size-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <CardTitle className="flex items-center gap-2 text-base">
                            <span className="truncate">{department.name}</span>
                          </CardTitle>
                          {department.description ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {department.description}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {department.members.length} membre
                      {department.members.length > 1 ? "s" : ""}
                    </Badge>
                  </div>

                  {!department.chief ? (
                    <p className="mt-2 text-xs text-amber-700">
                      Aucun chef désigné.
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Chef : {department.chief.name}
                    </p>
                  )}

                  {(me.isAdmin ||
                    (me.isChef && me.department?._id === department._id)) && (
                    <div className="mt-3 rounded-lg border border-dashed bg-muted/40 p-3">
                      <p className="mb-2 text-xs font-medium">Logo du département</p>
                      <div className="flex flex-wrap gap-2">
                        <input
                          ref={logoInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            e.target.value = "";
                            if (!file) return;
                            if (file.size > 2 * 1024 * 1024) {
                              toast.error("Logo max 2 Mo");
                              return;
                            }
                            setLogoBusy(true);
                            try {
                              const uploadUrl = await genLogoUrl({
                                departmentId: department._id,
                              });
                              const res = await fetch(uploadUrl, {
                                method: "POST",
                                headers: { "Content-Type": file.type },
                                body: file,
                              });
                              if (!res.ok) throw new Error("Upload échoué");
                              const { storageId } = await res.json();
                              await setLogo({
                                departmentId: department._id,
                                storageId,
                              });
                              toast.success("Logo mis à jour");
                            } catch (err) {
                              toast.error(
                                err instanceof Error ? err.message : "Erreur logo",
                              );
                            } finally {
                              setLogoBusy(false);
                            }
                          }}
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={logoBusy}
                          onClick={() => logoInputRef.current?.click()}
                        >
                          {logoBusy ? "Envoi…" : "Choisir un logo"}
                        </Button>
                        {"logoUrl" in department && department.logoUrl ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={logoBusy}
                            onClick={async () => {
                              setLogoBusy(true);
                              try {
                                await clearLogo({ departmentId: department._id });
                                toast.success("Logo retiré");
                              } catch (err) {
                                toast.error(
                                  err instanceof Error ? err.message : "Erreur",
                                );
                              } finally {
                                setLogoBusy(false);
                              }
                            }}
                          >
                            Retirer
                          </Button>
                        ) : null}
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Visible sur la fiche du département (PNG/JPG, max 2 Mo).
                      </p>
                    </div>
                  )}

                  {canManage ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {me.isAdmin ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() =>
                            setPersonDialog({
                              mode: "chief",
                              departmentId: department._id,
                              departmentName: department.name,
                            })
                          }
                        >
                          <Crown className="size-3.5" />
                          {department.chief ? "Remplacer le chef" : "Nommer un chef"}
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() =>
                          setPersonDialog({
                            mode: "member",
                            departmentId: department._id,
                            departmentName: department.name,
                          })
                        }
                      >
                        <UserPlus className="size-3.5" />
                        Ajouter un membre
                      </Button>
                      {me.isAdmin ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1.5 text-destructive"
                          onClick={() => setPendingDelete(department._id)}
                        >
                          <Trash2 className="size-3.5" />
                          Supprimer
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </CardHeader>

                <CardContent className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Membres
                  </p>
                  {department.members.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                      Aucun membre pour l&apos;instant.
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {department.members.map((member) => (
                        <li
                          key={member._id}
                          className="flex items-center gap-3 rounded-lg border border-border/70 bg-card px-3 py-2"
                        >
                          <span className="flex size-8 items-center justify-center rounded-full bg-brand-soft text-[11px] font-semibold text-brand">
                            {initialsOf(member.name)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {member.name}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {member.fonction ?? member.email ?? "—"}
                            </span>
                          </span>
                          {member.departmentRole === "chef" ? (
                            <Badge
                              variant="outline"
                              className="border-amber-200 bg-amber-50 text-[10px] text-amber-700"
                            >
                              Chef
                            </Badge>
                          ) : null}
                          {canManage &&
                          !(member.departmentRole === "chef" && !me.isAdmin) ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-8 text-muted-foreground hover:text-destructive"
                              onClick={() => void handleRemove(member._id)}
                            >
                              <X className="size-3.5" />
                            </Button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              {/* Groupes / groupes rattachés (style Facebook groups) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold">Groupes</h3>
                    <p className="text-xs text-muted-foreground">
                      Sous-groupes rattachés à « {department.name} »
                    </p>
                  </div>
                  {canManage ? (
                    <Button
                      size="sm"
                      className="gap-1.5"
                      onClick={() =>
                        setSubParent({
                          id: department._id,
                          name: department.name,
                        })
                      }
                    >
                      <Plus className="size-3.5" />
                      Créer un groupe
                    </Button>
                  ) : null}
                </div>

                {children.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                    Aucun groupe pour le moment.
                    {canManage
                      ? " Créez un groupe pour organiser des équipes à l'intérieur de ce département."
                      : ""}
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {children.map((sub) => {
                      const canManageSub =
                        me.isAdmin ||
                        isParentChef ||
                        (me.isChef && me.department?._id === sub._id);
                      return (
                        <Card
                          key={sub._id}
                          className="border-border bg-secondary/30"
                        >
                          <CardHeader className="pb-2">
                            <CardTitle className="flex items-center gap-2 text-sm">
                              <Users className="size-3.5 text-brand" />
                              <span className="truncate">{sub.name}</span>
                            </CardTitle>
                            {sub.description ? (
                              <p className="text-xs text-muted-foreground">
                                {sub.description}
                              </p>
                            ) : null}
                            <p className="text-[11px] text-muted-foreground">
                              {sub.members.length} membre
                              {sub.members.length > 1 ? "s" : ""}
                              {sub.chief ? ` · Chef : ${sub.chief.name}` : ""}
                            </p>
                          </CardHeader>
                          <CardContent className="space-y-2">
                            {canManageSub ? (
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  size="sm"
                                  variant="default"
                                  className="h-8 gap-1 text-xs"
                                  onClick={async () => {
                                    try {
                                      const r = await inviteAllToSub({
                                        subgroupId: sub._id,
                                      });
                                      toast.success(
                                        `${r.invited} invitation(s) envoyée(s)` +
                                          (r.skipped
                                            ? ` · ${r.skipped} déjà en cours`
                                            : ""),
                                      );
                                    } catch (e) {
                                      toast.error(
                                        e instanceof Error
                                          ? e.message
                                          : "Invitation impossible",
                                      );
                                    }
                                  }}
                                >
                                  Inviter tout le département
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 gap-1 text-xs"
                                  onClick={() =>
                                    setPersonDialog({
                                      mode: "member",
                                      departmentId: sub._id,
                                      departmentName: sub.name,
                                    })
                                  }
                                >
                                  <UserPlus className="size-3" />
                                  Membre
                                </Button>
                                {me.isAdmin ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 gap-1 text-xs"
                                    onClick={() =>
                                      setPersonDialog({
                                        mode: "chief",
                                        departmentId: sub._id,
                                        departmentName: sub.name,
                                      })
                                    }
                                  >
                                    <Crown className="size-3" />
                                    Chef
                                  </Button>
                                ) : null}
                              </div>
                            ) : null}
                            {sub.members.length > 0 ? (
                              <ul className="space-y-1">
                                {sub.members.slice(0, 5).map((m) => (
                                  <li
                                    key={m._id}
                                    className="flex items-center gap-2 text-xs"
                                  >
                                    <span className="flex size-6 items-center justify-center rounded-full bg-brand-soft text-[9px] font-semibold text-brand">
                                      {initialsOf(m.name)}
                                    </span>
                                    <span className="truncate">{m.name}</span>
                                  </li>
                                ))}
                                {sub.members.length > 5 ? (
                                  <li className="text-[11px] text-muted-foreground">
                                    +{sub.members.length - 5} autres
                                  </li>
                                ) : null}
                              </ul>
                            ) : (
                              <p className="text-[11px] text-muted-foreground">
                                Aucun membre
                              </p>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })()
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {departments
            .filter((d) => !d.parentId)
            .map((department) => {
              const childCount = departments.filter(
                (d) => d.parentId === department._id,
              ).length;
              return (
                <button
                  key={department._id}
                  type="button"
                  onClick={() => setOpenDeptId(department._id)}
                  className="rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-brand/40 hover:bg-secondary/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-base font-semibold">
                        <Building2 className="size-4 shrink-0 text-brand" />
                        <span className="truncate">{department.name}</span>
                      </p>
                      {department.description ? (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {department.description}
                        </p>
                      ) : null}
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        {department.members.length} membre
                        {department.members.length > 1 ? "s" : ""}
                        {department.chief
                          ? ` · Chef : ${department.chief.name}`
                          : " · Pas de chef"}
                        {childCount > 0
                          ? ` · ${childCount} groupe${childCount > 1 ? "s" : ""}`
                          : ""}
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      Ouvrir
                    </Badge>
                  </div>
                </button>
              );
            })}
        </div>
      )}

      <CreateDepartmentDialog open={creating} onOpenChange={setCreating} />
      <CreateSubDepartmentDialog
        parent={subParent}
        onOpenChange={(open) => {
          if (!open) setSubParent(null);
        }}
      />

      <AssignPersonDialog
        mode={personDialog?.mode ?? null}
        departmentId={personDialog?.departmentId ?? null}
        departmentName={personDialog?.departmentName}
        onOpenChange={(open) => {
          if (!open) setPersonDialog(null);
        }}
      />

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce département ?</AlertDialogTitle>
            <AlertDialogDescription>
              Les membres seront simplement retirés du département. Les
              documents déjà envoyés ne sont pas supprimés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingDelete) return;
                void deleteDepartment({ departmentId: pendingDelete })
                  .then(() => toast.success("Département supprimé."))
                  .catch((error: unknown) =>
                    toast.error(
                      error instanceof Error ? error.message : "Suppression impossible.",
                    ),
                  );
                setPendingDelete(null);
              }}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
