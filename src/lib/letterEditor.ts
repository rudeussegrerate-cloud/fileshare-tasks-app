/**
 * Éditeur de courrier libre — blocs modifiables + modèles importables.
 * Aucune structure imposée : l'utilisateur choisit un modèle puis modifie tout.
 */

export type BlockType = "heading" | "paragraph" | "image" | "divider" | "spacer";

export type LetterBlock = {
  id: string;
  type: BlockType;
  content: string;
  /** Alignement du texte */
  align?: "left" | "center" | "right";
  /** Taille relative (heading) */
  level?: 1 | 2 | 3;
};

export type FreeLetterDoc = {
  id: string;
  title: string;
  /** Identifiant du modèle d'origine (optionnel) */
  templateId: string | null;
  blocks: LetterBlock[];
  updatedAt: number;
};

export type LetterTemplate = {
  id: string;
  name: string;
  description: string;
  blocks: Omit<LetterBlock, "id">[];
};

function uid() {
  return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function withIds(blocks: Omit<LetterBlock, "id">[]): LetterBlock[] {
  return blocks.map((b) => ({ ...b, id: uid() }));
}

/** Page blanche */
export const TEMPLATE_BLANK: LetterTemplate = {
  id: "blank",
  name: "Page blanche",
  description: "Document vide — ajoutez vos propres blocs",
  blocks: [
    { type: "heading", content: "Titre du document", align: "center", level: 1 },
    { type: "paragraph", content: "Commencez à rédiger ici…", align: "left" },
  ],
};

/** Modèle MNDPT — point de départ modifiable (pas figé) */
export const TEMPLATE_MNDPT: LetterTemplate = {
  id: "mndpt-officiel",
  name: "Courrier MNDPT",
  description: "Trame administrative — entièrement modifiable après insertion",
  blocks: [
    {
      type: "heading",
      content: "REPOBLIKAN'I MADAGASIKARA",
      align: "center",
      level: 2,
    },
    {
      type: "paragraph",
      content: "Fitiavana – Tanindrazana – Fandrosoana",
      align: "center",
    },
    {
      type: "heading",
      content:
        "MINISTÈRE DU DÉVELOPPEMENT NUMÉRIQUE, DES POSTES ET DES TÉLÉCOMMUNICATIONS",
      align: "center",
      level: 3,
    },
    { type: "divider", content: "" },
    {
      type: "paragraph",
      content: "Antananarivo, le …",
      align: "right",
    },
    {
      type: "paragraph",
      content: "Le Directeur de …",
      align: "left",
    },
    {
      type: "paragraph",
      content: "à\nMonsieur / Madame …\nOrganisme\nAdresse",
      align: "left",
    },
    {
      type: "paragraph",
      content: "N° ……… / MNDPT/…",
      align: "left",
    },
    {
      type: "paragraph",
      content: "Objet : …",
      align: "left",
    },
    {
      type: "paragraph",
      content: "Réf. : …",
      align: "left",
    },
    { type: "spacer", content: "" },
    {
      type: "paragraph",
      content:
        "Monsieur le Directeur,\n\n[Corps du message]\n\nJe vous prie d'agréer, Monsieur le Directeur, l'expression de ma considération distinguée.",
      align: "left",
    },
    { type: "spacer", content: "" },
    {
      type: "paragraph",
      content: "Le Directeur de …\n\n[Nom du signataire]",
      align: "right",
    },
  ],
};

/** Lettre simple générique */
export const TEMPLATE_SIMPLE: LetterTemplate = {
  id: "lettre-simple",
  name: "Lettre simple",
  description: "En-tête, corps, formule de politesse",
  blocks: [
    { type: "paragraph", content: "Lieu, le …", align: "right" },
    { type: "spacer", content: "" },
    { type: "paragraph", content: "Destinataire\nAdresse", align: "left" },
    { type: "spacer", content: "" },
    { type: "paragraph", content: "Objet : …", align: "left" },
    { type: "spacer", content: "" },
    {
      type: "paragraph",
      content: "Madame, Monsieur,\n\n…\n\nVeuillez agréer mes salutations distinguées.",
      align: "left",
    },
    { type: "paragraph", content: "[Signature]", align: "right" },
  ],
};

export const ALL_TEMPLATES: LetterTemplate[] = [
  TEMPLATE_BLANK,
  TEMPLATE_MNDPT,
  TEMPLATE_SIMPLE,
];

export function createDocFromTemplate(tpl: LetterTemplate): FreeLetterDoc {
  return {
    id: uid(),
    title: tpl.name,
    templateId: tpl.id,
    blocks: withIds(tpl.blocks),
    updatedAt: Date.now(),
  };
}

export function createEmptyDoc(): FreeLetterDoc {
  return createDocFromTemplate(TEMPLATE_BLANK);
}

export function renderDocHtml(doc: FreeLetterDoc): string {
  const body = doc.blocks
    .map((b) => {
      const align = b.align || "left";
      if (b.type === "divider") {
        return `<hr style="border:none;border-top:1px solid #ccc;margin:16px 0"/>`;
      }
      if (b.type === "spacer") {
        return `<div style="height:24px"></div>`;
      }
      if (b.type === "image" && b.content) {
        return `<div style="text-align:${align}"><img src="${b.content.replace(/"/g, "")}" alt="" style="max-width:100%;max-height:200px;object-fit:contain"/></div>`;
      }
      const text = (b.content || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br/>");
      if (b.type === "heading") {
        const size = b.level === 1 ? "18px" : b.level === 2 ? "15px" : "13px";
        return `<div style="text-align:${align};font-size:${size};font-weight:700;margin:8px 0;line-height:1.35">${text}</div>`;
      }
      return `<div style="text-align:${align};font-size:12.5px;line-height:1.55;margin:6px 0;white-space:pre-wrap">${text}</div>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"/><title>${doc.title.replace(/</g, "")}</title>
<style>
  body{font-family:Georgia,"Times New Roman",serif;margin:0;background:#e8edf3}
  .page{width:210mm;min-height:297mm;margin:24px auto;background:#fff;padding:22mm 18mm;box-shadow:0 8px 30px rgba(0,0,0,.12)}
  @media print{body{background:#fff}.page{box-shadow:none;margin:0}}
</style></head><body><div class="page">${body}</div></body></html>`;
}
