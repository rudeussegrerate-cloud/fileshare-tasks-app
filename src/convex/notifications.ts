"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { vly } from "../lib/vly-integrations";

/**
 * Envoie un email de notification au destinataire lors de la réception d'un document.
 * Utilise l'intégration VLY (email).
 */
export const sendDocumentReceivedEmail = internalAction({
  args: {
    toEmail: v.string(),
    toName: v.string(),
    senderName: v.string(),
    objet: v.string(),
    tasks: v.array(v.string()),
    fileName: v.string(),
    onBehalfOfName: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    if (!process.env.VLY_INTEGRATION_KEY) {
      console.warn("VLY_INTEGRATION_KEY manquant — email non envoyé");
      return { success: false, error: "missing_key" };
    }

    const tasksList =
      args.tasks.length > 0
        ? args.tasks.map((t) => `• ${t}`).join("<br>")
        : "—";

    const deLaPart = args.onBehalfOfName
      ? `<p><strong>De la part de :</strong> ${args.onBehalfOfName}</p>`
      : "";

    const html = `
      <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a;">
        <h2 style="color: #1e40af;">Nouveau document reçu</h2>
        <p>Bonjour ${args.toName},</p>
        <p><strong>${args.senderName}</strong> vous a transmis un document.</p>
        ${deLaPart}
        <p><strong>Objet :</strong> ${args.objet}</p>
        <p><strong>Fichier :</strong> ${args.fileName}</p>
        <p><strong>Tâches demandées :</strong><br>${tasksList}</p>
        <p style="margin-top: 24px;">
          Connectez-vous à l'application pour consulter le document et mettre à jour son statut.
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="font-size: 12px; color: #6b7280;">Ceci est un message automatique. Merci de ne pas y répondre.</p>
      </div>
    `;

    const text = [
      `Nouveau document reçu`,
      ``,
      `Bonjour ${args.toName},`,
      `${args.senderName} vous a transmis un document.`,
      args.onBehalfOfName ? `De la part de : ${args.onBehalfOfName}` : "",
      `Objet : ${args.objet}`,
      `Fichier : ${args.fileName}`,
      `Tâches : ${args.tasks.join(", ") || "—"}`,
      ``,
      `Connectez-vous à l'application pour le consulter.`,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const result = await vly.email.send({
        to: args.toEmail,
        subject: `[ScanDoc] Nouveau document : ${args.objet}`,
        html,
        text,
      });
      return result;
    } catch (err) {
      console.error("Échec envoi email notification:", err);
      return { success: false, error: String(err) };
    }
  },
});

/**
 * Notification quand le statut d'un document change (optionnel, pour le destinataire ou l'expéditeur).
 */
export const sendStatusChangedEmail = internalAction({
  args: {
    toEmail: v.string(),
    toName: v.string(),
    documentObjet: v.string(),
    newStatus: v.string(),
    changedByName: v.string(),
  },
  handler: async (_ctx, args) => {
    if (!process.env.VLY_INTEGRATION_KEY) {
      return { success: false, error: "missing_key" };
    }

    const statusLabels: Record<string, string> = {
      envoye: "Envoyé",
      consulte: "Consulté",
      en_cours: "En cours de traitement",
      traite: "Traité",
    };
    const label = statusLabels[args.newStatus] ?? args.newStatus;

    const html = `
      <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto;">
        <h2 style="color: #1e40af;">Mise à jour de statut</h2>
        <p>Bonjour ${args.toName},</p>
        <p>Le document <strong>« ${args.documentObjet} »</strong> est passé au statut <strong>${label}</strong>.</p>
        <p>Modifié par : ${args.changedByName}</p>
      </div>
    `;

    try {
      return await vly.email.send({
        to: args.toEmail,
        subject: `[ScanDoc] Statut mis à jour : ${args.documentObjet}`,
        html,
        text: `Le document « ${args.documentObjet} » est passé au statut ${label} (par ${args.changedByName}).`,
      });
    } catch (err) {
      console.error("Échec email statut:", err);
      return { success: false, error: String(err) };
    }
  },
});
