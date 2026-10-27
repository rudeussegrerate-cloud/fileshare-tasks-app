import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/**
 * Tâches planifiées ScanDoc.
 * - Alertes automatiques d'échéance circuit (proche / retard)
 */
const crons = cronJobs();

// Toutes les heures : dossiers dont l'étape active approche ou a dépassé l'échéance
crons.interval(
  "circuit-deadline-alerts",
  { hours: 1 },
  internal.documents.runDeadlineAlerts,
  {},
);

// Toutes les heures : courriers non traités après 24 h → en_retard + notif
crons.interval(
  "received-overdue-24h",
  { hours: 1 },
  internal.documents.runReceivedOverdue,
  {},
);

export default crons;
