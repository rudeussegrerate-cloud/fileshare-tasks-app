/**
 * Transforme une photo en style « Ghibli / anime doux » côté navigateur.
 * Fallback : image originale redimensionnée si le canvas échoue.
 */

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Impossible de lire l'image"));
    };
    img.src = url;
  });
}

async function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = "image/png",
  quality = 0.92,
): Promise<Blob> {
  return await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Export image impossible"))),
      type,
      quality,
    );
  });
}

/** Redimensionne sans stylisation (secours). */
export async function resizeImage(
  file: File,
  max = 512,
): Promise<Blob> {
  const img = await loadImageElement(file);
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(64, Math.round(img.naturalWidth * scale));
  const h = Math.max(64, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponible");
  ctx.drawImage(img, 0, 0, w, h);
  try {
    return await canvasToBlob(canvas, "image/png");
  } catch {
    return await canvasToBlob(canvas, "image/jpeg", 0.88);
  }
}

/**
 * Style pastel / posterize inspiré Ghibli.
 * Si échec → resizeImage (photo originale).
 */
export async function stylizeToGhibli(file: File): Promise<Blob> {
  try {
    const img = await loadImageElement(file);
    const max = 512;
    const scale = Math.min(
      1,
      max / Math.max(img.naturalWidth, img.naturalHeight),
    );
    const w = Math.max(64, Math.round(img.naturalWidth * scale));
    const h = Math.max(64, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas indisponible");

    ctx.drawImage(img, 0, 0, w, h);
    let imageData: ImageData;
    try {
      imageData = ctx.getImageData(0, 0, w, h);
    } catch {
      // Canvas protégé → renvoyer image simple
      return await canvasToBlob(canvas, "image/png");
    }

    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i]!;
      let g = d[i + 1]!;
      let b = d[i + 2]!;
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      r = r + (r - l) * 0.4;
      g = g + (g - l) * 0.4;
      b = b + (b - l) * 0.28;
      r += 14;
      g += 8;
      b -= 6;
      const levels = 7;
      r = Math.round(r / (255 / levels)) * (255 / levels);
      g = Math.round(g / (255 / levels)) * (255 / levels);
      b = Math.round(b / (255 / levels)) * (255 / levels);
      d[i] = Math.min(255, Math.max(0, r));
      d[i + 1] = Math.min(255, Math.max(0, g));
      d[i + 2] = Math.min(255, Math.max(0, b));
    }
    ctx.putImageData(imageData, 0, 0);

    // Adoucissement léger
    const soft = document.createElement("canvas");
    soft.width = w;
    soft.height = h;
    const sctx = soft.getContext("2d");
    if (sctx) {
      sctx.filter = "contrast(1.1) saturate(1.3) brightness(1.06)";
      sctx.drawImage(canvas, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = 0.9;
      ctx.drawImage(soft, 0, 0);
      ctx.globalAlpha = 1;
    }

    return await canvasToBlob(canvas, "image/png");
  } catch (e) {
    console.warn("[stylizeToGhibli] fallback resize", e);
    return await resizeImage(file);
  }
}
