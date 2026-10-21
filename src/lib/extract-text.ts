/**
 * Extraction de texte côté client (PDF, DOCX, images OCR).
 */

const MAX_CHARS = 40_000;

const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "csv",
  "tsv",
  "json",
  "log",
  "xml",
  "html",
  "htm",
  "yml",
  "yaml",
  "sql",
  "ini",
  "rtf",
]);

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "heic",
  "heif",
  "bmp",
]);

function extensionOf(fileName: string) {
  const parts = fileName.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1]! : "";
}

/** Reconstitue les lignes d'une page PDF via les positions Y. */
function itemsToLines(
  items: Array<{ str?: string; transform?: number[]; width?: number }>,
): string {
  type Tok = { str: string; x: number; y: number };
  const tokens: Tok[] = [];
  for (const item of items) {
    if (!item || typeof item.str !== "string" || !item.str) continue;
    const tr = item.transform;
    if (!tr || tr.length < 6) {
      tokens.push({ str: item.str, x: 0, y: 0 });
      continue;
    }
    tokens.push({ str: item.str, x: tr[4] ?? 0, y: tr[5] ?? 0 });
  }
  if (tokens.length === 0) return "";
  tokens.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: string[] = [];
  let currentY = tokens[0]!.y;
  let lineToks: Tok[] = [];
  const flush = () => {
    if (!lineToks.length) return;
    lineToks.sort((a, b) => a.x - b.x);
    let line = "";
    let prevRight: number | null = null;
    for (const tok of lineToks) {
      if (prevRight !== null && tok.x - prevRight > 2) line += " ";
      line += tok.str;
      prevRight = tok.x + Math.max(tok.str.length * 3.2, 4);
    }
    const cleaned = line.replace(/\s+/g, " ").trim();
    if (cleaned) lines.push(cleaned);
    lineToks = [];
  };
  for (const tok of tokens) {
    if (Math.abs(tok.y - currentY) > 3.5) {
      flush();
      currentY = tok.y;
    }
    lineToks.push(tok);
  }
  flush();
  return lines.join("\n");
}

async function extractPdf(file: File) {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (
    await import("pdfjs-dist/build/pdf.worker.min.mjs?url")
  ).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;

  const pages = Math.min(pdf.numPages, 20);
  const chunks: string[] = [];
  for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = itemsToLines(
      content.items as Array<{
        str?: string;
        transform?: number[];
        width?: number;
      }>,
    );
    if (pageText) chunks.push(pageText);
    if (chunks.join("\n").length > MAX_CHARS) break;
  }
  return chunks.join("\n\n").slice(0, MAX_CHARS);
}

async function extractDocx(file: File) {
  const mammoth = await import("mammoth");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

/** OCR navigateur via Tesseract.js (français + anglais). */
async function extractImageOcr(file: File): Promise<string> {
  try {
    const Tesseract = await import("tesseract.js");
    const result = await Tesseract.recognize(file, "fra+eng", {
      logger: () => {
        /* silencieux */
      },
    });
    return (result.data.text ?? "").trim();
  } catch (e) {
    console.warn("[extractImageOcr]", e);
    return "";
  }
}

/** Returns the readable text of a file, or "" when nothing could be read. */
export async function extractTextFromFile(file: File): Promise<string> {
  const extension = extensionOf(file.name);
  try {
    if (file.type.startsWith("text/") || TEXT_EXTENSIONS.has(extension)) {
      return (await file.text()).slice(0, MAX_CHARS);
    }
    if (extension === "docx") {
      return (await extractDocx(file)).slice(0, MAX_CHARS);
    }
    if (extension === "pdf" || file.type === "application/pdf") {
      return (await extractPdf(file)).slice(0, MAX_CHARS);
    }
    if (
      file.type.startsWith("image/") ||
      IMAGE_EXTENSIONS.has(extension)
    ) {
      return (await extractImageOcr(file)).slice(0, MAX_CHARS);
    }
  } catch (error) {
    console.warn("[extractTextFromFile] Extraction impossible:", error);
  }
  return "";
}

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Miniature de couverture (1re page PDF ou image). Retourne une data URL ou object URL. */
export async function renderCoverThumbnail(
  file: File,
  maxWidth = 240,
): Promise<string | null> {
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();

  if (type.startsWith("image/") || IMAGE_EXTENSIONS.has(extensionOf(file.name))) {
    return URL.createObjectURL(file);
  }

  const isPdf =
    type === "application/pdf" || name.endsWith(".pdf");
  if (!isPdf) return null;

  try {
    const pdfjs = await import("pdfjs-dist");
    const workerUrl = (
      await import("pdfjs-dist/build/pdf.worker.min.mjs?url")
    ).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjs.getDocument({ data }).promise;
    const page = await pdf.getPage(1);
    const unscaled = page.getViewport({ scale: 1 });
    const scale = Math.min(2, maxWidth / unscaled.width);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    return canvas.toDataURL("image/jpeg", 0.82);
  } catch (e) {
    console.warn("[renderCoverThumbnail] PDF:", e);
    return null;
  }
}
