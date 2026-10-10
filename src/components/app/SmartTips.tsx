import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MessageCircle, Send, Sparkles, Users } from "lucide-react";
import { useEffect, useState } from "react";

const STORAGE_KEY = "scandoc-tips-v1";

/**
 * Pop-up d'accueil intelligent (une fois par appareil).
 * Respecte prefers-reduced-motion via classes CSS globales.
 */
export function SmartTips() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY)) return;
      const t = window.setTimeout(() => setOpen(true), 900);
      return () => window.clearTimeout(t);
    } catch {
      /* ignore */
    }
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && dismiss()}>
      <DialogContent className="max-w-md animate-in-up">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-brand" />
            Bienvenue sur ScanDoc
          </DialogTitle>
          <DialogDescription>
            Quelques gestes utiles pour démarrer rapidement.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-3 text-sm">
          <li className="flex gap-3 rounded-md border border-border p-3">
            <Send className="mt-0.5 size-4 shrink-0 text-brand" />
            <div>
              <p className="font-medium">Envoyer un document</p>
              <p className="text-xs text-muted-foreground">
                Menu <strong>Envoyer</strong> — fichier, destinataire, objet et
                tâches.
              </p>
            </div>
          </li>
          <li className="flex gap-3 rounded-md border border-border p-3">
            <MessageCircle className="mt-0.5 size-4 shrink-0 text-brand" />
            <div>
              <p className="font-medium">Écrire à un collègue</p>
              <p className="text-xs text-muted-foreground">
                Menu <strong>Messages</strong>, ou cliquez un nom dans{" "}
                <strong>Collègues</strong>.
              </p>
            </div>
          </li>
          <li className="flex gap-3 rounded-md border border-border p-3">
            <Users className="mt-0.5 size-4 shrink-0 text-brand" />
            <div>
              <p className="font-medium">Assistant personnel</p>
              <p className="text-xs text-muted-foreground">
                Le petit personnage en bas à droite répond si vous êtes perdu.
              </p>
            </div>
          </li>
        </ul>
        <Button className="w-full" onClick={dismiss}>
          Compris, commencer
        </Button>
      </DialogContent>
    </Dialog>
  );
}
