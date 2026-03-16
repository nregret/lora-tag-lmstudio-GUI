export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export async function blobToDataUrlScaled(
  blob: Blob,
  opts?: {
    maxSide?: number
    mime?: string
    quality?: number
  }
): Promise<string> {
  const maxSide = opts?.maxSide ?? 768
  const mime = opts?.mime ?? 'image/jpeg'
  const quality = opts?.quality ?? 0.85

  if (typeof createImageBitmap !== 'function') {
    return blobToDataUrl(blob)
  }

  const bmp = await createImageBitmap(blob)
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
  const w = Math.max(1, Math.round(bmp.width * scale))
  const h = Math.max(1, Math.round(bmp.height * scale))

  const anyGlobal = globalThis as any
  const CanvasCtor = anyGlobal.OffscreenCanvas as undefined | (new (w: number, h: number) => any)
  const canvas = CanvasCtor ? new CanvasCtor(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h })
  const ctx = canvas.getContext('2d')
  if (!ctx) return blobToDataUrl(blob)

  ctx.drawImage(bmp, 0, 0, w, h)

  if (typeof canvas.convertToBlob === 'function') {
    const outBlob = await canvas.convertToBlob({ type: mime, quality })
    return blobToDataUrl(outBlob)
  }

  if (typeof canvas.toDataURL === 'function') {
    return canvas.toDataURL(mime, quality)
  }

  return blobToDataUrl(blob)
}

