/**
 * Éditeur de courrier — modèles HTML injectables dans une page A4 éditable.
 */

export type LetterTemplate = {
  id: string;
  name: string;
  description: string;
  /** HTML du corps (contenu contentEditable) */
  html: string;
};

export const TEMPLATE_BLANK: LetterTemplate = {
  id: "blank",
  name: "Page blanche",
  description: "Feuille vide pour rédiger librement",
  html: `<p><br/></p>`,
};

export const TEMPLATE_MNDPT: LetterTemplate = {
  id: "mndpt",
  name: "Courrier MNDPT",
  description: "Trame administrative (modifiable)",
  html: `
<p style="text-align:center;font-weight:700;margin:0 0 4px">REPOBLIKAN'I MADAGASIKARA</p>
<p style="text-align:center;font-size:12px;margin:0 0 8px"><em>Fitiavana – Tanindrazana – Fandrosoana</em></p>
<p style="text-align:center;font-weight:700;font-size:12px;margin:0 0 16px">MINISTÈRE DU DÉVELOPPEMENT NUMÉRIQUE, DES POSTES ET DES TÉLÉCOMMUNICATIONS</p>
<hr style="border:none;border-top:1px solid #999;margin:12px 0"/>
<p style="text-align:right">Antananarivo, le …</p>
<p>Le Directeur de …</p>
<p>à<br/>Monsieur / Madame …<br/>Organisme<br/>Adresse</p>
<p><strong>N°</strong> ……… / MNDPT/…</p>
<p><strong>Objet :</strong> …</p>
<p><strong>Réf. :</strong> …</p>
<p><br/></p>
<p>Monsieur le Directeur,</p>
<p>…</p>
<p>Je vous prie d'agréer, Monsieur le Directeur, l'expression de ma considération distinguée.</p>
<p style="text-align:right"><br/>Le Directeur de …<br/><br/>[Nom]</p>
`.trim(),
};

export const TEMPLATE_SIMPLE: LetterTemplate = {
  id: "simple",
  name: "Lettre simple",
  description: "En-tête, objet, corps, signature",
  html: `
<p style="text-align:right">Lieu, le …</p>
<p><br/></p>
<p>Destinataire<br/>Adresse</p>
<p><br/></p>
<p><strong>Objet :</strong> …</p>
<p><br/></p>
<p>Madame, Monsieur,</p>
<p>…</p>
<p>Veuillez agréer mes salutations distinguées.</p>
<p style="text-align:right"><br/>[Signature]</p>
`.trim(),
};

export const ALL_TEMPLATES: LetterTemplate[] = [
  TEMPLATE_BLANK,
  TEMPLATE_MNDPT,
  TEMPLATE_SIMPLE,
];

export function wrapLetterHtml(title: string, bodyHtml: string): string {
  const safeTitle = title.replace(/</g, "").replace(/>/g, "");
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"/><title>${safeTitle}</title>
<style>
  body{font-family:Georgia,"Times New Roman",serif;margin:0;background:#e8edf3;color:#111}
  .page{width:210mm;min-height:297mm;margin:24px auto;background:#fff;padding:22mm 18mm;box-shadow:0 8px 30px rgba(0,0,0,.12);font-size:13px;line-height:1.55}
  .page p{margin:0 0 0.65em}
  @media print{body{background:#fff}.page{box-shadow:none;margin:0}}
</style></head><body><div class="page">${bodyHtml}</div></body></html>`;
}
