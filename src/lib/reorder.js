// src/lib/reorder.js
// ─────────────────────────────────────────────────────────────
// Drag a thing up or down a list, the way the nav bar already does it.
//
// The nav bar's own drag lives inline in App.jsx; this is the same gesture,
// generalized so any list of chips or rows can be rearranged by hand:
//
//   • A GRIP handle drags as soon as the finger moves 7px — it has no other
//     job, so there's nothing to confuse it with.
//   • A HOLD item (a label chip, which is also a button you tap to pick) only
//     starts dragging after a short press. Move before that and it's a scroll
//     or a tap, and the drag never arms — so tapping a label still just picks
//     it.
//
// While a drag is live the list re-orders under the finger, so you're looking
// at the result before you let go; the commit only happens on release, and a
// cancelled drag (the phone taking the gesture back) leaves the list alone.
//
// Touch scrolling is only blocked once the drag has actually armed: the
// document-level touchmove listener below is non-passive purely so it can
// preventDefault for the duration of the drag, which is what stops the page
// from scrolling away underneath a chip you're carrying.
//
// Pure helpers + one hook. No JSX.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const HOLD_MS = 240   // press this long on a tap-able item before its drag arms
const MOVE_PX = 7     // ...or move a grip handle this far

// Move `id` to `index`, closing the gap it left behind.
export function moveToIndex(ids = [], id, index) {
  if (!ids.includes(id)) return ids
  const rest = ids.filter(x => x !== id)
  const to = Math.max(0, Math.min(rest.length, index))
  return [...rest.slice(0, to), id, ...rest.slice(to)]
}

// Move `id` into the slot `overId` currently occupies — what dragging one
// thing on top of another means.
export function moveOver(ids = [], id, overId) {
  if (id === overId) return ids
  const from = ids.indexOf(id), over = ids.indexOf(overId)
  if (from < 0 || over < 0) return ids
  const rest = ids.filter(x => x !== id)
  const i = rest.indexOf(overId)
  return moveToIndex(ids, id, from < over ? i + 1 : i)
}

export function sameOrder(a = [], b = []) {
  return a.length === b.length && a.every((x, i) => x === b[i])
}

// ── The hook ────────────────────────────────────────────────────
// `ids` is the list as it stands; `onReorder(nextIds)` is called once, on
// release, with the list as the user left it.
//
// `groupOf(id)` is for a list shown in sections — the task sheet shows the
// chain split by record folder. Two things in different sections never swap
// with each other (dropping one on the other would move it somewhere it isn't
// even displayed), but the order handed back is still the whole chain, so one
// order is kept no matter which section it was rearranged in.
export function useDragReorder({ ids = [], onReorder = () => {}, disabled = false, holdMs = HOLD_MS, groupOf = null }) {
  const [dragId, setDragId]   = useState(null)
  const [preview, setPreview] = useState(null)   // the live order under the finger
  const els        = useRef(new Map())           // id → element, for hit-testing
  const press      = useRef(null)                // the in-flight gesture
  const previewRef = useRef(null)
  const suppress   = useRef(false)               // swallow the click a drag ends with

  // Show the preview only while it still describes this same set of ids — a
  // label added or deleted mid-drag drops it rather than resurrecting a ghost.
  const order = useMemo(() => {
    if (!preview) return ids
    if (preview.length !== ids.length || preview.some(id => !ids.includes(id))) return ids
    return preview
  }, [ids, preview])
  const orderRef = useRef(order)
  orderRef.current = order

  // Once the commit has landed (or the list changed underneath), the preview
  // has nothing left to say.
  useEffect(() => {
    if (!preview) return
    const stale = preview.length !== ids.length || preview.some(id => !ids.includes(id))
    if (stale || sameOrder(preview, ids)) { previewRef.current = null; setPreview(null) }
  }, [ids, preview])

  // Hold the page still for as long as something is being carried.
  useEffect(() => {
    if (!dragId) return
    const block = e => { if (e.cancelable) e.preventDefault() }
    document.addEventListener('touchmove', block, { passive: false })
    const prevSelect = document.body.style.userSelect
    document.body.style.userSelect = 'none'
    return () => {
      document.removeEventListener('touchmove', block)
      document.body.style.userSelect = prevSelect
    }
  }, [dragId])

  const applyPreview = (next) => { previewRef.current = next; setPreview(next) }

  const idAt = (x, y) => {
    for (const [id, el] of els.current) {
      if (!el || !el.isConnected) continue
      const r = el.getBoundingClientRect()
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return id
    }
    return null
  }

  const arm = (p) => {
    p.active = true
    try { p.el.setPointerCapture(p.pointerId) } catch {}
    setDragId(p.id)
    applyPreview(orderRef.current)
  }

  const begin = (e, id, mode) => {
    if (disabled) return
    if (e.button != null && e.button !== 0) return
    const p = { id, mode, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, el: e.currentTarget, active: false, moved: false, timer: null }
    if (mode === 'hold') {
      p.timer = setTimeout(() => {
        const cur = press.current
        if (cur && cur.pointerId === p.pointerId && !cur.active) arm(cur)
      }, holdMs)
    }
    press.current = p
  }

  const move = (e) => {
    const p = press.current
    if (!p || p.pointerId !== e.pointerId) return
    if (!p.active) {
      const moved = Math.abs(e.clientX - p.startX) > MOVE_PX || Math.abs(e.clientY - p.startY) > MOVE_PX
      if (!moved) return
      // Moving before a hold has armed means the finger was scrolling, or the
      // tap wandered — either way, not a drag.
      if (p.mode === 'hold') { clearTimeout(p.timer); press.current = null; return }
      arm(p)
    }
    if (e.cancelable) e.preventDefault()
    p.moved = true
    const over = idAt(e.clientX, e.clientY)
    if (!over || over === p.id) return
    if (groupOf && groupOf(over) !== groupOf(p.id)) return
    const base = previewRef.current || orderRef.current
    const next = moveOver(base, p.id, over)
    if (!sameOrder(next, base)) applyPreview(next)
  }

  const finish = (p) => {
    try { p.el.releasePointerCapture(p.pointerId) } catch {}
    setDragId(null)
  }

  const end = (e) => {
    const p = press.current
    if (!p || p.pointerId !== e.pointerId) return
    if (p.timer) clearTimeout(p.timer)
    press.current = null
    if (!p.active) return
    finish(p)
    if (p.moved) {
      // The click that follows this pointerup would otherwise select the label
      // you were only rearranging.
      suppress.current = true
      setTimeout(() => { suppress.current = false }, 350)
    }
    const next = previewRef.current
    if (next && !sameOrder(next, ids)) onReorder(next)
    else applyPreview(null)
  }

  const cancel = (e) => {
    const p = press.current
    if (!p || (e && p.pointerId !== e.pointerId)) return
    if (p.timer) clearTimeout(p.timer)
    press.current = null
    if (p.active) { finish(p); applyPreview(null) }
  }

  const swallowClick = (e) => {
    if (!suppress.current) return
    suppress.current = false
    e.preventDefault(); e.stopPropagation()
  }

  // Arrow keys on a focused grip do the same thing without a mouse.
  const keyMove = (e, id) => {
    if (disabled) return
    const dir = e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1
      : e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : 0
    if (!dir) return
    const cur = orderRef.current
    const i = cur.indexOf(id)
    if (i < 0 || i + dir < 0 || i + dir >= cur.length) return
    e.preventDefault()
    onReorder(moveToIndex(cur, id, i + dir))
  }

  // Measure-only: the element a drag is tested against (a whole row, when the
  // gesture itself starts on that row's grip).
  const measureProps = useCallback((id) => ({
    ref: (el) => { if (el) els.current.set(id, el); else els.current.delete(id) },
  }), [])

  const pointerProps = (id, mode) => ({
    onPointerDown:   (e) => begin(e, id, mode),
    onPointerMove:   move,
    onPointerUp:     end,
    onPointerCancel: cancel,
  })

  // A chip: both the thing you drag and the thing you drop onto. No arrow-key
  // handling here — a chip is a button you press, and arrow keys on a focused
  // button are for scrolling the sheet, not for quietly moving a label.
  const itemProps = (id) => ({
    ...measureProps(id),
    ...pointerProps(id, 'hold'),
    onClickCapture: swallowClick,
    style: { touchAction: 'manipulation' },
  })

  // A grip: drags its row, which is measured separately. It exists only to
  // reorder, so the arrow keys do the same thing for anyone not using a mouse.
  const handleProps = (id) => ({
    ...pointerProps(id, 'grip'),
    onKeyDown: (e) => keyMove(e, id),
    onClickCapture: swallowClick,
    style: { touchAction: 'none', cursor: dragId === id ? 'grabbing' : 'grab' },
  })

  return { order, dragId, dragging: !!dragId, itemProps, measureProps, handleProps, disabled }
}
