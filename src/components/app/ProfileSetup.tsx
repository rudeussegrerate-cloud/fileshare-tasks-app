import { ProfileForm } from "@/components/app/ProfileForm";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { FileText, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { useNavigate } from "react-router";

/**
 * Shown right after signing in until the person has filled in their details.
 * These details are what the DG and the chefs see when they select someone to
 * join a department.
 */
export function ProfileSetup() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-brand-deep via-brand to-brand-sky/70 px-4 py-12">
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
          backgroundSize: "22px 22px",
        }}
      />
      <div className="relative w-full max-w-lg">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-white/15 text-white">
            <FileText className="size-4" />
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-semibold text-white">
              ScanDoc
            </span>
            <span className="block text-[10px] uppercase tracking-wide text-white/60">
              Fichiers inter-départements
            </span>
          </span>
        </div>

        <Card className="border-0 shadow-2xl">
          <CardHeader>
            <div className="flex size-11 items-center justify-center rounded-xl bg-brand-soft text-brand">
              <UserRound className="size-5" />
            </div>
            <CardTitle className="mt-3 text-xl">
              Complétez vos informations
            </CardTitle>
            <CardDescription>
              Renseignez votre identité une seule fois. Elle permettra au DG et
              aux chefs de département de vous reconnaître avant de vous
              rattacher à un service.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <ProfileForm submitLabel="Valider et continuer" />

            <div className="flex items-start gap-2 rounded-lg border-l-4 border-brand-sky bg-brand-soft/60 px-3 py-2 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-brand-sky" />
              <p>
                Tant que vos informations ne sont pas complétées, vous ne pouvez
                être ajouté à aucun département.
              </p>
            </div>

            <Button
              type="button"
              variant="ghost"
              className="gap-2 text-muted-foreground"
              onClick={async () => {
                await signOut();
                navigate("/");
              }}
            >
              <LogOut className="size-4" />
              Se déconnecter
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
