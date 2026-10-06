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
import {
  Building2,
  Crown,
  Info,
  Loader2,
  Plus,
  Trash2,
  UserPlus,
  UserRound,
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
  const me = useQuery(api.workspace.me);
  const departments = useQuery(api.workspace.listDepartments);
  const removeMember = useMutation(api.workspace.removeMember);
  const deleteDepartment = useMutation(api.workspace.deleteDepartment);

  const [creating, setCreating] = useState(false);
  const [personDialog, setPersonDialog] = useState<{
    mode: PersonMode;
    departmentId: Id<"departments">;
    departmentName: string;
  } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Id<"departments"> | null>(
    null,
  );

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
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {departments.map((department) => {
            const canManage =
              me.isAdmin ||
              (me.isChef && me.department?._id === department._id);

            return (
              <Card key={department._id} className="border-border/80 shadow-none">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Building2 className="size-4 text-brand" />
                        <span className="truncate">{department.name}</span>
                      </CardTitle>
                      {department.description ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {department.description}
                        </p>
                      ) : null}
                    </div>
                    <Badge variant="outline" className="shrink-0 border-border text-[10px]">
                      {department.members.length} membre
                      {department.members.length > 1 ? "s" : ""}
                    </Badge>
                  </div>

                  {!department.chief ? (
                    <p className="mt-2 text-xs text-amber-700">
                      Aucun chef désigné : personne ne peut encore ajouter de
                      membres à ce département.
                    </p>
                  ) : null}

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
                          className="gap-1.5 text-destructive hover:text-destructive"
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
                  {department.members.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                      Aucun membre pour l'instant.
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
                              className="gap-1 border-amber-200 bg-amber-50 text-[10px] text-amber-700"
                            >
                              <Crown className="size-3" />
                              Chef
                            </Badge>
                          ) : null}
                          {canManage &&
                          member._id !== me.user._id &&
                          !(member.departmentRole === "chef" && !me.isAdmin) ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-7 text-muted-foreground hover:text-destructive"
                              onClick={() => void handleRemove(member._id)}
                              title="Retirer du département"
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
            );
          })}
        </div>
      )}

      {me.isChef && !me.isAdmin && me.department ? (
        <div className="flex items-start gap-2 rounded-lg border border-brand-sky/25 bg-brand-soft/60 px-4 py-3 text-xs text-muted-foreground">
          <UserRound className="mt-0.5 size-4 shrink-0 text-brand-sky" />
          <p>
            En tant que chef du département{" "}
            <span className="font-medium text-foreground">
              {me.department.name}
            </span>
            , vous pouvez rattacher des personnes qui ont déjà un compte. La
            création des départements et la nomination des chefs restent
            réservées au DG.
          </p>
        </div>
      ) : null}

      <CreateDepartmentDialog open={creating} onOpenChange={setCreating} />

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
