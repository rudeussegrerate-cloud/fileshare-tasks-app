import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { Loader2, Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Collects the personal details a person must fill in before they can be
 * placed in a department. Used for the onboarding step and for later edits.
 */
export function ProfileForm({
  initialName = "",
  initialFonction = "",
  initialPhone = "",
  submitLabel = "Enregistrer",
  onSaved,
}: {
  initialName?: string;
  initialFonction?: string;
  initialPhone?: string;
  submitLabel?: string;
  onSaved?: () => void;
}) {
  const completeProfile = useMutation(api.workspace.completeProfile);
  const [name, setName] = useState(initialName);
  const [fonction, setFonction] = useState(initialFonction);
  const [phone, setPhone] = useState(initialPhone);
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await completeProfile({
        name: name.trim(),
        fonction: fonction.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      toast.success("Vos informations ont été enregistrées.");
      onSaved?.();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Enregistrement impossible. Réessayez.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="profile-name">Nom complet</Label>
        <Input
          id="profile-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Ex : Awa Diop"
          required
          minLength={3}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="profile-fonction">Fonction / poste</Label>
          <Input
            id="profile-fonction"
            value={fonction}
            onChange={(event) => setFonction(event.target.value)}
            placeholder="Ex : Comptable"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="profile-phone">Téléphone</Label>
          <Input
            id="profile-phone"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="Ex : +228 90 00 00 00"
          />
        </div>
      </div>
      <Button type="submit" disabled={saving} className="gap-2">
        {saving ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Save className="size-4" />
        )}
        {submitLabel}
      </Button>
    </form>
  );
}
