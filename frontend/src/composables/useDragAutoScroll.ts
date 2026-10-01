import { onBeforeUnmount } from 'vue'

// Scrolls the page while something is dragged near the top or bottom of the visible area.
// Browsers only auto-scroll in a thin band at the window edges, and here the top edge sits
// under the app bar and the sticky page header, so the band is measured from the edges given:
//   const autoScroll = useDragAutoScroll({ top: () => headerBottom(), bottom: () => barTop() })
//   dragstart -> autoScroll.start(), dragend / drop -> autoScroll.stop()

const ZONE = 80 // px from an edge where scrolling starts
const MAX_SPEED = 22 // px per frame at the very edge

export function useDragAutoScroll(edges: { top?: () => number; bottom?: () => number } = {}) {
  let pointerY: number | null = null
  let frame = 0

  const onDragOver = (e: DragEvent) => (pointerY = e.clientY)

  function speed(y: number): number {
    const top = edges.top?.() ?? 0
    const bottom = edges.bottom?.() ?? window.innerHeight
    if (y < top + ZONE) return -MAX_SPEED * Math.min(1, (top + ZONE - y) / ZONE)
    if (y > bottom - ZONE) return MAX_SPEED * Math.min(1, (y - (bottom - ZONE)) / ZONE)
    return 0
  }

  function tick() {
    if (pointerY !== null) {
      const v = speed(pointerY)
      if (v) window.scrollBy(0, v)
    }
    frame = requestAnimationFrame(tick)
  }

  function start() {
    stop()
    document.addEventListener('dragover', onDragOver)
    frame = requestAnimationFrame(tick)
  }

  function stop() {
    document.removeEventListener('dragover', onDragOver)
    cancelAnimationFrame(frame)
    frame = 0
    pointerY = null
  }

  onBeforeUnmount(stop)
  return { start, stop }
}
