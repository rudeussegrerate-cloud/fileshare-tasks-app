/**
 * Modèle de courrier MNDPT — éléments FIXES (ne changent jamais)
 * vs champs VARIABLES à compléter par l'utilisateur / l'assistant.
 *
 * Les logos HD officiels seront branchés ici dès qu'ils sont fournis.
 * En attendant : libellés institutionnels stabilisés.
 */

export const MNDPT_TEMPLATE_ID = "mndpt-courrier-v1";
export const MNDPT_TEMPLATE_VERSION = "1.0";

/** Bloc institutionnel — ne jamais laisser l'IA le modifier */
export const MNDPT_FIXED = {
  republic: "République de Madagascar",
  ministry:
    "Ministère du Numérique, de la Poste et des Télécommunications",
  /** Sous-titre d'en-tête (peut être affiné par direction plus tard, hors IA) */
  headerNote: "Secrétariat Général",
  modelLabel: "Courrier administratif — modèle MNDPT",
  disclaimer:
    "Brouillon généré dans ScanDoc — à valider et signer hors application avant usage officiel.",
  /** Placeholders de mise en page (export) */
  leftLogoLabel: "[Logo MNDPT]",
  centerEmblemLabel: "[Emblème / Drapeau]",
} as const;

/** Champs indispensables que l'utilisateur doit pouvoir renseigner */
export type LetterVariableKey =
  | "location_date"
  | "outgoing_reference"
  | "incoming_reference"
  | "recipient_block"
  | "subject"
  | "body"
  | "attachments"
  | "signatory_title"
  | "signatory_name"
  | "sender_service";

export const LETTER_VARIABLE_META: Record<
  LetterVariableKey,
  { label: string; required: boolean; hint: string }
> = {
  location_date: {
    label: "Lieu et date",
    required: true,
    hint: "Ex. Antananarivo, le 20 octobre 2026",
  },
  outgoing_reference: {
    label: "N° du courrier sortant",
    required: false,
    hint: "Saisie manuelle — jamais inventé par l'IA",
  },
  incoming_reference: {
    label: "Réf. du courrier reçu",
    required: false,
    hint: "N° et date de la correspondance à laquelle on répond",
  },
  recipient_block: {
    label: "Destinataire",
    required: true,
    hint: "Qualité, nom, organisme (plusieurs lignes possibles)",
  },
  subject: {
    label: "Objet",
    required: true,
    hint: "Objet du courrier de réponse",
  },
  body: {
    label: "Corps du courrier",
    required: true,
    hint: "Texte principal — éditable après génération",
  },
  attachments: {
    label: "Pièces jointes",
    required: false,
    hint: "Uniquement si confirmées",
  },
  signatory_title: {
    label: "Fonction du signataire",
    required: true,
    hint: "Ex. Le Directeur de la Transformation Digitale",
  },
  signatory_name: {
    label: "Nom du signataire",
    required: false,
    hint: "Optionnel selon les usages",
  },
  sender_service: {
    label: "Service / direction émettrice",
    required: false,
    hint: "Affiché sous l'en-tête institutionnel",
  },
};

export function defaultLocationDate(): string {
  try {
    const fmt = new Date().toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    return `Antananarivo, le ${fmt}`;
  } catch {
    return "Antananarivo, le …";
  }
}

/** Corps type vierge (structure administrative, sans décision inventée) */
export function blankBodySkeleton(): string {
  return [
    "Monsieur, Madame,",
    "",
    "J'ai l'honneur de vous faire part de ce qui suit.",
    "",
    "[À COMPLÉTER — objet de la réponse / suite donnée]",
    "",
    "Je vous prie d'agréer, Monsieur, Madame, l'expression de ma considération distinguée.",
  ].join("\n");
}

export type BlankLetterModel = {
  templateId: string;
  templateVersion: string;
  fixed: typeof MNDPT_FIXED;
  variables: {
    location_date: string;
    outgoing_reference: string;
    incoming_reference: string;
    recipient_block: string;
    subject: string;
    body: string;
    attachments: string;
    signatory_title: string;
    signatory_name: string;
    sender_service: string;
  };
};

/** Génère un modèle vierge prêt à compléter */
export function createBlankMndptLetter(
  overrides?: Partial<BlankLetterModel["variables"]>,
): BlankLetterModel {
  return {
    templateId: MNDPT_TEMPLATE_ID,
    templateVersion: MNDPT_TEMPLATE_VERSION,
    fixed: { ...MNDPT_FIXED },
    variables: {
      location_date: defaultLocationDate(),
      outgoing_reference: "",
      incoming_reference: "",
      recipient_block: "",
      subject: "",
      body: blankBodySkeleton(),
      attachments: "",
      signatory_title: "",
      signatory_name: "",
      sender_service: "",
      ...overrides,
    },
  };
}

/** HTML d'export / aperçu — en-tête fixe + variables */
export function renderMndptLetterHtml(model: BlankLetterModel): string {
  const f = model.fixed;
  const v = model.variables;
  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const bodyHtml = v.body
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 12px;text-align:justify;">${esc(p)}</p>`,
    )
    .join("");

  const dest = esc(v.recipient_block).replace(/\n/g, "<br/>");
  const missing: string[] = [];
  if (!v.subject.trim()) missing.push("Objet");
  if (!v.recipient_block.trim()) missing.push("Destinataire");
  if (!v.signatory_title.trim()) missing.push("Fonction du signataire");
  if (!v.outgoing_reference.trim()) missing.push("N° sortant");

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"/>
<title>${esc(v.subject || "Courrier MNDPT — brouillon")}</title>
<style>
  body{font-family:"Times New Roman",Times,serif;max-width:720px;margin:28px auto;padding:20px;color:#111;line-height:1.5;font-size:14px}
  .fixed-banner{font-size:11px;color:#555;border:1px dashed #94a3b8;background:#f8fafc;padding:8px 10px;margin-bottom:16px}
  .header{display:grid;grid-template-columns:1fr 1.2fr 1fr;gap:8px;align-items:start;border-bottom:2px solid #0f2744;padding-bottom:12px;margin-bottom:18px}
  .logo-box{border:1px solid #cbd5e1;min-height:64px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#64748b;text-align:center;padding:6px}
  .inst{text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:.03em}
  .inst strong{display:block;font-size:12px;margin-top:4px}
  .meta{display:flex;justify-content:space-between;gap:16px;margin:16px 0;font-size:13px}
  .dest{margin:18px 0;white-space:pre-line}
  .obj{margin:14px 0}
  .sig{margin-top:40px;text-align:right}
  .warn{background:#fff7ed;border:1px solid #fdba74;padding:8px 12px;font-size:12px;margin-bottom:14px}
  @media print{.no-print{display:none}}
</style></head><body>
<div class="fixed-banner no-print">${esc(f.disclaimer)} · Modèle ${esc(model.templateId)} v${esc(model.templateVersion)}</div>
${
  missing.length
    ? `<div class="warn no-print"><strong>Champs à compléter :</strong> ${esc(missing.join(", "))}</div>`
    : ""
}
<div class="header">
  <div class="logo-box">${esc(f.leftLogoLabel)}</div>
  <div class="inst">
    <div>${esc(f.republic)}</div>
    <strong>${esc(f.ministry)}</strong>
    <div style="margin-top:6px;font-size:10px;text-transform:none;letter-spacing:0">${esc(f.headerNote)}</div>
    ${v.sender_service ? `<div style="margin-top:4px;font-size:11px;text-transform:none;font-weight:600">${esc(v.sender_service)}</div>` : ""}
  </div>
  <div class="logo-box">${esc(f.centerEmblemLabel)}</div>
</div>
<div class="meta">
  <div>
    <div><strong>N°</strong> ${esc(v.outgoing_reference || "………………")}</div>
    ${v.incoming_reference ? `<div style="margin-top:6px"><strong>Réf.</strong> ${esc(v.incoming_reference)}</div>` : ""}
  </div>
  <div style="text-align:right">${esc(v.location_date || "………………")}</div>
</div>
<div class="dest">${dest || "<em>Destinataire ………………</em>"}</div>
<div class="obj"><strong>Objet :</strong> ${esc(v.subject || "………………")}</div>
${bodyHtml || "<p><em>[Corps du courrier]</em></p>"}
${
  v.attachments.trim()
    ? `<p style="margin-top:16px"><strong>P.J. :</strong> ${esc(v.attachments)}</p>`
    : ""
}
<div class="sig">
  <div>${esc(v.signatory_title || "………………………………")}</div>
  <div style="margin-top:36px">${esc(v.signatory_name || "")}</div>
</div>
</body></html>`;
}
