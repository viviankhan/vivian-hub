// src/lib/quickVoice.js
// ─────────────────────────────────────────────────────────────
// The quick voice: the phone's built-in speech (Web Speech API), used ONLY to
// listen to a paper right away while Alba's pre-rendered narration is still on
// its way. Alba's version replaces it the moment it arrives.
//
// Web Speech was the prototype's first approach and it failed in known ways,
// so each of them is worked around here:
//   • Utterances stop mid-read when the browser garbage-collects them and
//     `onend` never fires → one short utterance per sentence/paragraph, a live
//     reference to the one speaking, and a watchdog that moves on if `onend`
//     never comes.
//   • Long utterances get cut off (Chrome, ~15 s) → the same short units.
//   • It stops when the screen locks → a screen wake lock while speaking.
//   • Voice quality varies → pick the best English voice the device has, and
//     let the listener choose another.
// It still has no lock-screen controls; that is what Alba's version is for.
// ─────────────────────────────────────────────────────────────
import { speakable } from './paperText.js'

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null
export const quickVoiceAvailable = !!synth && typeof window.SpeechSynthesisUtterance === 'function'

const VOICE_KEY = 'bloom_quick_voice'
// macOS/iOS novelty voices that are never what you want for a paper.
const NOVELTY = /albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|ralph|grandma|grandpa|rocko|shelley|eddy|flo|reed|sandy/i

export function englishVoices() {
  if (!synth) return []
  return synth.getVoices().filter(v => /^en(-|_|$)/i.test(v.lang) && !NOVELTY.test(v.name))
}

function score(v) {
  let n = 0
  if (/^en[-_]GB/i.test(v.lang)) n += 3
  if (v.localService) n += 2
  if (/premium|enhanced|natural|neural/i.test(v.name)) n += 4
  if (/^(serena|daniel|kate|stephanie|martha|arthur)\b/i.test(v.name)) n += 1
  return n
}

export function savedVoiceName() { try { return localStorage.getItem(VOICE_KEY) || '' } catch { return '' } }
export function saveVoiceName(name) { try { localStorage.setItem(VOICE_KEY, name) } catch {} }

export function pickVoice(name = savedVoiceName()) {
  const list = englishVoices()
  return list.find(v => v.name === name) || [...list].sort((a, b) => score(b) - score(a))[0] || null
}

// Voices load asynchronously on some browsers; call back when they change.
export function onVoicesChanged(fn) {
  if (!synth) return () => {}
  synth.addEventListener?.('voiceschanged', fn)
  return () => synth.removeEventListener?.('voiceschanged', fn)
}

const wordsIn = s => (String(s).match(/\S+/g) || []).length

// A speaker for one list of units ({ key, s, text, heading }).
//   onUnit(index)  — a unit started speaking
//   onEnd()        — reached the end of the list
export function createSpeaker({ onUnit, onEnd }) {
  let units = []
  let idx = 0
  let token = 0          // bumps on every play/stop, so stale callbacks do nothing
  let current = null     // the live utterance: holding it stops Chrome collecting it
  let dog = null
  let wake = null
  let opts = { rate: 1, voiceName: '' }
  let playing = false

  const lockScreenAwake = async () => {
    try { if (navigator.wakeLock && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener?.('release', () => { wake = null }) } } catch { wake = null }
  }
  const letScreenSleep = () => { try { wake?.release() } catch {} wake = null }
  // A wake lock is dropped whenever the page is hidden; take it back on return.
  const onVisible = () => { if (playing && document.visibilityState === 'visible') lockScreenAwake() }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible)

  function speakAt(i, my) {
    if (my !== token) return
    clearTimeout(dog)
    if (i >= units.length) { playing = false; current = null; letScreenSleep(); onEnd?.(); return }
    idx = i
    onUnit?.(i)
    const unit = units[i]
    const u = new window.SpeechSynthesisUtterance(speakable(unit.text))
    const voice = pickVoice(opts.voiceName)
    if (voice) { u.voice = voice; u.lang = voice.lang } else u.lang = 'en-GB'
    u.rate = opts.rate
    const next = () => {
      if (my !== token) return
      clearTimeout(dog)
      setTimeout(() => speakAt(i + 1, my), unit.heading ? 450 : 120)
    }
    u.onend = next
    u.onerror = (e) => { if (e?.error !== 'interrupted' && e?.error !== 'canceled') next() }
    current = u
    synth.speak(u)
    // Watchdog: if onend never fires, move on once the engine has gone quiet.
    const expected = (wordsIn(unit.text) / (2.6 * opts.rate)) * 1000
    const check = () => {
      if (my !== token) return
      if (synth.speaking) { dog = setTimeout(check, 3000); return }
      next()
    }
    dog = setTimeout(check, expected * 2 + 6000)
  }

  return {
    setUnits(list) { units = list || [] },
    setOptions(o) { opts = { ...opts, ...o } },
    get index() { return idx },
    get playing() { return playing },
    // Must first be called from a tap: iOS only lets a gesture start speech.
    play(i = idx) {
      const my = ++token
      synth.cancel()
      playing = true
      lockScreenAwake()
      speakAt(Math.max(0, Math.min(i, units.length - 1)), my)
    },
    stop() {
      ++token
      clearTimeout(dog)
      playing = false
      current = null
      synth?.cancel()
      letScreenSleep()
    },
    dispose() {
      this.stop()
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible)
    },
  }
}
