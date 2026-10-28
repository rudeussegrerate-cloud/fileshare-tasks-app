/**
 * Éditeur de courrier — modèles, import externe → HTML éditable, export Word/PDF.
 */

import { extractTextFromFile, renderCoverThumbnail } from "@/lib/extract-text";

export type LetterTemplate = {
  id: string;
  name: string;
  description: string;
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

function escAttr(s: string) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function escHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Convertit un texte brut en paragraphes HTML éditables. */
export function textToParagraphs(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) return `<p><br/></p>`;

  // Grouper les lignes : double saut = nouveau paragraphe, simple = <br/>
  const blocks = normalized.split(/\n{2,}/);
  return blocks
    .map((block) => {
      const lines = block
        .split("\n")
        .map((l) => escHtml(l.trimEnd()))
        .filter((l, i, arr) => l.length > 0 || arr.length === 1);
      if (lines.length === 0) return `<p><br/></p>`;
      return `<p>${lines.join("<br/>")}</p>`;
    })
    .join("\n");
}

/** Nettoie le HTML mammoth pour l'éditeur. */
function sanitizeImportedHtml(html: string): string {
  let h = html.trim();
  if (!h) return `<p><br/></p>`;
  // Retirer scripts
  h = h.replace(/<script[\s\S]*?<\/script>/gi, "");
  // Images data trop risquées hors mammoth — ok
  // Si le HTML n'a pas de balise block, envelopper
  if (!/<(p|div|h[1-6]|ul|ol|table|br)\b/i.test(h)) {
    return textToParagraphs(h.replace(/<[^>]+>/g, " "));
  }
  return h;
}

async function importDocxToHtml(file: File): Promise<string> {
  try {
    const mammoth = await import("mammoth");
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.convertToHtml(
      { arrayBuffer },
      {
        styleMap: [
          "p[style-name='Heading 1'] => h1:fresh",
          "p[style-name='Heading 2'] => h2:fresh",
          "p[style-name='Title'] => h1:fresh",
        ],
      },
    );
    const html = sanitizeImportedHtml(result.value || "");
    if (html.replace(/<[^>]+>/g, "").trim().length > 0) return html;
  } catch (e) {
    console.warn("[importDocxToHtml] convertToHtml failed", e);
  }
  // Fallback texte brut
  const text = await extractTextFromFile(file);
  if (!text.trim()) {
    throw new Error(
      "Impossible de lire ce fichier Word. Réessayez en .docx (pas .doc ancien).",
    );
  }
  return textToParagraphs(text);
}

async function importPdfToHtml(file: File): Promise<string> {
  let cover: string | null = null;
  let text = "";
  try {
    cover = await renderCoverThumbnail(file, 560);
  } catch (e) {
    console.warn("[importPdf] cover", e);
  }
  try {
    text = await extractTextFromFile(file);
  } catch (e) {
    console.warn("[importPdf] text", e);
  }

  const parts: string[] = [];
  if (cover) {
    parts.push(
      `<p style="text-align:center"><img src="${escAttr(cover)}" alt="Aperçu" style="max-width:100%;max-height:280px;object-fit:contain;border:1px solid #e5e5e5"/></p>`,
    );
  }

  const plain = text.replace(/\s+/g, " ").trim();
  if (plain.length >= 20) {
    parts.push(textToParagraphs(text));
  } else if (cover) {
    // PDF scanné : garder l'image + zone de texte vide
    parts.push(
      `<p><em>Peu de texte détecté (PDF image / scanné). Corrigez ou saisissez le contenu ci-dessous.</em></p>`,
    );
    parts.push(`<p><br/></p>`);
  } else {
    throw new Error(
      "Aucun contenu lisible dans ce PDF. Vérifiez le fichier ou importez une image / Word.",
    );
  }
  return parts.join("\n");
}

async function importImageToHtml(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Lecture image impossible"));
    r.readAsDataURL(file);
  });

  let ocr = "";
  try {
    ocr = await extractTextFromFile(file);
  } catch (e) {
    console.warn("[importImage] OCR", e);
  }

  const parts = [
    `<p style="text-align:center"><img src="${escAttr(dataUrl)}" alt="Modèle" style="max-width:100%;max-height:360px;object-fit:contain"/></p>`,
  ];
  if (ocr.trim().length >= 8) {
    parts.push(textToParagraphs(ocr));
  } else {
    parts.push(
      `<p><em>Image importée. Saisissez ou corrigez le texte manuellement.</em></p>`,
    );
    parts.push(`<p><br/></p>`);
  }
  return parts.join("\n");
}

function extensionOf(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

/**
 * Transforme un fichier externe (PDF, Word, image, texte) en HTML éditable.
 */
export async function importFileToEditableHtml(file: File): Promise<{
  html: string;
  title: string;
}> {
  const title = file.name.replace(/\.[^.]+$/, "") || "Modèle importé";
  const ext = extensionOf(file.name);
  const type = (file.type || "").toLowerCase();

  // Word
  if (
    ext === "docx" ||
    type.includes("wordprocessingml") ||
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return { html: await importDocxToHtml(file), title };
  }
  if (ext === "doc" || type === "application/msword") {
    // .doc binaire : tenter mammoth (échoue souvent) puis texte
    try {
      return { html: await importDocxToHtml(file), title };
    } catch {
      throw new Error(
        "Les fichiers .doc (ancien format) ne sont pas bien supportés. Enregistrez en .docx ou PDF.",
      );
    }
  }

  // PDF
  if (ext === "pdf" || type === "application/pdf") {
    return { html: await importPdfToHtml(file), title };
  }

  // Images
  if (
    type.startsWith("image/") ||
    ["png", "jpg", "jpeg", "webp", "gif", "bmp", "heic", "heif"].includes(ext)
  ) {
    return { html: await importImageToHtml(file), title };
  }

  // Texte / HTML
  if (
    type.startsWith("text/") ||
    ["txt", "md", "rtf", "html", "htm", "csv"].includes(ext)
  ) {
    const raw = await file.text();
    if (ext === "html" || ext === "htm") {
      return { html: sanitizeImportedHtml(raw), title };
    }
    return { html: textToParagraphs(raw), title };
  }

  throw new Error(
    "Format non supporté. Utilisez PDF, Word (.docx), image (JPG/PNG) ou texte.",
  );
}

export function wrapLetterHtml(title: string, bodyHtml: string): string {
  const safeTitle = title.replace(/</g, "").replace(/>/g, "");
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"/><title>${safeTitle}</title>
<style>
  body{font-family:Georgia,"Times New Roman",serif;margin:0;background:#e8edf3;color:#111}
  .page{width:210mm;min-height:297mm;margin:24px auto;background:#fff;padding:22mm 18mm;box-shadow:0 8px 30px rgba(0,0,0,.12);font-size:13px;line-height:1.55}
  .page p{margin:0 0 0.65em}
  .page img{max-width:100%}
  @media print{body{background:#fff}.page{box-shadow:none;margin:0}}
</style></head><body><div class="page">${bodyHtml}</div></body></html>`;
}


/** Convertit les <img src="…"> en data-URL pour Word / téléchargement hors ligne. */
export async function embedImagesAsDataUrls(html: string): Promise<string> {
  const srcs = new Set<string>();
  const re = /<img\b[^>]*\bsrc=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const src = m[1]!.trim();
    if (!src || src.startsWith("data:")) continue;
    srcs.add(src);
  }
  if (srcs.size === 0) return html;

  const map = new Map<string, string>();
  await Promise.all(
    [...srcs].map(async (src) => {
      try {
        const url = src.startsWith("http") || src.startsWith("blob:")
          ? src
          : new URL(src, window.location.href).href;
        const res = await fetch(url);
        if (!res.ok) return;
        const blob = await res.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
        map.set(src, dataUrl);
      } catch (e) {
        console.warn("[embedImagesAsDataUrls]", src, e);
      }
    }),
  );

  if (map.size === 0) return html;
  return html.replace(
    /(<img\b[^>]*\bsrc=["'])([^"']+)(["'])/gi,
    (full, pre, src, post) => {
      const embedded = map.get(src);
      return embedded ? `${pre}${embedded}${post}` : full;
    },
  );
}

export function exportAsWord(title: string, bodyHtml: string): void {
  void exportAsWordAsync(title, bodyHtml);
}

export async function exportAsWordAsync(
  title: string,
  bodyHtml: string,
): Promise<void> {
  const safe =
    title.replace(/[^\w\s\-àâäéèêëïîôùûüç]/gi, "").trim() || "courrier";
  const embeddedBody = await embedImagesAsDataUrls(bodyHtml);
  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:w="urn:schemas-microsoft-com:office:word"
 xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"/><title>${safe}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
<style>
  body{font-family:Georgia,"Times New Roman",serif;font-size:12pt;line-height:1.5}
  p{margin:0 0 8pt}
  img{max-width:100%}
  @page{size:A4;margin:2cm}
</style>
</head><body>${embeddedBody}</body></html>`;
  const blob = new Blob(["\ufeff", html], {
    type: "application/msword;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safe.slice(0, 40)}.doc`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportAsPdf(title: string, bodyHtml: string): void {
  const w = window.open("", "_blank");
  if (!w) throw new Error("Autorisez les pop-ups pour exporter en PDF");
  w.document.write(wrapLetterHtml(title, bodyHtml));
  w.document.close();
  w.focus();
  window.setTimeout(() => {
    try {
      w.print();
    } catch {
      /* ignore */
    }
  }, 350);
}
