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

function textToParagraphs(text: string): string {
  const parts = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return `<p><br/></p>`;
  return parts
    .map((p) => {
      const lines = p
        .split("\n")
        .map((l) =>
          l
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;"),
        )
        .join("<br/>");
      return `<p>${lines || "<br/>"}</p>`;
    })
    .join("\n");
}

async function importDocxToHtml(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer });
  const html = (result.value || "").trim();
  return html || textToParagraphs(await extractTextFromFile(file));
}

async function importPdfToHtml(file: File): Promise<string> {
  const cover = await renderCoverThumbnail(file, 520);
  const text = await extractTextFromFile(file);
  const parts: string[] = [];
  if (cover) {
    parts.push(
      `<p style="text-align:center"><img src="${escAttr(cover)}" alt="Aperçu PDF" style="max-width:100%;max-height:320px;object-fit:contain;border:1px solid #ddd"/></p>`,
    );
    parts.push(
      `<p style="font-size:11px;color:#666;text-align:center"><em>Page de couverture importée — texte extrait ci-dessous (éditable)</em></p>`,
    );
  }
  if (text.trim()) {
    parts.push(textToParagraphs(text));
  } else if (!cover) {
    parts.push(
      `<p><em>Aucun texte détecté dans ce PDF. Rédigez manuellement.</em></p>`,
    );
  }
  return parts.join("\n") || `<p><br/></p>`;
}

async function importImageToHtml(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Lecture image impossible"));
    r.readAsDataURL(file);
  });
  const ocr = await extractTextFromFile(file);
  const parts: string[] = [
    `<p style="text-align:center"><img src="${escAttr(dataUrl)}" alt="Modèle importé" style="max-width:100%;max-height:360px;object-fit:contain"/></p>`,
  ];
  if (ocr.trim()) {
    parts.push(
      `<p style="font-size:11px;color:#666;text-align:center"><em>Texte détecté (OCR) — vous pouvez le corriger</em></p>`,
    );
    parts.push(textToParagraphs(ocr));
  } else {
    parts.push(
      `<p><em>Image importée. Ajoutez ou corrigez le texte manuellement.</em></p>`,
    );
  }
  return parts.join("\n");
}

/**
 * Transforme un fichier externe (PDF, Word, image, texte) en HTML éditable.
 */
export async function importFileToEditableHtml(file: File): Promise<{
  html: string;
  title: string;
}> {
  const name = file.name.replace(/\.[^.]+$/, "") || "Modèle importé";
  const ext = file.name.toLowerCase().split(".").pop() || "";
  const type = (file.type || "").toLowerCase();

  if (
    ext === "docx" ||
    type.includes("wordprocessingml") ||
    type === "application/msword"
  ) {
    if (ext === "doc" && !ext.endsWith("docx") && type === "application/msword") {
      // .doc binaire ancien : texte brut si possible
      const text = await extractTextFromFile(file);
      return {
        html: text.trim()
          ? textToParagraphs(text)
          : `<p><em>Format .doc ancien peu supporté. Préférez .docx ou PDF.</em></p>`,
        title: name,
      };
    }
    return { html: await importDocxToHtml(file), title: name };
  }

  if (ext === "pdf" || type === "application/pdf") {
    return { html: await importPdfToHtml(file), title: name };
  }

  if (type.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif", "heic"].includes(ext)) {
    return { html: await importImageToHtml(file), title: name };
  }

  if (type.startsWith("text/") || ["txt", "md", "rtf", "html", "htm"].includes(ext)) {
    const raw = await file.text();
    if (ext === "html" || ext === "htm") {
      return { html: raw, title: name };
    }
    return { html: textToParagraphs(raw), title: name };
  }

  throw new Error(
    "Format non supporté. Importez un PDF, Word (.docx), image ou fichier texte.",
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

/** Export Word : HTML Word-compatible (.doc) */
export function exportAsWord(title: string, bodyHtml: string): void {
  const safe = title.replace(/[^\w\s\-àâäéèêëïîôùûüç]/gi, "").trim() || "courrier";
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
</head><body>${bodyHtml}</body></html>`;
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

/** Export PDF via dialogue d'impression du navigateur */
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
