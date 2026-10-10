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

async function extractPdf(file: File) {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (
    await import("pdfjs-dist/build/pdf.worker.min.mjs?url")
  ).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;

  const pages = Math.min(pdf.numPages, 15);
  let text = "";
  for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    text += `${content.items
      .map((item) => ("str" in item ? item.str : " "))
      .join(" ")}\n`;
    if (text.length > MAX_CHARS) break;
  }
  return text;
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
