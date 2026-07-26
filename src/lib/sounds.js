// src/lib/sounds.js
// Short alert tones synthesized on the fly with the Web Audio API — no audio
// files, just a few oscillator notes each. Used to preview an item's chosen
// alert sound and to play it in-app when a reminder fires while Bloom is open.
// (A web app can't override the OS notification sound, so this is the in-app
// chime; the system push still uses the phone's default.)

let ctx = null
function audio() {
  if (typeof window === 'undefined') return null
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    return ctx
  } catch { return null }
}

// notes: [{ f: hz, t: startSec, d: durSec, g?: gain, type?: waveform }]
function playNotes(notes, defaultType = 'sine') {
  const a = audio()
  if (!a) return
  const now = a.currentTime
  for (const n of notes) {
    const osc = a.createOscillator()
    const gain = a.createGain()
    osc.type = n.type || defaultType
    osc.frequency.value = n.f
    const t0 = now + n.t
    const t1 = t0 + n.d
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.linearRampToValueAtTime(n.g ?? 0.2, t0 + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0006, t1)
    osc.connect(gain); gain.connect(a.destination)
    osc.start(t0); osc.stop(t1 + 0.03)
  }
}

// The pickable set (id + human label). 'none' is silent.
export const SOUNDS = [
  { id: 'chime',   label: 'Chime'   },
  { id: 'ding',    label: 'Ding'    },
  { id: 'marimba', label: 'Marimba' },
  { id: 'bell',    label: 'Bell'    },
  { id: 'pop',     label: 'Pop'     },
  { id: 'alert',   label: 'Alert'   },
  { id: 'none',    label: 'None'    },
]

export function playSound(id) {
  switch (id) {
    case 'chime':   return playNotes([{ f: 659, t: 0, d: 0.24 }, { f: 988, t: 0.12, d: 0.32 }], 'sine')
    case 'ding':    return playNotes([{ f: 1047, t: 0, d: 0.42 }], 'sine')
    case 'marimba': return playNotes([{ f: 523, t: 0, d: 0.16 }, { f: 659, t: 0.09, d: 0.16 }, { f: 784, t: 0.18, d: 0.26 }], 'triangle')
    case 'bell':    return playNotes([{ f: 880, t: 0, d: 0.55, g: 0.24 }, { f: 1760, t: 0, d: 0.35, g: 0.06 }], 'sine')
    case 'pop':     return playNotes([{ f: 380, t: 0, d: 0.07, g: 0.28, type: 'square' }, { f: 720, t: 0.05, d: 0.1 }], 'sine')
    case 'alert':   return playNotes([{ f: 784, t: 0, d: 0.11 }, { f: 784, t: 0.17, d: 0.11 }, { f: 784, t: 0.34, d: 0.14 }], 'square')
    default:        return   // 'none' or unknown → silent
  }
}
