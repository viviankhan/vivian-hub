// src/lib/scheduler.js
// ─────────────────────────────────────────────────────────────
// Smart task scheduler. Given a task + duration, finds the
// best available windows in the next 7 days. Never suggests
// slots that overlap with fixed blocks or scheduled tasks.
// ─────────────────────────────────────────────────────────────

import { getFixedBlocksForDate } from '../data/schedule.js'

const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']

function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + m
}

function minutesToTime(mins) {
  const h = Math.floor(mins / 60) % 24
  const m = mins % 60
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
}

function formatTime12(timeStr) {
  const [h, m] = timeStr.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2,'0')} ${ampm}`
}

const TRAVEL_BUFFER = 10 // minutes between events requiring travel

// Context labels for time slots
function slotContext(startMin, dayBlocks) {
  for (const block of dayBlocks) {
    const blockEnd = timeToMinutes(block.end)
    if (startMin >= blockEnd && startMin < blockEnd + 30) {
      return `After ${block.label}`
    }
    const blockStart = timeToMinutes(block.start)
    if (startMin < blockStart && startMin + 30 > blockStart - 15) {
      return `Before ${block.label}`
    }
  }
  // Time of day labels
  if (startMin >= 360 && startMin < 480)  return 'Early morning'
  if (startMin >= 480 && startMin < 720)  return 'Morning'
  if (startMin >= 720 && startMin < 900)  return 'Afternoon'
  if (startMin >= 900 && startMin < 1080) return 'Evening'
  return 'Night'
}

export function findSlots(durationMinutes, scheduledTasks = [], deadlineDate = null, maxDays = 7) {
  const suggestions = []
  const now = new Date()

  for (let dayOffset = 0; dayOffset < maxDays; dayOffset++) {
    const date = new Date(now)
    date.setDate(date.getDate() + dayOffset)
    date.setHours(0, 0, 0, 0)

    const dateStr = date.toISOString().split('T')[0]

    // Stop if past deadline
    if (deadlineDate && date > new Date(deadlineDate)) break

    const fixedBlocks = getFixedBlocksForDate(date)
    const dayScheduled = scheduledTasks.filter(t => t.date === dateStr)

    // Merge all blocks into occupied ranges
    const occupied = [
      ...fixedBlocks.map(b => ({
        start: timeToMinutes(b.start),
        end: timeToMinutes(b.end),
        label: b.label,
      })),
      ...dayScheduled.map(t => ({
        start: timeToMinutes(t.startTime),
        end: timeToMinutes(t.startTime) + t.durationMinutes,
        label: t.label,
      })),
    ].sort((a, b) => a.start - b.start)

    // Find gaps between blocks
    // Only look between 7:00 AM (420) and 10:00 PM (1320)
    const DAY_START = 420
    const DAY_END = 1320

    let cursor = dayOffset === 0 ? Math.max(DAY_START, now.getHours() * 60 + now.getMinutes() + 15) : DAY_START

    for (let i = 0; i <= occupied.length; i++) {
      const gapEnd = i < occupied.length ? occupied[i].start - TRAVEL_BUFFER : DAY_END
      const gapStart = cursor + (i > 0 ? TRAVEL_BUFFER : 0)

      if (gapEnd - gapStart >= durationMinutes) {
        const startMin = gapStart
        const endMin = startMin + durationMinutes

        suggestions.push({
          date: dateStr,
          dayLabel: date.toLocaleDateString('en-US', { weekday:'long', month:'short', day:'numeric' }),
          startTime: minutesToTime(startMin),
          endTime: minutesToTime(endMin),
          startDisplay: formatTime12(minutesToTime(startMin)),
          endDisplay: formatTime12(minutesToTime(endMin)),
          context: slotContext(startMin, fixedBlocks),
          score: dayOffset === 0 ? 10 : dayOffset, // prefer sooner
        })

        if (suggestions.length >= 5) break
      }

      if (i < occupied.length) {
        cursor = Math.max(cursor, occupied[i].end)
      }
    }

    if (suggestions.length >= 5) break
  }

  return suggestions.slice(0, 4)
}
