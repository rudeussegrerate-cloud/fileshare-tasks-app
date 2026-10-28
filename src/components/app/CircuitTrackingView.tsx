/**
 * Circuit de courrier désactivé — composant conservé pour éviter les imports cassés.
 */
export function CircuitTrackingView(_props: {
  onOpenDocument?: (id: string) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
      Le suivi par circuit d&apos;étapes n&apos;est plus utilisé. Utilisez les
      courriers reçus / envoyés et le statut de traitement (lu, en cours,
      classé).
    </div>
  );
}
