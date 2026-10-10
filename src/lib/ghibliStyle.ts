/**
 * Transforme une image en style "inspiré Ghibli / anime doux"
 * (filtre artistique côté client, sans API payante).
 */
export async function stylizeToGhibli(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const max = 512;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(64, Math.round(bitmap.width * scale));
  const h = Math.max(64, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas indisponible");

  ctx.drawImage(bitmap, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;

  // 1) Soft posterize + pastel boost (look anime / aquarelle)
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i]!,
      g = d[i + 1]!,
      b = d[i + 2]!;
    // luminance
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    // increase saturation mildly
    r = r + (r - l) * 0.35;
    g = g + (g - l) * 0.35;
    b = b + (b - l) * 0.25;
    // warm tint
    r += 12;
    g += 6;
    b -= 4;
    // posterize
    const levels = 6;
    r = Math.round(r / (255 / levels)) * (255 / levels);
    g = Math.round(g / (255 / levels)) * (255 / levels);
    b = Math.round(b / (255 / levels)) * (255 / levels);
    d[i] = Math.min(255, Math.max(0, r));
    d[i + 1] = Math.min(255, Math.max(0, g));
    d[i + 2] = Math.min(255, Math.max(0, b));
  }
  ctx.putImageData(img, 0, 0);

  // 2) Soft blur pass via draw scaled
  const soft = document.createElement("canvas");
  soft.width = w;
  soft.height = h;
  const sctx = soft.getContext("2d");
  if (sctx) {
    sctx.filter = "contrast(1.08) saturate(1.25) brightness(1.05)";
    sctx.drawImage(canvas, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = 0.85;
    ctx.drawImage(soft, 0, 0);
    ctx.globalAlpha = 1;
  }

  return await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Export image impossible"))),
      "image/png",
      0.92,
    );
  });
}
