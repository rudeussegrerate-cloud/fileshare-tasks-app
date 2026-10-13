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

export default crons;
