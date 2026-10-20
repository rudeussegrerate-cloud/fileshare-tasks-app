/**
 * Modèle réel de courrier MNDPT (mise en page type fiche officielle).
 *
 * FIXE (généré automatiquement / non inventé par l'utilisateur à chaque fois) :
 * - Emblème République, logo MNDPT, intitulés institutionnels de base
 * - Structure de page, formules types
 *
 * À COMPLÉTER (zones « rouges ») :
 * - Date, qualité signataire, destinataire, N°, objet, réf., mandats, PJ, corps
 * - Logos / photos personnalisables + éléments ajoutés
 */

export const MNDPT_TEMPLATE_ID = "mndpt-courrier-officiel-v2";
export const MNDPT_TEMPLATE_VERSION = "2.0";

export const MNDPT_FIXED = {
  republicMalagasy: "REPOBLIKAN'I MADAGASIKARA",
  republicMotto: "Fitiavana - Tanindrazana - Fandrosoana",
  logoText: "MNDPT",
  logoSub:
    "MINISTÈRE DU DÉVELOPPEMENT NUMÉRIQUE, DES POSTES ET DES TÉLÉCOMMUNICATIONS",
  secretariat: "SECRÉTARIAT GÉNÉRAL",
  directionGenerale: "DIRECTION GÉNÉRALE DU DÉVELOPPEMENT NUMÉRIQUE",
  modelLabel: "Courrier administratif MNDPT",
  disclaimer:
    "Brouillon ScanDoc — à valider et signer hors application avant usage officiel.",
} as const;

/** Champs que l'utilisateur complète (équivalent des zones marquées en rouge) */
export type LetterVariableKey =
  | "location_date"
  | "sender_title"
  | "direction_line"
  | "recipient_block"
  | "outgoing_number"
  | "outgoing_path"
  | "subject"
  | "incoming_reference"
  | "extra_refs"
  | "attachments"
  | "body"
  | "signatory_title"
  | "signatory_name";

export const LETTER_VARIABLE_META: Record<
  LetterVariableKey,
  { label: string; required: boolean; hint: string }
> = {
  location_date: {
    label: "Lieu et date",
    required: true,
    hint: "Ex. Antananarivo, le 03 Août 2026",
  },
  sender_title: {
    label: "Qualité de l'émetteur (en-tête droit)",
    required: true,
    hint: "Ex. Le Directeur de la Transformation Digitale",
  },
  direction_line: {
    label: "Direction / service (colonne gauche)",
    required: true,
    hint: "Ex. DIRECTION DE LA TRANSFORMATION DIGITALE",
  },
  recipient_block: {
    label: "Destinataire",
    required: true,
    hint: "Après « à » — qualité, organisme, adresse",
  },
  outgoing_number: {
    label: "N° (séquence)",
    required: false,
    hint: "Ex. 071 — le chemin SG/DGDN/DTD est proposé automatiquement",
  },
  outgoing_path: {
    label: "Chemin N° (structures)",
    required: false,
    hint: "Ex. MNDPT/SG/DGDN/DTD",
  },
  subject: {
    label: "Objet",
    required: true,
    hint: "Objet du courrier",
  },
  incoming_reference: {
    label: "Réf.",
    required: false,
    hint: "Référence du courrier reçu",
  },
  extra_refs: {
    label: "Références / mandats",
    required: false,
    hint: "Ex. N° Mandat Salohy …",
  },
  attachments: {
    label: "Pièces jointes",
    required: false,
    hint: "Uniquement si confirmées",
  },
  body: {
    label: "Corps du courrier",
    required: true,
    hint: "Texte principal — générable par l'assistant",
  },
  signatory_title: {
    label: "Fonction en signature",
    required: true,
    hint: "Souvent identique à la qualité émetteur",
  },
  signatory_name: {
    label: "Nom du signataire",
    required: false,
    hint: "Optionnel",
  },
};

export type CanvasExtraElement = {
  id: string;
  type: "text" | "image";
  label: string;
  content: string; // texte ou data URL image
};

export type LetterAssets = {
  /** Logo MNDPT (data URL ou chemin public) */
  logoUrl: string | null;
  /** Emblème République */
  sealUrl: string | null;
  /** Photo / tampon / autre image libre */
  extraImageUrl: string | null;
};

export type BlankLetterModel = {
  templateId: string;
  templateVersion: string;
  fixed: typeof MNDPT_FIXED;
  assets: LetterAssets;
  variables: Record<LetterVariableKey, string>;
  extras: CanvasExtraElement[];
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

export function blankBodySkeleton(): string {
  return [
    "Monsieur le Directeur,",
    "",
    "[À COMPLÉTER — le corps peut être généré par l'assistant selon votre intention]",
    "",
    "Je vous prie d'agréer, Monsieur le Directeur, l'expression de ma considération distinguée.",
  ].join("\n");
}

export function createBlankMndptLetter(
  overrides?: Partial<BlankLetterModel["variables"]>,
): BlankLetterModel {
  return {
    templateId: MNDPT_TEMPLATE_ID,
    templateVersion: MNDPT_TEMPLATE_VERSION,
    fixed: { ...MNDPT_FIXED },
    assets: {
      logoUrl: `${import.meta.env.BASE_URL}mndpt-logo.jpg`,
      sealUrl: null,
      extraImageUrl: null,
    },
    variables: {
      location_date: defaultLocationDate(),
      sender_title: "Le Directeur de la Transformation Digitale",
      direction_line: "DIRECTION DE LA TRANSFORMATION DIGITALE",
      recipient_block: "",
      outgoing_number: "",
      outgoing_path: "MNDPT/SG/DGDN/DTD",
      subject: "",
      incoming_reference: "",
      extra_refs: "",
      attachments: "",
      body: blankBodySkeleton(),
      signatory_title: "Le Directeur de la Transformation Digitale",
      signatory_name: "",
      ...overrides,
    },
    extras: [],
  };
}

export function formatOutgoingRef(v: BlankLetterModel["variables"]): string {
  const num = v.outgoing_number.trim();
  const path = v.outgoing_path.trim() || "MNDPT/SG/DGDN/DTD";
  const year = new Date().getFullYear();
  if (!num) return `N°………-${year}/${path}`;
  // Si l'utilisateur a déjà collé un N° complet
  if (/^N°/i.test(num) || num.includes("/")) return num.startsWith("N") ? num : `N°${num}`;
  return `N°${num}-${year}/${path}`;
}

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderMndptLetterHtml(model: BlankLetterModel): string {
  const f = model.fixed;
  const v = model.variables;
  const a = model.assets;
  const refOut = formatOutgoingRef(v);
  const bodyHtml = v.body
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 11px;text-align:justify;">${esc(p)}</p>`)
    .join("");

  const logo = a.logoUrl
    ? `<img src="${esc(a.logoUrl)}" alt="MNDPT" style="max-height:52px;max-width:140px;object-fit:contain"/>`
    : `<div style="font-weight:800;font-size:22px;letter-spacing:1px">${esc(f.logoText)}</div>`;
  const seal = a.sealUrl
    ? `<img src="${esc(a.sealUrl)}" alt="Emblème" style="max-height:64px;max-width:64px;object-fit:contain"/>`
    : `<div style="width:56px;height:56px;border:1px solid #ccc;border-radius:50%;margin:0 auto"></div>`;

  const extrasHtml = model.extras
    .map((el) => {
      if (el.type === "image" && el.content) {
        return `<div style="margin:12px 0"><img src="${esc(el.content)}" alt="${esc(el.label)}" style="max-width:100%;max-height:200px;object-fit:contain"/></div>`;
      }
      return `<div style="margin:8px 0;font-size:12px">${esc(el.content)}</div>`;
    })
    .join("");

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"/>
<title>${esc(v.subject || "Courrier MNDPT")}</title>
<style>
  body{font-family:"Times New Roman",Times,serif;max-width:720px;margin:24px auto;padding:20px;color:#111;font-size:13.5px;line-height:1.45}
  .seal{text-align:center;margin-bottom:8px;font-size:9px}
  .top{display:grid;grid-template-columns:1.1fr 1fr;gap:12px;margin-bottom:14px}
  .left .dir{font-size:10px;text-transform:uppercase;letter-spacing:.02em;margin-top:6px;line-height:1.35}
  .right{text-align:right;font-size:12.5px}
  .meta{margin:14px 0 10px;font-size:12.5px}
  .sig{margin-top:36px;text-align:right}
  .warn{background:#fff7ed;border:1px solid #fdba74;padding:8px;font-size:11px;margin-bottom:12px}
  @media print{.no-print{display:none}}
</style></head><body>
<div class="no-print warn">${esc(f.disclaimer)}</div>
<div class="seal">
  ${seal}
  <div style="font-weight:700;margin-top:4px">${esc(f.republicMalagasy)}</div>
  <div style="font-size:8px">${esc(f.republicMotto)}</div>
</div>
<div class="top">
  <div class="left">
    ${logo}
    <div style="font-size:8px;color:#444;margin-top:2px;max-width:200px">${esc(f.logoSub)}</div>
    <div class="dir">${esc(f.secretariat)}</div>
    <div class="dir">${esc(f.directionGenerale)}</div>
    <div class="dir" style="font-weight:700">${esc(v.direction_line)}</div>
  </div>
  <div class="right">
    <div>${esc(v.location_date)}</div>
    <div style="margin-top:10px">${esc(v.sender_title)}</div>
    <div style="margin:8px 0">à</div>
    <div style="white-space:pre-line;text-align:right">${esc(v.recipient_block) || "………………"}</div>
  </div>
</div>
<div class="meta">
  <div><strong>${esc(refOut)}</strong></div>
  <div style="margin-top:8px"><strong>Objet :</strong> ${esc(v.subject || "………………")}</div>
  ${v.incoming_reference ? `<div style="margin-top:4px"><strong>Réf. :</strong> ${esc(v.incoming_reference)}</div>` : ""}
  ${v.extra_refs ? `<div style="margin-top:4px">${esc(v.extra_refs)}</div>` : ""}
  ${v.attachments ? `<div style="margin-top:4px"><strong>Pièces jointes :</strong> ${esc(v.attachments)}</div>` : ""}
</div>
${bodyHtml}
${extrasHtml}
<div class="sig">
  <div>${esc(v.signatory_title || v.sender_title)}</div>
  <div style="margin-top:40px">${esc(v.signatory_name)}</div>
</div>
</body></html>`;
}
