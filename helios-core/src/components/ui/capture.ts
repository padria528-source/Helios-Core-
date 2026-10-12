import { addAfterEffect } from '@react-three/fiber'
import { SPECIMEN } from './content'

const SERIF = '"Cormorant Garamond", Georgia, serif'
const MONO = '"IBM Plex Mono", ui-monospace, monospace'

function spaced(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, tracking: number) {
  let cursor = x
  for (const ch of text) {
    ctx.fillText(ch, cursor, y)
    cursor += ctx.measureText(ch).width + tracking
  }
}

/** Museum label drawn into the lower-left corner of the captured frame. */
function drawLabel(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const u = Math.min(w, h) / 100
  const x = u * 5
  const base = h - u * 6

  const shade = ctx.createLinearGradient(0, h - u * 30, 0, h)
  shade.addColorStop(0, 'rgba(3,3,3,0)')
  shade.addColorStop(1, 'rgba(3,3,3,0.62)')
  ctx.fillStyle = shade
  ctx.fillRect(0, h - u * 30, w, u * 30)

  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#c9a45c'
  ctx.font = `500 ${u * 1.25}px ${MONO}`
  spaced(ctx, SPECIMEN.collection.toUpperCase(), x, base - u * 9.2, u * 0.55)

  ctx.fillStyle = '#efe6d3'
  ctx.font = `500 ${u * 6.4}px ${SERIF}`
  spaced(ctx, SPECIMEN.name.toUpperCase(), x, base - u * 2.6, u * 0.7)

  ctx.fillStyle = 'rgba(201,164,92,0.6)'
  ctx.fillRect(x, base - u * 0.9, u * 24, Math.max(1, u * 0.08))

  ctx.fillStyle = '#8f8676'
  ctx.font = `400 ${u * 1.15}px ${MONO}`
  spaced(ctx, `${SPECIMEN.number.toUpperCase()}  ·  ATELIER IX  ·  2024`, x, base + u * 1.4, u * 0.42)
}

/**
 * Captures the frame that was just rendered and composes the specimen label
 * over it. Reading the canvas inside R3F's after-effect hook means the drawing
 * buffer is still intact, so the renderer does not need preserveDrawingBuffer.
 */
export function capturePlate(): Promise<Blob | null> {
  return new Promise((resolve) => {
    const source = document.querySelector<HTMLCanvasElement>('.stage canvas')
    if (!source) {
      resolve(null)
      return
    }
    const stop = addAfterEffect(() => {
      stop()
      try {
        const out = document.createElement('canvas')
        out.width = source.width
        out.height = source.height
        const ctx = out.getContext('2d')
        if (!ctx) {
          resolve(null)
          return
        }
        ctx.drawImage(source, 0, 0)
        drawLabel(ctx, out.width, out.height)
        out.toBlob((blob) => resolve(blob), 'image/png')
      } catch {
        resolve(null)
      }
    })
  })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
