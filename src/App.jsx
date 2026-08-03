import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  isUsingSupabase,
  getCompletions, setCompletion,
  getLogEntries, addLogEntry, deleteLogEntry,
  getNotes, setNotes, getFcProgress, setFcProgress, getFcStudied, setFcStudied,
  getScheduledTasks, setScheduledTasks,
  getCommitmentMeta, setCommitmentMeta,
  getCommitments, addCommitment as dbAddCommitment, updateCommitment as dbUpdateCommitment, deleteCommitment as dbDeleteCommitment,
  getVacations, addVacation as dbAddVacation, deleteVacation as dbDeleteVacation,
  getEvents, addEvent as dbAddEvent, deleteEvent as dbDeleteEvent,
  getRecurringTasks, addRecurringTask, updateRecurringTask, deleteRecurringTask, clearRecurringTasks,
  getRecurringExceptions, setRecurringExceptions,
  getRecurringMeta, setRecurringMeta,
  getRoutineGroups, setRoutineGroups,
  addCategory as dbAddCategory, updateCategory as dbUpdateCategory, deleteCategory as dbDeleteCategory,
} from './lib/storage.js'
import { occKey, recurringOccurrencesForDate } from './lib/occurrences.js'
import { runMigrationIfNeeded, seedCategoriesIfNeeded } from './lib/migrate.js'
import { DEFAULT_RECURRING_TASKS, DEFAULT_DAILY_TODOS } from './data/schedule.js'

import Today       from './components/Today.jsx'
import ThisWeek    from './components/ThisWeek.jsx'
import Commitments from './components/Commitments.jsx'
import Calendar    from './components/Calendar.jsx'
import Notes       from './components/Notes.jsx'
import Edits       from './components/Edits.jsx'
import RecurringTasksManager from './components/RecurringTasksManager.jsx'
import CategoriesManager from './components/CategoriesManager.jsx'
import EventsManager from './components/EventsManager.jsx'
import ThoughtsBoard from './components/ThoughtsBoard.jsx'
import NotificationsSettings from './components/NotificationsSettings.jsx'
import SearchOverlay, { SearchIcon } from './components/SearchOverlay.jsx'
import { registerServiceWorker, syncReminders, notifyArrival } from './lib/notifications.js'
import { buildLabelModel, historyFromData } from './lib/predictLabel.js'
import { geolocationSupported, watchArrivals } from './lib/geofence.js'
import { Glyph } from './lib/glyphs.jsx'
import Customization from './components/Customization.jsx'
import { getFontPref, setFontPref, applyFont, getThemePref, setThemePref, applyTheme,
  getCustomColor, setCustomColor,
  getLayoutPref, setLayoutPref, applyLayout, getSoundEnabled, setSoundEnabled,
  getSummaryPref, setSummaryPref,
  getSeasonPref, setSeasonPref, applyLook, resolveSeason,
  getBackgroundPref, setBackgroundPref, applyBackground,
  getCustomBackground, setCustomBackground, applySavedAppearance } from './lib/appearance.js'
import { hydratePrefs, pushPrefs } from './lib/prefs.js'
import { RECURRING_FILTER_EVENT } from './lib/viewFilter.js'
import SeasonalEffects from './components/SeasonalEffects.jsx'

// Build id baked in at build time (see vite.config.js). Shown in Settings so
// it's obvious on-device which version is actually running after a deploy.
const BUILD_ID = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev'

// Routine groups tasks can be filed under. Each carries a soft "film" tint that
// washes behind its tasks on the timeline (pink morning, blue night by default).
// Users can rename/add/delete these; these two are just the initial seed.
const DEFAULT_ROUTINES = [
  { id:'morning', name:'Morning routine', tint:'#FBE79E' },
  { id:'night',   name:'Night routine',   tint:'#BBD5F0' },
]
// Old seed tints we quietly upgrade on load (so an existing morning routine
// still on the original pink picks up the new pale yellow, without touching a
// tint the user has since customized).
const LEGACY_ROUTINE_TINTS = { morning: '#F9C9D9' }

const TABS = [
  { id:'today',       label:'Today',       glyph:'list' },
  { id:'week',        label:'Week',        glyph:'calendar' },
  { id:'commitments', label:'Commitments', glyph:'check' },
  { id:'calendar',    label:'Calendar',    glyph:'grid' },
  { id:'thoughts',    label:'Thoughts',    glyph:'bulb' },
  { id:'events',      label:'Events',      glyph:'ticket' },
  { id:'recurring',   label:'Recurring',   glyph:'repeat' },
]

// ── Settings Drawer ────────────────────────────────────────────
function SettingsDrawer({ open, onClose, settingsTab, setSettingsTab, notes, updateNotes, categories, addCategory, updateCategory, deleteCategory, events, commitments, font, setFont, theme, setTheme, season, setSeason, customColor, setCustom, background, setBackground, customBg, setCustomBg, layout, setLayout, soundOn, setSound, summary, setSummary }) {
  if (!open) return null
  const SECTIONS = [
    ['customize','Look','sun'],
    ['reminders','Reminders','bell'],
    ['categories','Categories','grid'],
    ['notes','Notes','book'],
    ['edits','Edits','sparkle'],
  ]
  const activeLabel = (SECTIONS.find(s => s[0] === settingsTab) || SECTIONS[0])[1]
  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:400 }} />
      <div style={{ position:'fixed', top:0, right:0, bottom:0, width:Math.min(520, window.innerWidth), background:'var(--cream)', zIndex:500, display:'flex', flexDirection:'column', boxShadow:'-8px 0 40px rgba(0,0,0,.2)' }}>
        {/* Header — title only; you leave via the bottom bar, not a top ✕. */}
        <div style={{ background:'var(--forest)', padding:'max(18px, calc(env(safe-area-inset-top) + 14px)) 22px 16px', flexShrink:0 }}>
          <div className="serif" style={{ color:'var(--green-light)', fontSize:23, fontWeight:600, lineHeight:1.1 }}>Settings</div>
          <div style={{ color:'var(--green-light)', opacity:.65, fontSize:12.5, marginTop:3 }}>{activeLabel}</div>
        </div>
        {/* Scrollable content */}
        <div style={{ flex:1, minHeight:0, overflowY:'auto', WebkitOverflowScrolling:'touch' }}>
          <div style={{ padding:'20px 24px' }}>
            {settingsTab==='customize'  && <Customization font={font} onFont={setFont} theme={theme} onTheme={setTheme} season={season} onSeason={setSeason} customColor={customColor} onCustomColor={setCustom} background={background} onBackground={setBackground} customBackground={customBg} onCustomBackground={setCustomBg} layout={layout} onLayout={setLayout} soundOn={soundOn} onSound={setSound} summary={summary} onSummary={setSummary} />}

            {settingsTab==='reminders'  && <NotificationsSettings events={events} commitments={commitments} />}
            {settingsTab==='categories' && <CategoriesManager categories={categories} addCategory={addCategory} updateCategory={updateCategory} deleteCategory={deleteCategory} />}
            {settingsTab==='notes'      && <Notes notes={notes} updateNotes={updateNotes} />}
            {settingsTab==='edits'      && <Edits />}
          </div>
          <div style={{ padding:'4px 24px 20px', textAlign:'center', fontSize:11, color:'var(--muted)' }}>
            Bloom · build {BUILD_ID}
          </div>
        </div>
        {/* Bottom selection bar — pick a section, or Done to leave. Mirrors the
            app's own bottom nav so Settings doesn't break the immersion. */}
        <nav style={{ flexShrink:0, display:'flex', alignItems:'stretch', gap:6, background:'white', borderTop:'1px solid var(--border)', boxShadow:'0 -6px 20px rgba(60,72,88,.06)', padding:'8px 8px calc(8px + env(safe-area-inset-bottom))' }}>
          <div style={{ flex:1, minWidth:0, display:'flex', gap:2, overflowX:'auto' }}>
            {SECTIONS.map(([id,label,icon]) => {
              const on = settingsTab === id
              return (
                <button key={id} onClick={()=>setSettingsTab(id)}
                  style={{ flex:'1 0 auto', minWidth:62, border:'none', cursor:'pointer', borderRadius:12, padding:'7px 8px 6px',
                    background: on ? 'var(--green-light)' : 'transparent', color: on ? 'var(--teal)' : 'var(--muted)',
                    display:'flex', flexDirection:'column', alignItems:'center', gap:3, fontFamily:'DM Sans,sans-serif' }}>
                  <Glyph id={icon} size={20} />
                  <span style={{ fontSize:10, fontWeight:600, whiteSpace:'nowrap' }}>{label}</span>
                </button>
              )
            })}
          </div>
          <button onClick={onClose} aria-label="Close settings"
            style={{ flexShrink:0, border:'none', cursor:'pointer', borderRadius:12, padding:'7px 14px 6px', background:'var(--forest)', color:'var(--green-light)',
              display:'flex', flexDirection:'column', alignItems:'center', gap:3, fontFamily:'DM Sans,sans-serif' }}>
            <Glyph id="check" size={20} />
            <span style={{ fontSize:10, fontWeight:700, whiteSpace:'nowrap' }}>Done</span>
          </button>
        </nav>
      </div>
    </>
  )
}

// A simple 3-line "menu" icon for the mobile header hamburger.
function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" aria-hidden="true">
      <line x1="4" y1="7"  x2="20" y2="7"  />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  )
}

// ── Line icons for the Structured-style bottom bar ─────────────
const svgProps = { viewBox:'0 0 24 24', width:23, height:23, fill:'none', stroke:'currentColor', strokeWidth:1.9, strokeLinecap:'round', strokeLinejoin:'round', 'aria-hidden':true }
// Inbox = a tray (where unscheduled tasks land).
function InboxIcon() {
  return (<svg {...svgProps}><path d="M4 13.5 6 5.5a2 2 0 0 1 1.9-1.5h8.2A2 2 0 0 1 18 5.5l2 8"/><path d="M4 13.5h4a2 2 0 0 1 2 2 2 2 0 0 0 4 0 2 2 0 0 1 2-2h4"/><path d="M4 13.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4.5"/></svg>)
}
// Timeline = stacked rows with leading dots.
function TimelineIcon() {
  return (<svg {...svgProps}><circle cx="5" cy="7" r="1.6"/><circle cx="5" cy="17" r="1.6"/><line x1="10" y1="7" x2="20" y2="7"/><line x1="10" y1="17" x2="20" y2="17"/></svg>)
}
// Settings = gear.
function GearIcon() {
  return (<svg {...svgProps}><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg>)
}

// ── Mobile side-nav drawer ─────────────────────────────────────
// Slides in from the left on phones. Full section list as rounded rows with
// icons; the active section is highlighted. Always rendered so it can animate;
// the `.open` class drives the slide + scrim fade, and it's display:none on
// desktop (where the horizontal tab bar is used instead).
function MobileNav({ open, onClose, tab, setTab, onOpenSettings }) {
  const go = (id) => { setTab(id); onClose() }
  return (
    <>
      <div className={`mobile-nav-scrim ${open ? 'open' : ''}`} onClick={onClose} aria-hidden="true" />
      <aside className={`mobile-nav ${open ? 'open' : ''}`} aria-hidden={!open}>
        <div className="mobile-nav-head">
          <div className="serif mobile-nav-brand">Bloom</div>
          <button className="mobile-nav-close" onClick={onClose} aria-label="Close menu">✕</button>
        </div>
        <nav className="mobile-nav-list">
          {TABS.map(t => (
            <button key={t.id} className={`mobile-nav-item ${tab===t.id ? 'active' : ''}`} onClick={() => go(t.id)}>
              <span className="mobile-nav-icon"><Glyph id={t.glyph} size={21} /></span>
              <span className="mobile-nav-label">{t.label}</span>
              {tab===t.id && <span className="mobile-nav-active-dot" aria-hidden="true" />}
            </button>
          ))}
        </nav>
        <button className="mobile-nav-settings" onClick={() => { onClose(); onOpenSettings() }}>
          <span className="mobile-nav-icon"><GearIcon /></span>
          <span className="mobile-nav-label">Settings</span>
        </button>
      </aside>
    </>
  )
}

export default function App() {
  // Remember the last tab you were on across reloads — purely a local UI
  // preference, not synced data, so plain localStorage is enough.
  const [tab, setTab] = useState(() => {
    try {
      const saved = localStorage.getItem('vivian_last_tab')
      return TABS.some(t => t.id === saved) ? saved : 'today'
    } catch { return 'today' }
  })
  useEffect(() => {
    try { localStorage.setItem('vivian_last_tab', tab) } catch {}
  }, [tab])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab,  setSettingsTab]  = useState('customize')
  // Appearance — device-local font + accent theme. main.jsx applies the saved
  // values before first paint; these setters keep the live app in step.
  const [font,   setFontState]   = useState(getFontPref)
  const [theme,  setThemeState]  = useState(getThemePref)
  const [season, setSeasonState] = useState(getSeasonPref)
  const [layout, setLayoutState] = useState(getLayoutPref)
  const [soundOn,setSoundState]  = useState(getSoundEnabled)
  const [summary,setSummaryState]= useState(getSummaryPref)
  // Each setter mirrors the choice to the synced prefs blob (pushPrefs), so the
  // look & settings follow the user to their other devices.
  const setFont    = useCallback(v  => { setFontState(v);    setFontPref(v);    applyFont(v);   pushPrefs() }, [])
  // Accent: 'season' follows the active season; a preset id or 'custom' overrides.
  // applyLook re-lays the season banner + the resolved accent in one go.
  const setTheme   = useCallback(v  => { setThemeState(v);   setThemePref(v);   applyLook(getSeasonPref(), v); pushPrefs() }, [])
  // Season drives the banner + ambient motion (and the accent when following it).
  const setSeason  = useCallback(v  => { setSeasonState(v);  setSeasonPref(v);  applyLook(v, getThemePref()); pushPrefs() }, [])
  const [customColor, setCustomColorState] = useState(getCustomColor)
  // Picking a custom color stores it, switches the accent to 'custom', and
  // re-derives every surface from that one color (banner stays season-driven).
  const setCustom  = useCallback(hex => { setCustomColorState(hex); setCustomColor(hex); setThemeState('custom'); setThemePref('custom'); applyLook(getSeasonPref(), 'custom'); pushPrefs() }, [])
  // Optional decorative background illustration (built-in scene or an upload).
  const [background, setBackgroundState] = useState(getBackgroundPref)
  const [customBg, setCustomBgState] = useState(getCustomBackground)
  const setBackground = useCallback(id => { setBackgroundState(id); setBackgroundPref(id); applyBackground(id); pushPrefs() }, [])
  const setCustomBg   = useCallback(uri => { setCustomBackground(uri); setCustomBgState(uri); setBackgroundState('custom'); setBackgroundPref('custom'); applyBackground('custom'); pushPrefs() }, [])
  const setLayout  = useCallback(v  => { setLayoutState(v);  setLayoutPref(v);  applyLayout(v); pushPrefs() }, [])
  const setSound   = useCallback(on => { setSoundState(on);  setSoundEnabled(on); pushPrefs() }, [])
  const setSummary = useCallback(v  => { setSummaryState(v); setSummaryPref(v); pushPrefs() }, [])

  // On load, pull the synced look & view prefs and apply them so this device
  // matches the others. localStorage already gave an instant look pre-paint;
  // this reconciles to the shared source of truth and re-syncs React state.
  useEffect(() => {
    let alive = true
    hydratePrefs().then(changed => {
      if (!alive || !changed) return
      setFontState(getFontPref()); setThemeState(getThemePref()); setSeasonState(getSeasonPref())
      setCustomColorState(getCustomColor()); setBackgroundState(getBackgroundPref()); setCustomBgState(getCustomBackground())
      setLayoutState(getLayoutPref()); setSoundState(getSoundEnabled()); setSummaryState(getSummaryPref())
      applySavedAppearance()   // re-apply theme/season/background/font/layout from the hydrated values
      // Nudge components that read their own device-local stores to refresh.
      try { window.dispatchEvent(new Event(RECURRING_FILTER_EVENT)) } catch {}
      try { window.dispatchEvent(new Event('bloom-saved-colors')) } catch {}
      try { window.dispatchEvent(new Event('bloom-duration-presets')) } catch {}
    })
    return () => { alive = false }
  }, [])

  // Saved colors, the repeating filter, and duration presets are changed inside
  // components (which broadcast these events) — mirror those to the cloud too.
  useEffect(() => {
    const h = () => pushPrefs()
    const evs = ['bloom-saved-colors', RECURRING_FILTER_EVENT, 'bloom-duration-presets']
    evs.forEach(e => window.addEventListener(e, h))
    return () => evs.forEach(e => window.removeEventListener(e, h))
  }, [])
  const [searchOpen,   setSearchOpen]   = useState(false)
  const [navOpen,      setNavOpen]      = useState(false)  // mobile side-nav drawer
  // Set when a search suggestion is picked → Calendar navigates to this date.
  // The nonce lets re-picking the same date re-trigger the jump.
  const [jumpTo,       setJumpTo]       = useState(null)

  // "completions" replaces the old separate todos/weekState blobs — every
  // consumer already reads todos[k] || weekState[k], which were confirmed to
  // always hold the identical value, so both props below point at this one
  // object rather than keeping two copies in sync.
  const [completions,     setCompletions_]     = useState({})
  const [log,              setLog_]             = useState([])
  const [notes,            setNotes_]           = useState('')
  const [fcProgress,       setFcProgress_]      = useState({})
  const [fcStudied,        setFcStudied_]       = useState({})
  const [scheduled,        setScheduled_]       = useState([])
  const [commitments,      setCommitments_]     = useState([])
  const [commitmentMeta,   setCommitmentMeta_]  = useState({})
  const [recurringTaskRows,setRecurringTaskRows]= useState([])
  const [recurringExceptions,setRecurringExceptions_] = useState({})
  const [recurringMeta,    setRecurringMeta_]   = useState({})
  const [vacations,        setVacations_]       = useState([])
  const [events,           setEvents_]          = useState([])
  const [categories,       setCategories_]      = useState([])
  const [routines,         setRoutines_]         = useState(DEFAULT_ROUTINES)
  const [loading,          setLoading]          = useState(true)

  useEffect(() => {
    async function load() {
      await runMigrationIfNeeded()
      const [comp, l, n, fcp, fcs, sch, com, rt, vac, evs, cats, cmeta, rexc, rmeta, rout] = await Promise.all([
        getCompletions(), getLogEntries(), getNotes(),
        getFcProgress(), getFcStudied(), getScheduledTasks(),
        getCommitments(), getRecurringTasks(), getVacations(), getEvents(),
        seedCategoriesIfNeeded(), getCommitmentMeta(), getRecurringExceptions(), getRecurringMeta(),
        getRoutineGroups(),
      ])
      setCompletions_(comp); setLog_(l); setNotes_(n)
      setFcProgress_(fcp); setFcStudied_(fcs); setScheduled_(sch)
      setCommitments_(com); setRecurringTaskRows(rt); setVacations_(vac); setEvents_(evs)
      setCategories_(cats); setCommitmentMeta_(cmeta); setRecurringExceptions_(rexc); setRecurringMeta_(rmeta)
      // Routine groups: use what's saved, or seed the Morning/Night defaults.
      if (rout) {
        // One-time tint upgrade: bump any routine still on an old seed tint to
        // its current default (leaves customized tints alone).
        let changed = false
        const upgraded = rout.map(r => {
          const legacy = LEGACY_ROUTINE_TINTS[r.id]
          if (legacy && (r.tint || '').toUpperCase() === legacy.toUpperCase()) {
            changed = true
            const def = DEFAULT_ROUTINES.find(d => d.id === r.id)
            return { ...r, tint: def ? def.tint : r.tint }
          }
          return r
        })
        setRoutines_(upgraded)
        if (changed) setRoutineGroups(upgraded).catch(() => {})
      } else setRoutineGroups(DEFAULT_ROUTINES).catch(() => {})
      setLoading(false)
    }
    load()
  }, [])

  // ── Reminders / PWA ──────────────────────────────────────────
  // Register the service worker once (enables installability + lets reminders
  // show even when the tab is backgrounded).
  useEffect(() => { console.log('[Bloom] build', BUILD_ID); registerServiceWorker() }, [])

  // ── Derived schedule ─────────────────────────────────────────
  // recurring_tasks is a real table (one row per task). Today, Week and
  // Calendar now compute their own per-day recurring instances from these raw
  // rows via lib/occurrences.js (one shared computation), so the app no longer
  // pre-splits them into week/day maps here. The Recurring tab still takes the
  // wrapped form for its editor.
  const recurringTasksWrapped = { tasks: recurringTaskRows }
  // Rows enriched with their recurrence rule (freq/interval/monthDay) from the
  // meta blob — this is what Today/Week/Calendar compute occurrences from.
  const recurringTasksEnriched = recurringTaskRows.map(t => ({ ...t, ...(recurringMeta[t.id] || {}) }))

  // Expand the next week of timed recurring occurrences into reminder items so
  // notifications fire for them too (commitments/events already do). Each id
  // carries its date so every day's instance fires once; the leadId is the
  // template so per-item reminder overrides still apply. Completed instances
  // and skipped occurrences are dropped.
  const recurringReminderItems = useMemo(() => {
    const enriched = recurringTaskRows.map(t => ({ ...t, ...(recurringMeta[t.id] || {}) }))
    const out = []
    const base = new Date()
    for (let d = 0; d < 8; d++) {
      const day = new Date(base.getFullYear(), base.getMonth(), base.getDate() + d)
      const key = `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`
      for (const o of recurringOccurrencesForDate(enriched, key, recurringExceptions)) {
        if (!o._time) continue                          // only timed tasks remind
        if (o.block) continue                           // time blocks aren't tasks
        if (completions[`${key}_${o.id}`]) continue     // already done that day
        out.push({ id: `rec:${o.id}@${key}`, leadId: o.id, date: key, time: o._time, text: o.title || o.text || 'Task' })
      }
    }
    return out
  }, [recurringTaskRows, recurringMeta, recurringExceptions, completions])

  // ── Reminders ────────────────────────────────────────────────
  // Recompute reminders whenever the data that drives them changes, and again
  // each time the app is brought back to the foreground (so it "catches up" on
  // anything that came due while it was closed). No-ops unless the user has
  // turned reminders on in Settings.
  useEffect(() => {
    if (loading) return
    // Time blocks (containers) aren't tasks — don't remind about them.
    const remindable = commitments.filter(c => !commitmentMeta[c.id]?.block)
    syncReminders(events, remindable, recurringReminderItems)
    const onVis = () => { if (!document.hidden) syncReminders(events, remindable, recurringReminderItems) }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [loading, events, commitments, commitmentMeta, recurringReminderItems])

  // ── Label prediction model ───────────────────────────────────
  // Learn which labels your tasks tend to carry, so the add sheet can predict a
  // label from a new title instead of forcing a blind default. Rebuilds when the
  // history (commitments / recurring templates) changes.
  const labelModel = useMemo(
    () => buildLabelModel(historyFromData({ commitments, recurring: recurringTaskRows })),
    [commitments, recurringTaskRows],
  )

  // ── Location arrival auto-start ──────────────────────────────
  // Watch the device position while Bloom is open; when it reaches a task's
  // tagged location, stamp `startedAt` so the task's progress begins — no matter
  // the time it was set for — and nudge you that it started.
  useEffect(() => {
    if (loading || !geolocationSupported()) return
    // Current set of not-done, located, not-yet-started commitments. Read fresh
    // on each position update via the getter so it tracks live state.
    const getLocatedTasks = () => commitments
      .filter(c => !c.done && commitmentMeta[c.id]?.location && !commitmentMeta[c.id]?.startedAt)
      .map(c => ({ id: c.id, name: c.text, location: commitmentMeta[c.id].location }))
    if (!getLocatedTasks().length) return

    const stop = watchArrivals(getLocatedTasks, (task) => {
      setCommitmentMeta_(prev => {
        if (prev[task.id]?.startedAt) return prev            // already started
        const merged = { ...(prev[task.id] || {}), startedAt: Date.now() }
        const next = { ...prev, [task.id]: merged }
        setCommitmentMeta(next).catch(reportSaveError)
        return next
      })
      notifyArrival(task.name)
    })
    return stop
  }, [loading, commitments, commitmentMeta])

  // ── Persist helpers ──────────────────────────────────────────
  // Cloud write failures are surfaced instead of swallowed — otherwise a delete
  // looks like it worked (local state updates) but silently reverts on next load.
  // (In-flight kv_store writes are tracked centrally in storage.js's dbSet,
  // which warns before the tab closes/reloads while a save is still pending.)
  const reportSaveError = err => { console.error(err); alert(`⚠️ ${err.message || err}\n\nThis change was NOT saved to the cloud and may revert. Check your connection and try again.`) }

  const updateNotes      = useCallback(async v => { setNotes_(v);      try { await setNotes(v) }      catch (e) { reportSaveError(e) } }, [])
  const updateFcProgress = useCallback(async v => { setFcProgress_(v); try { await setFcProgress(v) } catch (e) { reportSaveError(e) } }, [])
  const updateFcStudied  = useCallback(async v => { setFcStudied_(v);  try { await setFcStudied(v) }  catch (e) { reportSaveError(e) } }, [])

  const appendLog = useCallback(async entry => {
    const newEntry = { ...entry, ts: new Date().toISOString() }
    setLog_(prev => [...prev, newEntry])
    try { await addLogEntry(newEntry) } catch (e) { reportSaveError(e) }
  }, [])

  // ── Recurring tasks CRUD (real per-row table) ────────────────
  const addRecurringTaskFn = useCallback(async task => {
    try {
      const created = await addRecurringTask(task)
      setRecurringTaskRows(prev => [...prev, created])
      // Repeat rule extras (freq/interval/monthDay/durationMins) + routine group
      // aren't table columns — stash them in the synced recurring_meta blob
      // keyed by row id.
      const { freq, interval, monthDay, durationMins, routine, icon, color, block } = task
      if ((freq && freq !== 'weekly') || (interval && interval > 1) || monthDay || durationMins || routine || icon || color || block) {
        setRecurringMeta_(prev => {
          const next = { ...prev, [created.id]: {
            ...(freq ? { freq } : {}),
            ...(interval && interval > 1 ? { interval } : {}),
            ...(monthDay ? { monthDay } : {}),
            ...(durationMins ? { durationMins } : {}),
            ...(routine ? { routine } : {}),
            ...(icon ? { icon } : {}),
            ...(color ? { color } : {}),
            ...(block ? { block: true } : {}),
          } }
          setRecurringMeta(next).catch(reportSaveError)
          return next
        })
      }
    } catch (e) { reportSaveError(e) }
  }, [])
  const updateRecurringTaskFn = useCallback(async (id, task) => {
    try {
      const updated = await updateRecurringTask(id, task)
      setRecurringTaskRows(prev => prev.map(t => t.id===id ? updated : t))
    } catch (e) { reportSaveError(e) }
    // Keep the rule extras (freq/interval/monthDay/durationMins) + routine group
    // in sync with the edit — set them when present, clear them when it's back
    // to plain weekly with no duration and no routine.
    const { freq, interval, monthDay, durationMins, routine, icon, color, block } = task
    const extra = {
      ...(freq && freq !== 'weekly' ? { freq } : {}),
      ...(interval && interval > 1 ? { interval } : {}),
      ...(monthDay ? { monthDay } : {}),
      ...(durationMins ? { durationMins } : {}),
      ...(routine ? { routine } : {}),
      ...(icon ? { icon } : {}),
      ...(color ? { color } : {}),
      ...(block ? { block: true } : {}),
    }
    setRecurringMeta_(prev => {
      const has = id in prev
      if (!Object.keys(extra).length && !has) return prev
      const next = { ...prev }
      if (Object.keys(extra).length) next[id] = extra
      else delete next[id]
      setRecurringMeta(next).catch(reportSaveError)
      return next
    })
  }, [])
  const deleteRecurringTaskFn = useCallback(async id => {
    setRecurringTaskRows(prev => prev.filter(t => t.id !== id))
    setRecurringMeta_(prev => {
      if (!(id in prev)) return prev
      const n = { ...prev }; delete n[id]
      setRecurringMeta(n).catch(reportSaveError)
      return n
    })
    try { await deleteRecurringTask(id) } catch (e) { reportSaveError(e) }
  }, [])
  const clearRecurringTasksFn = useCallback(async () => {
    setRecurringTaskRows([])
    setRecurringMeta_({})
    setRecurringMeta({}).catch(reportSaveError)
    try { await clearRecurringTasks() } catch (e) { reportSaveError(e) }
  }, [])

  // ── Recurring occurrence skips (one shared, synced map) ──────
  // Hide a single instance of a recurring task on one date. Because the map is
  // cloud-synced and every view reads it, skipping on Today/Week/Calendar hides
  // that occurrence everywhere. Unskip restores it. Also drops any completion
  // that was recorded for the now-hidden instance so it can't linger.
  const skipRecurringOccurrence = useCallback((recurringId, date) => {
    const key = occKey(recurringId, date)
    setRecurringExceptions_(prev => {
      if (prev[key]) return prev
      const next = { ...prev, [key]: true }
      setRecurringExceptions(next).catch(reportSaveError)
      return next
    })
    // Clear a stale completion for the hidden instance (storage key is date_id).
    const compKey = `${date}_${recurringId}`
    setCompletions_(prev => {
      if (!prev[compKey]) return prev
      const n = { ...prev }; delete n[compKey]
      setCompletion(compKey, false).catch(reportSaveError)
      return n
    })
  }, [])
  const unskipRecurringOccurrence = useCallback((recurringId, date) => {
    const key = occKey(recurringId, date)
    setRecurringExceptions_(prev => {
      if (!prev[key]) return prev
      const n = { ...prev }; delete n[key]
      setRecurringExceptions(n).catch(reportSaveError)
      return n
    })
  }, [])

  // ── Categories CRUD (shared, real per-row table) ─────────────
  const addCategoryFn = useCallback(async cat => {
    try {
      const created = await dbAddCategory(cat)
      setCategories_(prev => [...prev, created])
    } catch (e) { reportSaveError(e) }
  }, [])
  const updateCategoryFn = useCallback(async (id, changes) => {
    try {
      const updated = await dbUpdateCategory(id, changes)
      setCategories_(prev => prev.map(c => c.id===id ? updated : c))
    } catch (e) { reportSaveError(e) }
  }, [])
  const deleteCategoryFn = useCallback(async id => {
    setCategories_(prev => prev.filter(c => c.id !== id))
    try { await dbDeleteCategory(id) } catch (e) { reportSaveError(e) }
  }, [])

  // ── Routine groups CRUD (one synced kv blob) ─────────────────
  // The whole list is one blob, so each op writes the next array. Deleting a
  // group also unfiles any recurring task that pointed at it (clears the
  // routine key in the meta blob) so no task references a ghost group.
  const persistRoutines = useCallback(next => { setRoutines_(next); setRoutineGroups(next).catch(reportSaveError); return next }, [])
  const addRoutineFn = useCallback((name, tint) => {
    const id = 'rt-' + Date.now().toString(36)
    setRoutines_(prev => persistRoutines([...prev, { id, name: (name || 'New routine').trim(), tint: tint || '#D9C7EE' }]))
  }, [persistRoutines])
  const updateRoutineFn = useCallback((id, changes) => {
    setRoutines_(prev => persistRoutines(prev.map(r => r.id === id ? { ...r, ...changes } : r)))
  }, [persistRoutines])
  const deleteRoutineFn = useCallback(id => {
    setRoutines_(prev => persistRoutines(prev.filter(r => r.id !== id)))
    setRecurringMeta_(prev => {
      let touched = false
      const next = {}
      for (const [k, v] of Object.entries(prev)) {
        if (v && v.routine === id) { const { routine, ...rest } = v; if (Object.keys(rest).length) next[k] = rest; touched = true }
        else next[k] = v
      }
      if (touched) setRecurringMeta(next).catch(reportSaveError)
      return touched ? next : prev
    })
  }, [persistRoutines])

  const addScheduledTask = useCallback(async task => {
    setScheduled_(prev => { const next = [...prev, task]; setScheduledTasks(next); return next })
  }, [])

  // ── Commitments CRUD — each is one atomic row operation now, never a
  // whole-array overwrite, so two edits in flight at once can't clobber
  // each other the way they used to. ──────────────────────────
  // description + subtasks live in the kv_store meta blob (no commitments-table
  // columns), so they're split off from the core row write here.
  // Extra category labels beyond the primary live in the meta blob too (the
  // commitments table has a single `cat` column). Only stored when there's more
  // than one — a single label is fully covered by the `cat` column.
  const addCommitment = useCallback(async c => {
    const { description, subtasks, cats, color, icon, location, startedAt, block, ...core } = c
    try {
      const created = await dbAddCommitment(core)
      setCommitments_(prev => [created, ...prev])
      const hasCats = Array.isArray(cats) && cats.length > 1
      const extra = { ...(hasCats ? { cats } : {}), ...(color ? { color } : {}), ...(icon ? { icon } : {}), ...(location ? { location } : {}), ...(startedAt ? { startedAt } : {}), ...(block ? { block: true } : {}) }
      if ((description && description.trim()) || (subtasks && subtasks.length) || hasCats || color || icon || location || startedAt || block) {
        setCommitmentMeta_(prev => {
          const next = { ...prev, [created.id]: { description: description || '', subtasks: subtasks || [], ...extra } }
          setCommitmentMeta(next).catch(reportSaveError)
          return next
        })
      }
    } catch (e) { reportSaveError(e) }
  }, [])
  const updateCommitment = useCallback(async (id, changes) => {
    const { description, subtasks, cats, color, icon, location, startedAt, block, ...core } = changes
    try {
      if (Object.keys(core).length) {
        const updated = await dbUpdateCommitment(id, core)
        setCommitments_(prev => prev.map(c => c.id===id ? updated : c))
      }
      if (description !== undefined || subtasks !== undefined || cats !== undefined || color !== undefined || icon !== undefined || location !== undefined || startedAt !== undefined || block !== undefined) {
        setCommitmentMeta_(prev => {
          const merged = { ...(prev[id] || {}) }
          if (description !== undefined) merged.description = description
          if (subtasks !== undefined) merged.subtasks = subtasks
          if (cats !== undefined) {
            if (Array.isArray(cats) && cats.length > 1) merged.cats = cats
            else delete merged.cats
          }
          if (color !== undefined) {
            if (color) merged.color = color
            else delete merged.color
          }
          if (icon !== undefined) {
            if (icon) merged.icon = icon
            else delete merged.icon
          }
          if (location !== undefined) {
            if (location) merged.location = location
            else delete merged.location
          }
          if (startedAt !== undefined) {
            if (startedAt) merged.startedAt = startedAt
            else delete merged.startedAt
          }
          if (block !== undefined) {
            if (block) merged.block = true
            else delete merged.block
          }
          const next = { ...prev, [id]: merged }
          setCommitmentMeta(next).catch(reportSaveError)
          return next
        })
      }
      // Auto-complete the parent when all its subtasks are checked (and
      // un-complete it if one gets unchecked). Only kicks in when the item
      // actually has subtasks — a plain task is never forced done.
      if (Array.isArray(subtasks) && subtasks.length > 0) {
        const allDone = subtasks.every(s => s.done)
        setCommitments_(prev => {
          const cur = prev.find(x => x.id === id)
          if (!cur || !!cur.done === allDone) return prev
          dbUpdateCommitment(id, { done: allDone }).catch(reportSaveError)
          setCompletions_(cp => { const n = { ...cp, [id]: allDone }; setCompletion(id, allDone).catch(reportSaveError); return n })
          return prev.map(x => x.id === id ? { ...x, done: allDone } : x)
        })
      }
    } catch (e) { reportSaveError(e) }
  }, [])
  const deleteCommitment = useCallback(async id => {
    setCommitments_(prev => prev.filter(c => c.id !== id))
    setCompletions_(prev => { const n = {...prev}; delete n[id]; return n })
    setCommitmentMeta_(prev => {
      if (!(id in prev)) return prev
      const n = { ...prev }; delete n[id]
      setCommitmentMeta(n).catch(reportSaveError)
      return n
    })
    try { await Promise.all([dbDeleteCommitment(id), setCompletion(id, false)]) }
    catch (e) { reportSaveError(e) }
  }, [])

  // ── Vacations CRUD ──────────────────────────────────────────
  const addVacation = useCallback(async v => {
    try {
      const created = await dbAddVacation(v)
      setVacations_(prev => [...prev, created])
    } catch (e) { reportSaveError(e) }
  }, [])
  const deleteVacation = useCallback(async id => {
    setVacations_(prev => prev.filter(v => v.id !== id))
    try { await dbDeleteVacation(id) } catch (e) { reportSaveError(e) }
  }, [])

  // ── Events CRUD (multi-day spans, non-blocking) ─────────────
  const addEvent = useCallback(async e => {
    try {
      const created = await dbAddEvent(e)
      setEvents_(prev => [...prev, created])
    } catch (err) { reportSaveError(err) }
  }, [])
  const deleteEvent = useCallback(async id => {
    setEvents_(prev => prev.filter(e => e.id !== id))
    try { await dbDeleteEvent(id) } catch (e) { reportSaveError(e) }
  }, [])

  // ── Unified toggle ───────────────────────────────────────────
  const syncToggle = useCallback(async (id, label, tag, date, explicitNext) => {
    const storageKey = date ? `${date}_${id}` : id
    const isCommitment = commitments.some(c => c.id===id)
    const currentDone = isCommitment
      ? commitments.find(c => c.id===id)?.done
      : !!completions[storageKey]
    // Callers that track an effective done-state (e.g. routine tasks that
    // auto-complete by time) pass the exact next value so the tap always flips
    // what's shown, not just the stored record.
    const nowDone = explicitNext === undefined ? !currentDone : !!explicitNext

    if (isCommitment) {
      setCommitments_(prev => prev.map(c => c.id===id ? {...c, done:nowDone} : c))
      dbUpdateCommitment(id, { done: nowDone }).catch(reportSaveError)
    }
    const nextCompletions = { ...completions, [storageKey]: nowDone }
    setCompletions_(nextCompletions)
    try {
      await setCompletion(storageKey, nowDone)
    } catch (e) { reportSaveError(e) }

    if (nowDone) {
      // Add log entry on check
      const d = new Date()
      const dateKey   = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
      const dateLabel = d.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' })
      const entry = { date:dateKey, dateLabel, label, tag, ts:d.toISOString(), storageKey }
      setLog_(prev => [...prev, entry])
      addLogEntry(entry).catch(reportSaveError)
    } else {
      // Remove log entry on uncheck — match by label + storageKey
      setLog_(prev => {
        const next = prev.filter(e => !(e.label === label && e.storageKey === storageKey))
        // Also try matching just by label (older entries may not have storageKey)
        const next2 = next.length < prev.length ? next : prev.filter((e, i) => {
          if (e.label !== label) return true
          // Remove only the most recent matching entry
          const laterIdx = prev.findIndex((e2, i2) => i2 > i && e2.label === label)
          return laterIdx !== -1
        })
        return next2
      })
      deleteLogEntry(label, storageKey).catch(reportSaveError)
    }
  }, [completions, commitments])

  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#FAFAF7', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontFamily:'Cormorant Garamond, serif', fontSize:28, color:'#1C2B1A', marginBottom:8 }}>Loading…</div>
        <div style={{ fontSize:12, color:'#9B8E7E' }}>{isUsingSupabase ? 'Connecting to cloud storage' : 'Using local storage'}</div>
      </div>
    </div>
  )

  // Commitments as the UI sees them: core rows merged with their description +
  // subtasks from the meta blob. Internal logic (syncToggle, reminders) keeps
  // using the raw `commitments` state; only children get this enriched view.
  const commitmentsView = commitments.map(c => ({
    ...c,
    description: commitmentMeta[c.id]?.description ?? '',
    subtasks: commitmentMeta[c.id]?.subtasks ?? [],
    cats: commitmentMeta[c.id]?.cats ?? (c.cat ? [c.cat] : []),
    color: commitmentMeta[c.id]?.color ?? null,
    icon: commitmentMeta[c.id]?.icon ?? null,
    location: commitmentMeta[c.id]?.location ?? null,
    startedAt: commitmentMeta[c.id]?.startedAt ?? null,
    block: commitmentMeta[c.id]?.block ?? false,
  }))

  const sharedProps = {
    // Every consumer reads todos[k] || weekState[k] — both point at the same
    // completions object rather than keeping two copies in sync.
    todos: completions, weekState: completions, syncToggle,
    log, appendLog, notes, updateNotes,
    fcProgress, updateFcProgress, fcStudied, updateFcStudied,
    scheduled, addScheduledTask,
    commitments: commitmentsView, addCommitment, updateCommitment, deleteCommitment,
    vacations, addVacation, deleteVacation,
    events, addEvent, deleteEvent,
    categories,
    // History-based label prediction for the add sheet (no blind defaults).
    labelModel,
    // Unified recurring schedule — the rule-enriched templates, the synced skip
    // map, and the operations Today/Week/Calendar share so all three stay in sync.
    recurringTasks: recurringTasksEnriched,
    recurringExceptions,
    addRecurringTask: addRecurringTaskFn,
    updateRecurringTask: updateRecurringTaskFn,
    deleteRecurringTask: deleteRecurringTaskFn,
    skipRecurringOccurrence,
    unskipRecurringOccurrence,
    // Routine groups + their CRUD, shared so Today/Calendar can tint by them
    // and the Recurring tab can manage them.
    routines,
    addRoutine: addRoutineFn,
    updateRoutine: updateRoutineFn,
    deleteRoutine: deleteRoutineFn,
    summary,
  }

  return (
    <div>
      <div className="shimmer-bg" aria-hidden="true" />
      <div className="bg-illustration" aria-hidden="true" />
      <SeasonalEffects effect={resolveSeason(season).effect} />
      <header className="header">
        <div className="header-top">
          <div className="header-left">
            <button className="hamburger-btn" onClick={() => setNavOpen(true)}
              title="Menu" aria-label="Open menu">
              <MenuIcon />
            </button>
            <h1 className="header-title">Bloom</h1>
          </div>
          <div className="header-actions">
            <span className={`storage-badge ${isUsingSupabase ? 'cloud' : 'local'}`}>
              {isUsingSupabase ? 'Cloud sync on' : 'Local storage'}
            </span>
            <button className="icon-btn" onClick={() => setSearchOpen(true)}
              title="Search" aria-label="Search">
              <SearchIcon />
            </button>
            <button className="icon-btn" onClick={() => setSettingsOpen(true)}
              title="Settings" aria-label="Settings">
              <GearIcon />
            </button>
          </div>
        </div>
        <nav className="nav">
          {TABS.map(t => (
            <button key={t.id} className={`nav-btn ${tab===t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="content">
        {tab==='today'       && <Today       {...sharedProps} appendLog={appendLog} scheduled={scheduled} deleteCommitment={deleteCommitment} />}
        {tab==='week'        && <ThisWeek    {...sharedProps} deleteCommitment={deleteCommitment} />}
        {tab==='commitments' && <Commitments {...sharedProps} />}
        {tab==='calendar'    && <Calendar    {...sharedProps} jumpTo={jumpTo} />}
        {tab==='thoughts'    && <ThoughtsBoard addCommitment={addCommitment} categories={categories} />}
        {tab==='events'      && <EventsManager events={events} addEvent={addEvent} deleteEvent={deleteEvent}
          vacations={vacations} addVacation={addVacation} deleteVacation={deleteVacation} />}
        {tab==='recurring'   && <RecurringTasksManager recurringTasks={{ tasks: recurringTasksEnriched }}
          addRecurringTask={addRecurringTaskFn} updateRecurringTask={updateRecurringTaskFn}
          deleteRecurringTask={deleteRecurringTaskFn} clearRecurringTasks={clearRecurringTasksFn}
          categories={categories}
          routines={routines} addRoutine={addRoutineFn} updateRoutine={updateRoutineFn} deleteRoutine={deleteRoutineFn}
          defaultWeekTasks={DEFAULT_RECURRING_TASKS} defaultDailyTodos={DEFAULT_DAILY_TODOS} />}
      </main>

      <SettingsDrawer
        open={settingsOpen} onClose={() => setSettingsOpen(false)}
        settingsTab={settingsTab} setSettingsTab={setSettingsTab}
        notes={notes} updateNotes={updateNotes}
        categories={categories} addCategory={addCategoryFn}
        updateCategory={updateCategoryFn} deleteCategory={deleteCategoryFn}
        events={events} commitments={commitments}
        font={font} setFont={setFont} theme={theme} setTheme={setTheme}
        season={season} setSeason={setSeason}
        customColor={customColor} setCustom={setCustom}
        background={background} setBackground={setBackground} customBg={customBg} setCustomBg={setCustomBg}
        layout={layout} setLayout={setLayout} soundOn={soundOn} setSound={setSound}
        summary={summary} setSummary={setSummary} />

      <SearchOverlay
        open={searchOpen} onClose={() => setSearchOpen(false)}
        commitments={commitments} events={events} log={log}
        onJump={date => { setTab('calendar'); setJumpTo({ date, nonce: Date.now() }) }} />

      {/* Mobile side-nav drawer (phones only; CSS hides it on desktop) */}
      <MobileNav open={navOpen} onClose={() => setNavOpen(false)}
        tab={tab} setTab={setTab} onOpenSettings={() => setSettingsOpen(true)} />

      {/* Mobile bottom tab bar (phones only) — Structured-style:
          Inbox (unscheduled commitments) · Timeline (today) · Settings.
          Everything else (Week, Calendar, Thoughts, Events, Recurring) lives
          in the hamburger side menu, top-left. */}
      <nav className="bottom-nav">
        <button className={`bottom-nav-btn ${tab==='commitments' && !settingsOpen ? 'active' : ''}`} onClick={() => { setSettingsOpen(false); setTab('commitments') }}>
          <span className="bottom-nav-icon"><InboxIcon /></span>
          <span className="bottom-nav-label">Inbox</span>
        </button>
        <button className={`bottom-nav-btn ${tab==='today' && !settingsOpen ? 'active' : ''}`} onClick={() => { setSettingsOpen(false); setTab('today') }}>
          <span className="bottom-nav-icon"><TimelineIcon /></span>
          <span className="bottom-nav-label">Timeline</span>
        </button>
        <button className={`bottom-nav-btn ${settingsOpen ? 'active' : ''}`} onClick={() => setSettingsOpen(true)}>
          <span className="bottom-nav-icon"><GearIcon /></span>
          <span className="bottom-nav-label">Settings</span>
        </button>
      </nav>
    </div>
  )
}
