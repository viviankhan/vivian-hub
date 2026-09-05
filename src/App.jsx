import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  isUsingSupabase,
  getCompletions, setCompletion,
  getLogEntries, addLogEntry, deleteLogEntry,
  getNotes, setNotes, getFcProgress, setFcProgress, getFcStudied, setFcStudied,
  getScheduledTasks, setScheduledTasks,
  getCommitmentMeta, setCommitmentMeta,
  addThought,
  getCommitments, addCommitment as dbAddCommitment, updateCommitment as dbUpdateCommitment, deleteCommitment as dbDeleteCommitment,
  getVacations, addVacation as dbAddVacation, deleteVacation as dbDeleteVacation,
  getEvents, addEvent as dbAddEvent, deleteEvent as dbDeleteEvent,
  getExternalCalendars, setExternalCalendars,
  getImportedAdoptions, setImportedAdoptions,
  getTimeLogs, setTimeLogs,
  getChangeHistory, setChangeHistory,
  getTaskTemplates, setTaskTemplates,
  getLabelMeta, setLabelMeta,
  getTrackerFolders, setTrackerFolders, getTrackerPeople, setTrackerPeople,
  getTrackerEntries, setTrackerEntries,
  getRecurringTasks, addRecurringTask, updateRecurringTask, deleteRecurringTask, clearRecurringTasks,
  getRecurringExceptions, setRecurringExceptions,
  getRecurringMeta, setRecurringMeta,
  getRoutineGroups, setRoutineGroups,
  getWellnessCheckins, setWellnessCheckins,
  getWellnessEffects, setWellnessEffects,
  getWellnessEpisodes, setWellnessEpisodes,
  getWellnessGame, setWellnessGame,
  getWellnessEmotions, setWellnessEmotions,
  getWellnessTreasures, setWellnessTreasures,
  getWellnessSpace, setWellnessSpace,
  getArtOverrides, setArtOverrides,
  addCategory as dbAddCategory, updateCategory as dbUpdateCategory, deleteCategory as dbDeleteCategory,
} from './lib/storage.js'
import { occKey, recurringOccurrencesForDate } from './lib/occurrences.js'
import { registerEmotionPrefs } from './lib/wellness.js'
import { runMigrationIfNeeded, seedCategoriesIfNeeded } from './lib/migrate.js'
import {
  registerLabelMeta, registerRecordFolders, normalizeLabelMeta,
  syncTaskEntries, removeTaskEntries, mergeFolders as mergeRecordFolders, remapLabelFolders,
} from './lib/labels.js'
import { ACCENT_COLORS } from './lib/trackers.js'
import TaskMenuSettings from './components/TaskMenuSettings.jsx'
import { DEFAULT_RECURRING_TASKS, DEFAULT_DAILY_TODOS } from './data/schedule.js'

import Today       from './components/Today.jsx'
import ThisWeek    from './components/ThisWeek.jsx'
import Calendar    from './components/Calendar.jsx'
import Notes       from './components/Notes.jsx'
import Edits       from './components/Edits.jsx'
import History     from './components/History.jsx'
import RecurringTasksManager from './components/RecurringTasksManager.jsx'
import CategoriesManager from './components/CategoriesManager.jsx'
import EventsManager from './components/EventsManager.jsx'
import ExternalCalendars from './components/ExternalCalendars.jsx'
import Insights from './components/Insights.jsx'
import Informatics from './components/Informatics.jsx'
import BloomWellness from './components/BloomWellness.jsx'
import Voyage from './components/Voyage.jsx'
import ArtStudio from './components/ArtStudio.jsx'
import { loadOverrides, isAdmin } from './lib/art.js'
import TaskMenu from './components/TaskMenu.jsx'
import { authEnabled, getCurrentUser, signOut } from './lib/auth.js'
import { refreshCalendar, loadCachedCalendar, clearCachedCalendar, eventsToSpans } from './lib/calendars.js'
import { importedKey } from './lib/importedTasks.js'
import ThoughtsBoard from './components/ThoughtsBoard.jsx'
import NotificationsSettings from './components/NotificationsSettings.jsx'
import SearchOverlay, { SearchIcon } from './components/SearchOverlay.jsx'
import { registerServiceWorker, syncReminders, notifyArrival, getDefaultLeads } from './lib/notifications.js'
import { ensureBackgroundPush, syncScheduledPushesDebounced } from './lib/push.js'
import { buildLabelModel, historyFromData } from './lib/predictLabel.js'
import { geolocationSupported, watchArrivals } from './lib/geofence.js'
import { Glyph } from './lib/glyphs.jsx'
import Customization from './components/Customization.jsx'
import { getFontPref, setFontPref, applyFont, getThemePref, setThemePref, applyTheme,
  getCustomColor, setCustomColor,
  getLayoutPref, setLayoutPref, applyLayout, getSoundEnabled, setSoundEnabled,
  getSummaryPref, setSummaryPref, getEffectsEnabled, setEffectsEnabled,
  getSeasonPref, setSeasonPref, applyLook, resolveSeason,
  getBackgroundPref, setBackgroundPref, applyBackground,
  getCustomBackground, setCustomBackground,
  getMobileBackgroundPref, setMobileBackgroundPref,
  getMobileCustomBackground, setMobileCustomBackground, applySavedAppearance } from './lib/appearance.js'
import { hydratePrefs, pushPrefs, reconcileBackgroundImages, pushBackgroundImage } from './lib/prefs.js'
import { RECURRING_FILTER_EVENT } from './lib/viewFilter.js'
import SeasonalEffects from './components/SeasonalEffects.jsx'

// Build id baked in at build time (see vite.config.js). Shown in Settings so
// it's obvious on-device which version is actually running after a deploy.
const BUILD_ID = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev'

// Today's date as a YYYY-MM-DD string (local time), matching how dates are
// stored on commitments/recurring rows everywhere else in the app.
function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
// A YYYY-MM-DD date that's already gone (strictly before today). Scheduling
// something onto such a day means it already happened, so it lands checked off.
function isPastDate(dateStr) { return !!dateStr && dateStr < todayStr() }

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
  { id:'taskmenu',    label:'Task Menu',    glyph:'clipboard' },
  { id:'calendar',    label:'Calendar',    glyph:'grid' },
  { id:'wellness',    label:'Wellness',    glyph:'flower' },
  { id:'voyage',      label:'Rocket',      glyph:'rocket' },
  { id:'thoughts',    label:'Thoughts',    glyph:'bulb' },
  { id:'events',      label:'Events',      glyph:'ticket' },
  { id:'recurring',   label:'Recurring',   glyph:'repeat' },
  { id:'informatics', label:'Insights',    glyph:'chart' },
  { id:'records',     label:'Records',     glyph:'book' },
]

// On the desktop top bar these tabs are tucked under a single "More" dropdown
// rather than shown as their own tabs, keeping the bar short. They still render
// the same views when selected, and remain full rows in the mobile drawer.
const MORE_TAB_IDS = ['recurring', 'taskmenu', 'events']

// ── Customizable bottom bar (mobile) ───────────────────────────
// The phone bottom bar is a user-arranged list of destinations, dragged in
// from the side menu and dragged off to remove. It holds any tab plus the
// special 'settings' entry (opens the Settings drawer). Stored device-local,
// like the last-open tab. Default: Calendar · Timeline · Thoughts.
const BOTTOM_BAR_KEY = 'bloom_bottom_bar'
const DEFAULT_BOTTOM_BAR = ['calendar', 'today', 'thoughts']
const BAR_VALID = new Set([...TABS.map(t => t.id), 'settings'])
// The bottom bar keeps its own shorter vocabulary for a couple of tabs, so it
// reads the way it always has even though the side menu uses the full names.
const BAR_LABELS = { today: 'Timeline' }
function barItemMeta(id) {
  if (id === 'settings') return { id, label: 'Settings', glyph: null, settings: true }
  const t = TABS.find(x => x.id === id)
  const label = BAR_LABELS[id] || (t ? t.label : id)
  return { id, label, glyph: t ? t.glyph : 'list' }
}
function loadBottomBar() {
  try {
    const v = JSON.parse(localStorage.getItem(BOTTOM_BAR_KEY) || 'null')
    if (Array.isArray(v)) {
      const seen = new Set()
      const clean = v.filter(id => BAR_VALID.has(id) && !seen.has(id) && seen.add(id))
      if (clean.length) return clean
    }
  } catch {}
  return [...DEFAULT_BOTTOM_BAR]
}
function saveBottomBar(items) {
  try { localStorage.setItem(BOTTOM_BAR_KEY, JSON.stringify(items)) } catch {}
}

// ── Account panel (Settings → Account) ─────────────────────────
// Shows who's signed in and a sign-out button. Only rendered when Supabase-
// backed accounts are enabled (see src/lib/auth.js).
function AccountPanel() {
  const user = getCurrentUser()
  const [busy, setBusy] = useState(false)
  const out = async () => {
    if (busy) return
    setBusy(true)
    try { await signOut() } catch (e) { alert(e?.message || 'Could not sign out.'); setBusy(false) }
    // On success the auth listener swaps the app for the login screen.
  }
  return (
    <div>
      <div style={{ fontSize:13, color:'var(--text)', marginBottom:6 }}>Signed in as</div>
      <div style={{ fontSize:15, fontWeight:700, color:'var(--forest)', marginBottom:16, overflowWrap:'anywhere' }}>{user?.email || 'your account'}</div>
      <button onClick={out} disabled={busy}
        style={{ padding:'12px 20px', borderRadius:12, border:'1px solid var(--border)', background:'white', color:'var(--coral)',
          cursor: busy ? 'default' : 'pointer', fontFamily:'DM Sans,sans-serif', fontWeight:700, fontSize:14 }}>
        {busy ? 'Signing out…' : 'Sign out'}
      </button>
      <div style={{ fontSize:11.5, color:'var(--muted)', marginTop:14, lineHeight:1.5 }}>
        Your planner, hours and expense records are private to this account.
      </div>
    </div>
  )
}

// ── Settings Drawer ────────────────────────────────────────────
function SettingsDrawer({ open, onClose, settingsTab, setSettingsTab, notes, updateNotes, categories, addCategory, updateCategory, deleteCategory, labelMeta, updateLabelMeta, trackerFolders, events, commitments, recurring, locatedCount, changeHistory, undoChange, clearChangeHistory, externalCalendars, calendarStatuses, addCalendar, toggleCalendar, removeCalendar, refreshOneCalendar, updateCalendar, font, setFont, theme, setTheme, season, setSeason, customColor, setCustom, background, setBackground, customBg, setCustomBg, mobileBackground, setMobileBackground, mobileCustomBg, setMobileCustomBg, layout, setLayout, soundOn, setSound, summary, setSummary, effectsOn, setEffects, admin, persistArt }) {
  if (!open) return null
  const SECTIONS = [
    ['customize','Look','sun'],
    ['reminders','Reminders','bell'],
    ['calendars','Calendars','calendar'],
    ['categories','Labels','grid'],
    ['taskmenu','Task menu','clipboard'],
    ['notes','Notes','book'],
    ['history','History','clock'],
    ['edits','Edits','sparkle'],
    ...(authEnabled ? [['account','Account','idcard']] : []),
    // Owner-only: upload custom art to replace the code-drawn creatures/props.
    ...(admin ? [['artstudio','Art','rocket']] : []),
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
            {settingsTab==='customize'  && <Customization font={font} onFont={setFont} theme={theme} onTheme={setTheme} season={season} onSeason={setSeason} customColor={customColor} onCustomColor={setCustom} background={background} onBackground={setBackground} customBackground={customBg} onCustomBackground={setCustomBg} mobileBackground={mobileBackground} onMobileBackground={setMobileBackground} mobileCustomBackground={mobileCustomBg} onMobileCustomBackground={setMobileCustomBg} layout={layout} onLayout={setLayout} soundOn={soundOn} onSound={setSound} summary={summary} onSummary={setSummary} effectsOn={effectsOn} onEffects={setEffects} />}

            {settingsTab==='reminders'  && <NotificationsSettings events={events} commitments={commitments} recurring={recurring} locatedCount={locatedCount} />}
            {settingsTab==='calendars'  && <ExternalCalendars calendars={externalCalendars} statuses={calendarStatuses} onAdd={addCalendar} onToggle={toggleCalendar} onRemove={removeCalendar} onRefresh={refreshOneCalendar} onUpdate={updateCalendar} />}
            {settingsTab==='categories' && <CategoriesManager categories={categories} addCategory={addCategory} updateCategory={updateCategory} deleteCategory={deleteCategory}
              labelMeta={labelMeta} updateLabelMeta={updateLabelMeta} trackerFolders={trackerFolders} />}
            {settingsTab==='taskmenu'   && <TaskMenuSettings />}
            {settingsTab==='notes'      && <Notes notes={notes} updateNotes={updateNotes} />}
            {settingsTab==='history'    && <History history={changeHistory} onUndo={undoChange} onClear={clearChangeHistory} />}
            {settingsTab==='edits'      && <Edits />}
            {settingsTab==='account'    && <AccountPanel />}
            {settingsTab==='artstudio' && admin && <ArtStudio persistArt={persistArt} />}
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
// Settings = gear.
function GearIcon() {
  return (<svg {...svgProps}><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg>)
}
// The icon for a bottom-bar entry — the gear for Settings, otherwise the tab's
// own glyph (same set the side menu uses).
function BottomBarGlyph({ id, size = 22 }) {
  if (id === 'settings') return <GearIcon />
  return <Glyph id={barItemMeta(id).glyph} size={size} />
}
// A drag handle (six dots) shown on each side-menu row — press it and drag the
// item down onto the bottom bar.
function GripIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/>
      <circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/>
      <circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/>
    </svg>
  )
}

// ── Mobile side-nav drawer ─────────────────────────────────────
// Slides in from the left on phones. Full section list as rounded rows with
// icons; the active section is highlighted. Always rendered so it can animate;
// the `.open` class drives the slide + scrim fade, and it's display:none on
// desktop (where the horizontal tab bar is used instead).
function MobileNav({ open, onClose, tab, setTab, onOpenSettings, bind, barItems }) {
  const go = (id) => { setTab(id); onClose() }
  const onBar = (id) => barItems.includes(id)
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
            <div key={t.id} className={`mobile-nav-item ${tab===t.id ? 'active' : ''}`}>
              <button className="mobile-nav-item-main" onClick={() => go(t.id)}>
                <span className="mobile-nav-icon"><Glyph id={t.glyph} size={21} /></span>
                <span className="mobile-nav-label">{t.label}</span>
                {onBar(t.id) && <span className="mobile-nav-onbar" title="On your bottom bar">●</span>}
                {tab===t.id && <span className="mobile-nav-active-dot" aria-hidden="true" />}
              </button>
              <span className="mobile-nav-grip" title="Drag onto the bottom bar" aria-label={`Drag ${t.label} onto the bottom bar`} {...bind(t.id, 'menu', 'grip')}>
                <GripIcon />
              </span>
            </div>
          ))}
        </nav>
        <div className="mobile-nav-tip">
          Press &amp; drag the <span style={{ verticalAlign:'middle' }}><GripIcon /></span> handle onto your bottom bar to add it. Drag an item off the bar to remove it.
        </div>
        <div className="mobile-nav-item mobile-nav-settings-row">
          <button className="mobile-nav-item-main" onClick={() => { onClose(); onOpenSettings() }}>
            <span className="mobile-nav-icon"><GearIcon /></span>
            <span className="mobile-nav-label">Settings</span>
            {onBar('settings') && <span className="mobile-nav-onbar" title="On your bottom bar">●</span>}
          </button>
          <span className="mobile-nav-grip" title="Drag onto the bottom bar" aria-label="Drag Settings onto the bottom bar" {...bind('settings', 'menu', 'grip')}>
            <GripIcon />
          </span>
        </div>
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
  // Owner-only art-upload gate (see lib/art.js). `?admin=1` in the URL turns it
  // on for this device; read once at mount so the Art Studio section only shows
  // for the owner. Read-only for everyone else — the rendering path is identical.
  const [admin] = useState(isAdmin)
  // Appearance — device-local font + accent theme. main.jsx applies the saved
  // values before first paint; these setters keep the live app in step.
  const [font,   setFontState]   = useState(getFontPref)
  const [theme,  setThemeState]  = useState(getThemePref)
  const [season, setSeasonState] = useState(getSeasonPref)
  const [layout, setLayoutState] = useState(getLayoutPref)
  const [soundOn,setSoundState]  = useState(getSoundEnabled)
  const [summary,setSummaryState]= useState(getSummaryPref)
  // Ambient seasonal motion (falling leaves / petals / snow / bubbles) on/off.
  const [effectsOn,setEffectsState] = useState(getEffectsEnabled)
  // Arrival-started recurring occurrences (device-local): occKey → timestamp.
  // A recurring task with a location auto-starts on arrival like a one-off, but
  // per-day, so it needs its own started map keyed by occurrence.
  const [occStarted, setOccStarted] = useState(() => {
    try { return JSON.parse(localStorage.getItem('bloom_occ_started') || '{}') } catch { return {} }
  })
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
  // Chosen independently for desktop and mobile (portrait phones); CSS picks
  // which layer shows by viewport. applyBackground() re-reads both saved prefs.
  const [background, setBackgroundState] = useState(getBackgroundPref)
  const [customBg, setCustomBgState] = useState(getCustomBackground)
  const [mobileBackground, setMobileBackgroundState] = useState(getMobileBackgroundPref)
  const [mobileCustomBg, setMobileCustomBgState] = useState(getMobileCustomBackground)
  const setBackground = useCallback(id => { setBackgroundState(id); setBackgroundPref(id); applyBackground(); pushPrefs() }, [])
  // The uploaded image itself rides its own synced kv_store row (pushBackground-
  // Image), separate from the pref blob (pushPrefs) which only carries the
  // choice id — so a big photo syncs across devices without bloating that blob.
  const setCustomBg   = useCallback(uri => { setCustomBackground(uri); setCustomBgState(uri); setBackgroundState('custom'); setBackgroundPref('custom'); applyBackground(); pushPrefs(); pushBackgroundImage('bloom_bg_custom') }, [])
  const setMobileBackground = useCallback(id => { setMobileBackgroundState(id); setMobileBackgroundPref(id); applyBackground(); pushPrefs() }, [])
  const setMobileCustomBg   = useCallback(uri => { setMobileCustomBackground(uri); setMobileCustomBgState(uri); setMobileBackgroundState('custom'); setMobileBackgroundPref('custom'); applyBackground(); pushPrefs(); pushBackgroundImage('bloom_bg_custom_mobile') }, [])
  const setLayout  = useCallback(v  => { setLayoutState(v);  setLayoutPref(v);  applyLayout(v); pushPrefs() }, [])
  const setSound   = useCallback(on => { setSoundState(on);  setSoundEnabled(on); pushPrefs() }, [])
  const setSummary = useCallback(v  => { setSummaryState(v); setSummaryPref(v); pushPrefs() }, [])
  // Ambient motion toggle — flips the drifting particles without touching the
  // season's banner/accent. SeasonalEffects renders nothing when this is off.
  const setEffects = useCallback(on => { setEffectsState(on); setEffectsEnabled(on); pushPrefs() }, [])

  // ── Customizable mobile bottom bar ───────────────────────────
  // `barItems` is the ordered list of destinations shown in the phone bottom
  // bar. Items are dragged in from the side menu and dragged off to remove;
  // stored device-local like the last-open tab.
  const [barItems, setBarItems] = useState(loadBottomBar)
  const persistBar = useCallback((next) => { setBarItems(next); saveBottomBar(next) }, [])
  // Live drag state for render (the ghost + drop preview); a ref mirrors it so
  // the commit on pointer-up reads the latest without a stale closure.
  const [drag, setDrag] = useState(null)
  const dragLive = useRef(null)     // mirror of `drag` for commit
  const dragPending = useRef(null)  // the in-flight press (may not be a drag yet)
  // How tall a slice of the bottom of the screen counts as "over the bar" when
  // deciding a drop — generous so dropping is forgiving.
  const BAR_DROP_H = 96
  const computeZone = useCallback((x, y, baseLen) => {
    const overBar = y >= (window.innerHeight - BAR_DROP_H)
    if (!overBar) return { overBar: false, index: null }
    const slots = baseLen + 1
    const slotW = window.innerWidth / slots
    const index = Math.max(0, Math.min(baseLen, Math.floor(x / slotW)))
    return { overBar: true, index }
  }, [])
  const startDragNow = (id, source, x, y) => {
    const d = { id, source, x, y, overBar: false, index: null, removing: false }
    dragLive.current = d
    setDrag(d)
    try { document.body.style.userSelect = 'none' } catch {}
    try { navigator.vibrate && navigator.vibrate(8) } catch {}
  }
  const commitDrag = (cancel = false) => {
    const d = dragLive.current
    dragLive.current = null
    setDrag(null)
    try { document.body.style.userSelect = '' } catch {}
    if (!d || cancel) return
    const base = barItems.filter(x => x !== d.id)
    if (d.overBar) {
      const idx = Math.max(0, Math.min(base.length, d.index ?? base.length))
      persistBar([...base.slice(0, idx), d.id, ...base.slice(idx)])
    } else if (d.source === 'bar' && base.length >= 1) {
      persistBar(base)   // dragged off the bar → remove (keep at least one)
    }
    // A menu item dropped off the bar just cancels — nothing changes.
  }
  const beginPress = (e, id, source, mode) => {
    if (e.button != null && e.button !== 0) return
    const pid = e.pointerId, sx = e.clientX, sy = e.clientY, el = e.currentTarget
    const p = { id, source, mode, startX: sx, startY: sy, active: false, timer: null, el, pointerId: pid }
    // 'hold' items (the bar's own buttons) also tap-to-navigate, so a drag only
    // begins after a short press. 'grip' handles drag as soon as the finger moves.
    if (mode === 'hold') {
      p.timer = setTimeout(() => {
        const cur = dragPending.current
        if (!cur || cur.pointerId !== pid) return
        cur.active = true
        try { el.setPointerCapture(pid) } catch {}
        startDragNow(id, source, sx, sy)
      }, 240)
    }
    dragPending.current = p
  }
  const movePress = (e) => {
    const p = dragPending.current
    if (!p || p.pointerId !== e.pointerId) return
    if (!p.active) {
      const moved = Math.abs(e.clientX - p.startX) > 7 || Math.abs(e.clientY - p.startY) > 7
      if (p.mode === 'grip') {
        if (!moved) return
        p.active = true
        try { p.el.setPointerCapture(p.pointerId) } catch {}
        startDragNow(p.id, p.source, e.clientX, e.clientY)
      } else {
        if (moved) { clearTimeout(p.timer); dragPending.current = null }  // a scroll/tap, not a drag
        return
      }
    }
    e.preventDefault()
    const base = barItems.filter(x => x !== p.id)
    const zone = computeZone(e.clientX, e.clientY, base.length)
    const removing = p.source === 'bar' && !zone.overBar
    const d = { id: p.id, source: p.source, x: e.clientX, y: e.clientY, overBar: zone.overBar, index: zone.index, removing }
    dragLive.current = d
    setDrag(d)
  }
  const endPress = (e) => {
    const p = dragPending.current
    if (!p || p.pointerId !== e.pointerId) return
    if (p.timer) clearTimeout(p.timer)
    const wasActive = p.active
    dragPending.current = null
    if (!wasActive) {
      if (p.mode === 'hold') onTapItem(p.id, p.source)  // a plain tap on a bar button
      return
    }
    try { p.el.releasePointerCapture(p.pointerId) } catch {}
    commitDrag()
  }
  const cancelPress = (e) => {
    const p = dragPending.current
    if (!p || (e && p.pointerId !== e.pointerId)) return
    if (p.timer) clearTimeout(p.timer)
    if (p.active) commitDrag(true)
    dragPending.current = null
  }
  const onTapItem = (id, source) => {
    if (id === 'settings') { if (source === 'menu') setNavOpen(false); setSettingsOpen(true); return }
    setSettingsOpen(false); setTab(id)
    if (source === 'menu') setNavOpen(false)
  }
  const bindDrag = useCallback((id, source, mode) => ({
    onPointerDown: (e) => beginPress(e, id, source, mode),
    onPointerMove: (e) => movePress(e),
    onPointerUp:   (e) => endPress(e),
    onPointerCancel: (e) => cancelPress(e),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [barItems])

  // On load, pull the synced look & view prefs and apply them so this device
  // matches the others. localStorage already gave an instant look pre-paint;
  // this reconciles to the shared source of truth and re-syncs React state.
  useEffect(() => {
    let alive = true
    let lastPull = 0
    const pull = (isFirst) => {
      lastPull = Date.now()
      hydratePrefs().then(changed => {
        if (!alive) return
        if (changed) {
          setFontState(getFontPref()); setThemeState(getThemePref()); setSeasonState(getSeasonPref())
          setCustomColorState(getCustomColor()); setBackgroundState(getBackgroundPref()); setCustomBgState(getCustomBackground())
          setMobileBackgroundState(getMobileBackgroundPref()); setMobileCustomBgState(getMobileCustomBackground())
          setLayoutState(getLayoutPref()); setSoundState(getSoundEnabled()); setSummaryState(getSummaryPref())
          setEffectsState(getEffectsEnabled())
          applySavedAppearance()   // re-apply theme/season/background/font/layout from the hydrated values
          // Nudge components that read their own device-local stores to refresh.
          try { window.dispatchEvent(new Event(RECURRING_FILTER_EVENT)) } catch {}
          try { window.dispatchEvent(new Event('bloom-saved-colors')) } catch {}
          try { window.dispatchEvent(new Event('bloom-duration-presets')) } catch {}
          try { window.dispatchEvent(new Event('bloom-default-alerts')) } catch {}
        }
        // On the very first load, upload any pref that only exists on this
        // device so it can reach the others. This is what carries a default
        // alert set (or background) chosen *before* syncing was wired up — the
        // hydrate above never overwrites a key the cloud doesn't have yet, so
        // without this push a pre-existing default would stay stuck locally.
        if (isFirst) { try { getDefaultLeads() } catch {} ; pushPrefs() }
      })
      // The uploaded background images sync via their own rows (not the pref
      // blob), so reconcile them separately — this is what auto-populates a
      // loved background onto a fresh desktop instead of demanding a re-upload.
      reconcileBackgroundImages().then(bgChanged => {
        if (!alive || !bgChanged) return
        setCustomBgState(getCustomBackground())
        setMobileCustomBgState(getMobileCustomBackground())
        applyBackground()
      })
    }
    pull(true)
    // Re-pull when the app returns to the foreground. Prefs used to hydrate only
    // once at launch, so on an installed PWA (which rarely fully restarts) a
    // change made on another device — background, default alerts — never showed
    // up. Reopening the app now reconciles to the shared source of truth.
    const onVis = () => { if (!document.hidden && Date.now() - lastPull > 4000) pull() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onVis)
    return () => { alive = false; document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', onVis) }
  }, [])

  // Saved colors, the repeating filter, duration presets, and the default
  // reminder alerts are changed inside components (which broadcast these
  // events) — mirror those to the cloud too. Without 'bloom-default-alerts'
  // here, editing your default alerts saved locally but never synced, so the
  // change never reached other devices or their new-task defaults.
  useEffect(() => {
    const h = () => pushPrefs()
    const evs = ['bloom-saved-colors', RECURRING_FILTER_EVENT, 'bloom-duration-presets', 'bloom-default-alerts']
    evs.forEach(e => window.addEventListener(e, h))
    return () => evs.forEach(e => window.removeEventListener(e, h))
  }, [])
  const [searchOpen,   setSearchOpen]   = useState(false)
  const [navOpen,      setNavOpen]      = useState(false)  // mobile side-nav drawer
  // Desktop "More" dropdown (Recurring / Task Menu / Events). Anchored with a
  // fixed position from the button's rect so it isn't clipped by the nav's
  // horizontal overflow scroll.
  const [moreOpen,     setMoreOpen]     = useState(false)
  const [moreCoords,   setMoreCoords]   = useState(null)
  const moreBtnRef = useRef(null)
  const openMore = () => {
    const r = moreBtnRef.current?.getBoundingClientRect()
    if (r) setMoreCoords({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) })
    setMoreOpen(o => !o)
  }
  // The dropdown is anchored to a captured rect, so close it if the layout
  // shifts under it (resize / scroll) rather than leaving it floating.
  useEffect(() => {
    if (!moreOpen) return
    const close = () => setMoreOpen(false)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => { window.removeEventListener('resize', close); window.removeEventListener('scroll', close, true) }
  }, [moreOpen])
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
  const [changeHistory,    setChangeHistory_]   = useState([])
  // Subscribed (external, read-only) calendars — config + their fetched spans +
  // per-calendar sync status. See src/lib/calendars.js.
  const [extCalendars,     setExtCalendars_]    = useState([])
  const [extSpans,         setExtSpans_]        = useState({})   // id → span[]
  const [calStatuses,      setCalStatuses_]     = useState({})   // id → { state, error, count, fetchedAt }
  const [importedAdoptions, setImportedAdoptions_] = useState({}) // importedKey → commitment id
  const [categories,       setCategories_]      = useState([])
  const [timeLogs,         setTimeLogs_]        = useState([])   // manual hours logged on the Informatics page
  const [taskTemplates,    setTaskTemplates_]   = useState([])   // reusable date-less task presets (the Task Menu)
  const [routines,         setRoutines_]         = useState(DEFAULT_ROUTINES)
  // ── Labels & records ──────────────────────────────────────────
  // `labelMeta` is what turns a plain label into a record label: the folders it
  // files into and the fields it adds to the add-task sheet (see lib/labels.js).
  // The tracker folders/people/entries used to load inside the Records tab;
  // they live here now because a task saved anywhere in the app has to be able
  // to write itself into the folders its labels point at.
  const [labelMeta,        setLabelMeta_]        = useState({})
  const [trackerFolders,   setTrackerFolders_]   = useState([])
  const [trackerPeople,    setTrackerPeople_]    = useState([])
  const [trackerEntries,   setTrackerEntries_]   = useState([])
  // ── Wellness (mood check-ins, DnD-style status effects, companion game) ──
  const [wlCheckins,       setWlCheckins_]       = useState([])
  const [wlEffects,        setWlEffects_]        = useState(null)   // null → seed defaults in the tab
  const [wlEpisodes,       setWlEpisodes_]       = useState([])
  const [wlGame,           setWlGame_]           = useState(null)
  const [wlEmotions,       setWlEmotions_]       = useState({ custom: [], hidden: [] })
  const [wlTreasures,      setWlTreasures_]      = useState([])
  const [wlSpace,          setWlSpace_]          = useState(null)
  const [loading,          setLoading]          = useState(true)

  useEffect(() => {
    async function load() {
      await runMigrationIfNeeded()
      const [comp, l, n, fcp, fcs, sch, com, rt, vac, evs, cats, cmeta, rexc, rmeta, rout, tlogs, tpls, chist, wlc, wlfx, wlep, wlg, wlem, wltr, wlsp, artov, lmeta, tfolders, tpeople, tentries] = await Promise.all([
        getCompletions(), getLogEntries(), getNotes(),
        getFcProgress(), getFcStudied(), getScheduledTasks(),
        getCommitments(), getRecurringTasks(), getVacations(), getEvents(),
        seedCategoriesIfNeeded(), getCommitmentMeta(), getRecurringExceptions(), getRecurringMeta(),
        getRoutineGroups(), getTimeLogs(), getTaskTemplates(), getChangeHistory(),
        getWellnessCheckins(), getWellnessEffects(), getWellnessEpisodes(), getWellnessGame(),
        getWellnessEmotions(), getWellnessTreasures(), getWellnessSpace(), getArtOverrides(),
        getLabelMeta(), getTrackerFolders(), getTrackerPeople(), getTrackerEntries(),
      ])
      // Mirror the label/record wiring into the module registers before the
      // first render, so an add sheet opened straight away already knows which
      // labels record into which folder (same trick as the emotion palette).
      const cleanMeta = normalizeLabelMeta(lmeta)
      registerLabelMeta(cleanMeta); registerRecordFolders(tfolders)
      setLabelMeta_(cleanMeta)
      setTrackerFolders_(Array.isArray(tfolders) ? tfolders : [])
      setTrackerPeople_(Array.isArray(tpeople) ? tpeople : [])
      setTrackerEntries_(Array.isArray(tentries) ? tentries : [])
      setCompletions_(comp); setLog_(l); setNotes_(n)
      setFcProgress_(fcp); setFcStudied_(fcs); setScheduled_(sch)
      setCommitments_(com); setRecurringTaskRows(rt); setVacations_(vac); setEvents_(evs)
      setCategories_(cats); setCommitmentMeta_(cmeta); setRecurringExceptions_(rexc); setRecurringMeta_(rmeta)
      setTimeLogs_(Array.isArray(tlogs) ? tlogs : [])
      setTaskTemplates_(Array.isArray(tpls) ? tpls : [])
      setChangeHistory_(Array.isArray(chist) ? chist : [])
      setWlCheckins_(Array.isArray(wlc) ? wlc : [])
      setWlEffects_(Array.isArray(wlfx) ? wlfx : null)
      setWlEpisodes_(Array.isArray(wlep) ? wlep : [])
      setWlGame_(wlg && typeof wlg === 'object' ? wlg : null)
      // Emotion palette: mirror the synced prefs into the module registers up
      // front so custom/hidden emotions resolve on the very first render.
      const emPrefs = { custom: (wlem && Array.isArray(wlem.custom)) ? wlem.custom : [], hidden: (wlem && Array.isArray(wlem.hidden)) ? wlem.hidden : [] }
      registerEmotionPrefs(emPrefs)
      setWlEmotions_(emPrefs)
      setWlTreasures_(Array.isArray(wltr) ? wltr : [])
      setWlSpace_(wlsp && typeof wlsp === 'object' ? wlsp : null)
      // Seed the custom-art override store from the synced blob so any uploaded
      // images replace their code-drawn defaults on first paint.
      loadOverrides(artov)
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

  // ── Subscribed (external) calendars ──────────────────────────
  // Sync one subscription: fetch + parse its .ics, map the events to read-only
  // spans, and record the outcome. On failure we keep whatever was last cached
  // so the calendar doesn't blink empty on a flaky connection.
  const syncCalendar = useCallback(async (sub) => {
    setCalStatuses_(prev => ({ ...prev, [sub.id]: { ...(prev[sub.id] || {}), state: 'syncing' } }))
    try {
      const { events: parsed, fetchedAt } = await refreshCalendar(sub)
      const spans = eventsToSpans(sub, parsed)
      setExtSpans_(prev => ({ ...prev, [sub.id]: spans }))
      setCalStatuses_(prev => ({ ...prev, [sub.id]: { state: 'ok', count: parsed.length, fetchedAt } }))
    } catch (e) {
      setCalStatuses_(prev => ({ ...prev, [sub.id]: { ...(prev[sub.id] || {}), state: 'error', error: e?.message || 'Sync failed' } }))
    }
  }, [])

  // On load: read the synced subscription list, show any cached events instantly,
  // then refresh the enabled ones in the background.
  useEffect(() => {
    let alive = true
    getExternalCalendars().then(list => {
      if (!alive) return
      const subs = Array.isArray(list) ? list : []
      setExtCalendars_(subs)
      const cachedSpans = {}, cachedStatus = {}
      for (const sub of subs) {
        const cached = loadCachedCalendar(sub.id)
        if (cached) {
          cachedSpans[sub.id] = eventsToSpans(sub, cached.events)
          cachedStatus[sub.id] = { state: 'ok', count: cached.events.length, fetchedAt: cached.fetchedAt }
        }
      }
      setExtSpans_(cachedSpans)
      setCalStatuses_(cachedStatus)
      // Refresh the enabled feeds against the network (best-effort).
      subs.filter(s => s.enabled !== false).forEach(s => syncCalendar(s))
    })
    getImportedAdoptions().then(map => { if (alive && map && typeof map === 'object') setImportedAdoptions_(map) })
    return () => { alive = false }
  }, [syncCalendar])

  // Each subscription-list change is mirrored to the synced kv blob so a
  // calendar you add on one device shows up on the others. A cloud-save failure
  // here is non-fatal — local state already updated — so it's just logged.
  const addCalendar = useCallback((cal) => {
    const sub = { id: 'cal-' + Date.now().toString(36), name: cal.name, url: cal.url, color: cal.color, enabled: true, createdAt: new Date().toISOString() }
    setExtCalendars_(prev => { const next = [...prev, sub]; setExternalCalendars(next).catch(e => console.warn("[Bloom] calendar config save failed:", e)); return next })
    syncCalendar(sub)
  }, [syncCalendar])
  const toggleCalendar = useCallback((id) => {
    setExtCalendars_(prev => {
      const next = prev.map(c => c.id === id ? { ...c, enabled: !(c.enabled !== false) } : c)
      setExternalCalendars(next).catch(e => console.warn("[Bloom] calendar config save failed:", e))
      // Turning one back on with no cached events yet → fetch it.
      const sub = next.find(c => c.id === id)
      if (sub && sub.enabled && !extSpans[id]) syncCalendar(sub)
      return next
    })
  }, [extSpans, syncCalendar])
  const removeCalendar = useCallback((id) => {
    clearCachedCalendar(id)
    setExtSpans_(prev => { const n = { ...prev }; delete n[id]; return n })
    setCalStatuses_(prev => { const n = { ...prev }; delete n[id]; return n })
    setExtCalendars_(prev => { const next = prev.filter(c => c.id !== id); setExternalCalendars(next).catch(e => console.warn("[Bloom] calendar config save failed:", e)); return next })
  }, [])
  const refreshOneCalendar = useCallback((id) => {
    const sub = extCalendars.find(c => c.id === id)
    if (sub) syncCalendar(sub)
  }, [extCalendars, syncCalendar])
  // Edit a subscription's display fields (name / color / icon). The URL and
  // enabled flag have their own paths; this is just the cosmetics, but it also
  // recolors the already-fetched spans in place so the change shows instantly
  // without waiting for the next sync.
  const updateCalendar = useCallback((id, changes) => {
    setExtCalendars_(prev => {
      const next = prev.map(c => c.id === id ? { ...c, ...changes } : c)
      setExternalCalendars(next).catch(e => console.warn("[Bloom] calendar config save failed:", e))
      const sub = next.find(c => c.id === id)
      if (sub) setExtSpans_(sp => (sp[id] ? { ...sp, [id]: eventsToSpans(sub, sp[id].map(s => ({
        uid: s.uid, summary: s.label, startDate: s.startDate, endDate: s.endDate, allDay: s.allDay,
        startTime: s.startTime, endTime: s.endTime, location: s.location,
      }))) } : sp))
      return next
    })
  }, [])

  // Enabled calendars' events, as spans, merged into what the Calendar renders.
  const externalSpans = useMemo(
    () => extCalendars.filter(c => c.enabled !== false).flatMap(c => extSpans[c.id] || []),
    [extCalendars, extSpans],
  )

  // ── Reminders / PWA ──────────────────────────────────────────
  // Register the service worker once (enables installability + lets reminders
  // show even when the tab is backgrounded).
  useEffect(() => {
    console.log('[Bloom] build', BUILD_ID)
    // Register the SW, then (if background push was turned on) make sure this
    // device's stored push subscription is still current.
    registerServiceWorker().then(() => ensureBackgroundPush())
  }, [])

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

  // How many open tasks carry a place — shown in Settings so the user can see
  // whether location arrivals have anything to act on.
  const locatedTaskCount = useMemo(
    () => commitments.filter(c => !c.done && commitmentMeta[c.id]?.location).length,
    [commitments, commitmentMeta],
  )

  // ── Reminders ────────────────────────────────────────────────
  // Recompute reminders whenever the data that drives them changes, and again
  // each time the app is brought back to the foreground (so it "catches up" on
  // anything that came due while it was closed). No-ops unless the user has
  // turned reminders on in Settings.
  useEffect(() => {
    if (loading) return
    // Time blocks (containers) aren't tasks — don't remind about them.
    const remindable = commitments.filter(c => !commitmentMeta[c.id]?.block)
    const resync = () => syncReminders(events, remindable, recurringReminderItems)
    resync()
    // Also hand the upcoming reminders to the cloud queue so they can be pushed
    // when Bloom is closed (no-op unless background push is turned on). Only on
    // data changes — not the 60s heartbeat below — since the schedule only
    // changes when the underlying items do.
    syncScheduledPushesDebounced(events, remindable, recurringReminderItems)
    // Re-sync on any signal that the app came back to life, plus a steady
    // heartbeat. A single long setTimeout drifts badly when the device sleeps,
    // so instead of trusting one timer per reminder we recompute every minute
    // while open: syncReminders is idempotent (the "fired" map guarantees each
    // reminder fires once), so this only ever *catches up* a due reminder that a
    // drifted/suspended timer would otherwise miss — the main way reminders got
    // dropped on an open tab.
    const onVis = () => { if (!document.hidden) resync() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', resync)
    window.addEventListener('online', resync)
    // The default-alert set can change from a cross-device sync (or the Settings
    // panel) — re-arm timers against the new leads when it does.
    window.addEventListener('bloom-default-alerts', resync)
    const beat = setInterval(() => { if (!document.hidden) resync() }, 60 * 1000)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', resync)
      window.removeEventListener('online', resync)
      window.removeEventListener('bloom-default-alerts', resync)
      clearInterval(beat)
    }
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
  //
  // Only tasks whose location opts in with `autoStart` are watched. A tagged
  // place is informative by default (it just shows where the task happens);
  // arrival auto-start is a per-task toggle set in the add sheet.
  useEffect(() => {
    if (loading || !geolocationSupported()) return
    const dd = new Date()
    const today = `${dd.getFullYear()}-${String(dd.getMonth()+1).padStart(2,'0')}-${String(dd.getDate()).padStart(2,'0')}`
    // Current set of not-done, located, not-yet-started items whose location
    // asked to auto-start on arrival — commitments AND today's recurring
    // occurrences. Read fresh on each position update via the getter so it
    // tracks live state. Recurring ones use an "occ:" id so arrival marks the
    // per-day occurrence, not the commitment.
    const getLocatedTasks = () => {
      const commits = commitments
        .filter(c => !c.done && commitmentMeta[c.id]?.location?.autoStart && !commitmentMeta[c.id]?.startedAt)
        .map(c => ({ id: c.id, name: c.text, location: commitmentMeta[c.id].location }))
      const recs = recurringOccurrencesForDate(recurringTasksEnriched, today, recurringExceptions)
        .filter(o => o.location?.autoStart && !completions[`${today}_${o.id}`] && !occStarted[occKey(o.id, today)])
        .map(o => ({ id: 'occ:' + occKey(o.id, today), name: o.title || o.text || 'Task', location: o.location }))
      return [...commits, ...recs]
    }
    if (!getLocatedTasks().length) return

    const stop = watchArrivals(getLocatedTasks, (task) => {
      if (typeof task.id === 'string' && task.id.startsWith('occ:')) {
        const key = task.id.slice(4)
        setOccStarted(prev => {
          if (prev[key]) return prev
          const next = { ...prev, [key]: Date.now() }
          try { localStorage.setItem('bloom_occ_started', JSON.stringify(next)) } catch {}
          return next
        })
        notifyArrival(task.name)
        return
      }
      setCommitmentMeta_(prev => {
        if (prev[task.id]?.startedAt) return prev            // already started
        const merged = { ...(prev[task.id] || {}), startedAt: Date.now() }
        const next = { ...prev, [task.id]: merged }
        setCommitmentMeta(next).catch(reportSaveError)
        return next
      })
      notifyArrival(task.name)
    }, { onError: (err) => console.warn('[Bloom] location arrival watch:', err && (err.message || err.code)) })
    return stop
  }, [loading, commitments, commitmentMeta, recurringTasksEnriched, recurringExceptions, completions, occStarted])

  // ── Persist helpers ──────────────────────────────────────────
  // Cloud write failures are surfaced instead of swallowed — otherwise a delete
  // looks like it worked (local state updates) but silently reverts on next load.
  // (In-flight kv_store writes are tracked centrally in storage.js's dbSet,
  // which warns before the tab closes/reloads while a save is still pending.)
  const reportSaveError = err => { console.error(err); alert(`⚠️ ${err.message || err}\n\nThis change was NOT saved to the cloud and may revert. Check your connection and try again.`) }

  // Notes save as you type, but the cloud write is debounced: typing a page
  // used to fire one Supabase upsert per keystroke (a real Disk IO / WAL drain).
  // Local state still updates instantly; the cloud gets one write per pause,
  // and any pending write is flushed when the tab is hidden or closed so the
  // last keystrokes are never lost.
  const notesTimer   = useRef(null)
  const notesPending = useRef(null)
  const flushNotes = useCallback(() => {
    if (notesTimer.current) { clearTimeout(notesTimer.current); notesTimer.current = null }
    if (notesPending.current == null) return
    const v = notesPending.current
    notesPending.current = null
    Promise.resolve(setNotes(v)).catch(reportSaveError)
  }, [])
  const updateNotes = useCallback(v => {
    setNotes_(v)
    notesPending.current = v
    if (notesTimer.current) clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(flushNotes, 800)
  }, [flushNotes])
  useEffect(() => {
    const onHide = () => { if (document.hidden) flushNotes() }
    window.addEventListener('beforeunload', flushNotes)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('beforeunload', flushNotes)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [flushNotes])
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
      const { freq, interval, monthDay, durationMins, routine, icon, color, block, location, autoComplete } = task
      if ((freq && freq !== 'weekly') || (interval && interval > 1) || monthDay || durationMins || routine || icon || color || block || location || autoComplete) {
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
            ...(location ? { location } : {}),
            ...(autoComplete ? { autoComplete: true } : {}),
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
    const { freq, interval, monthDay, durationMins, routine, icon, color, block, location, autoComplete } = task
    const extra = {
      ...(freq && freq !== 'weekly' ? { freq } : {}),
      ...(interval && interval > 1 ? { interval } : {}),
      ...(monthDay ? { monthDay } : {}),
      ...(durationMins ? { durationMins } : {}),
      ...(routine ? { routine } : {}),
      ...(icon ? { icon } : {}),
      ...(color ? { color } : {}),
      ...(block ? { block: true } : {}),
      ...(location ? { location } : {}),
      ...(autoComplete ? { autoComplete: true } : {}),
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
    pushUndo('removed a repeating task for the day', () => unskipRecurringOccurrence(recurringId, date))
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

  // ── Undo (Ctrl/Cmd+Z) ────────────────────────────────────────
  // A small stack of "how to reverse the last thing you did." Each mutating
  // action below pushes an inverse; Ctrl+Z pops and runs the most recent one.
  // `undoingRef` keeps an undo from itself being recorded as a new action.
  const undoStackRef = useRef([])
  const undoingRef = useRef(false)
  // The toast is an object: { text, action }. When `action` is true it's the
  // "you just did X" prompt and carries a tappable Undo button (the only way to
  // undo on a phone, where there's no Ctrl+Z); otherwise it's a brief result
  // message ("Undid: X" / "Nothing to undo").
  const [undoToast, setUndoToast] = useState(null)
  const undoTimerRef = useRef(null)
  const showToast = useCallback((text, action = false) => {
    clearTimeout(undoTimerRef.current)
    setUndoToast({ text, action })
    // Leave the Undo prompt up long enough to actually reach for it on mobile.
    undoTimerRef.current = setTimeout(() => setUndoToast(null), action ? 6000 : 2000)
  }, [])
  const pushUndo = useCallback((label, undo) => {
    if (undoingRef.current) return
    undoStackRef.current.push({ label, undo })
    if (undoStackRef.current.length > 25) undoStackRef.current.shift()
    // Surface the "Undo" affordance the moment the change lands.
    showToast(label, true)
  }, [showToast])
  const runUndo = useCallback(() => {
    const entry = undoStackRef.current.pop()
    if (!entry) { showToast('Nothing to undo'); return }
    undoingRef.current = true
    try { entry.undo() } finally { setTimeout(() => { undoingRef.current = false }, 0) }
    showToast('Undid: ' + entry.label)
  }, [showToast])
  useEffect(() => {
    const onKey = (e) => {
      const z = e.key === 'z' || e.key === 'Z'
      if (!z || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return
      // Don't hijack the browser's text-undo while typing.
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      e.preventDefault()
      runUndo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [runUndo])

  // ── Commitments CRUD — each is one atomic row operation now, never a
  // whole-array overwrite, so two edits in flight at once can't clobber
  // each other the way they used to. ──────────────────────────
  // description + subtasks live in the kv_store meta blob (no commitments-table
  // columns), so they're split off from the core row write here.
  // Extra category labels beyond the primary live in the meta blob too (the
  // commitments table has a single `cat` column). Only stored when there's more
  // than one — a single label is fully covered by the `cat` column.
  // ── Change history (a reversible "recent edits" list, shown in Settings) ──
  // Live mirrors of state so the (dep-stable) CRUD callbacks can read the value
  // BEFORE a change to build an inverse, without re-creating on every edit.
  const commitmentsRef    = useRef([])
  const commitmentMetaRef = useRef({})
  const eventsRef         = useRef([])
  const changeHistoryRef  = useRef([])
  useEffect(() => { commitmentsRef.current = commitments },       [commitments])
  useEffect(() => { commitmentMetaRef.current = commitmentMeta }, [commitmentMeta])
  useEffect(() => { eventsRef.current = events },                 [events])
  useEffect(() => { changeHistoryRef.current = changeHistory },   [changeHistory])

  // Append one reversible entry (newest first, capped). CRUD ops call this
  // unless invoked with { silent:true } (which the undo path uses so reversing a
  // change doesn't itself land in the history).
  const recordChange = useCallback(entry => {
    try {
      const row = { id: 'h-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), ts: new Date().toISOString(), undone: false, ...entry }
      setChangeHistory_(prev => { const next = [row, ...prev].slice(0, 120); setChangeHistory(next).catch(() => {}); return next })
    } catch {}
  }, [])

  const addCommitment = useCallback(async (c, opts = {}) => {
    const { description, subtasks, cats, color, icon, location, startedAt, block, routine, autoComplete, recordValues, ...core } = c
    // Scheduling an item onto a day that's already passed means it happened —
    // land it already checked off (a real completion that counts toward
    // progress), unless it's a time block or the caller already set done.
    // Skipped for silent adds (undo/redo restores keep their snapshot's state).
    const backfillDone = !opts.silent && !block && !core.done && isPastDate(core.date)
    if (backfillDone) core.done = true
    try {
      const created = await dbAddCommitment(core)
      setCommitments_(prev => [created, ...prev])
      if (backfillDone) {
        // Mirror a manual check-off: record the completion and log it so the
        // item counts toward the Informatics stats and streak, same as syncToggle.
        setCompletions_(prev => { const n = { ...prev, [created.id]: true }; setCompletion(created.id, true).catch(reportSaveError); return n })
        const d = new Date()
        const entry = { date: todayStr(), dateLabel: d.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' }), label: created.text || 'task', tag: core.cat || '', ts: d.toISOString(), storageKey: created.id }
        setLog_(prev => [...prev, entry])
        addLogEntry(entry).catch(reportSaveError)
      }
      pushUndo('added “' + (created.text || 'task') + '”', () => deleteCommitment(created.id))
      if (!opts.silent) recordChange({ kind: 'add', entity: 'task', label: 'Added “' + (created.text || 'task') + '”', inverse: { op: 'delete', entity: 'task', id: created.id } })
      const hasCats = Array.isArray(cats) && cats.length > 1
      const hasRecord = recordValues && Object.keys(recordValues).length > 0
      const extra = { ...(hasCats ? { cats } : {}), ...(color ? { color } : {}), ...(icon ? { icon } : {}), ...(location ? { location } : {}), ...(startedAt ? { startedAt } : {}), ...(block ? { block: true } : {}), ...(routine ? { routine } : {}), ...(autoComplete ? { autoComplete: true } : {}), ...(hasRecord ? { recordValues } : {}) }
      if ((description && description.trim()) || (subtasks && subtasks.length) || hasCats || color || icon || location || startedAt || block || routine || autoComplete || hasRecord) {
        setCommitmentMeta_(prev => {
          const next = { ...prev, [created.id]: { description: description || '', subtasks: subtasks || [], ...extra } }
          setCommitmentMeta(next).catch(reportSaveError)
          return next
        })
      }
      // File it into any record folder its labels point at. The task lands on
      // the day AND in the books, from one save — and in every folder it's
      // tagged for, not just the first.
      recordTask({ id: created.id, text: created.text, date: created.date, durationMins: created.durationMins },
        (Array.isArray(cats) && cats.length) ? cats : (core.cat ? [core.cat] : []), recordValues || {})
    } catch (e) { reportSaveError(e) }
  }, [])

  // ── Imported-event adoptions ─────────────────────────────────
  // "Add to my schedule" copies a read-only imported event into a real
  // commitment the user owns (so they can move/edit it freely), then records the
  // adoption so it reads as "Added" everywhere and is never offered twice.
  const adoptImportedEvent = useCallback((span, dateStr, timeHHMM, durationMins) => {
    const key = importedKey(span)
    if (importedAdoptions[key]) return
    const cid = 'c-imp-' + Date.now().toString(36)
    addCommitment({
      id: cid,
      text: (span.label || 'Busy').trim(),
      date: dateStr,
      time: timeHHMM || null,
      durationMins: durationMins || null,
      cat: '', done: false,
      color: span.color || null,
      icon: span.icon || null,
      location: span.location || '',
      // Note where it came from. This must be `description` (kept in the meta
      // blob), NOT `note` — `commitments` has no `note` column, so passing one
      // makes the cloud insert fail ("could not find the 'note' column").
      description: span.calendarName ? `From ${span.calendarName}` : 'From a subscribed calendar',
      createdAt: new Date().toISOString(),
    })
    setImportedAdoptions_(prev => {
      const next = { ...prev, [key]: cid }
      setImportedAdoptions(next).catch(e => console.warn("[Bloom] adoption save failed:", e))
      return next
    })
  }, [importedAdoptions, addCommitment])
  const updateCommitment = useCallback(async (id, changes, opts = {}) => {
    const { description, subtasks, cats, color, icon, location, startedAt, block, routine, autoComplete, recordValues, ...core } = changes
    // Snapshot the prior values of exactly the fields being changed, so this
    // edit can be reversed later. Pure check-offs (only `done`) and pure subtask
    // check-offs (same subtask count) are skipped — they're not "edits".
    const beforeC = commitmentsRef.current.find(x => x.id === id) || {}
    const beforeMeta = commitmentMetaRef.current[id] || {}
    const coreKeys = Object.keys(core)
    const before = {}
    for (const k of coreKeys) if (k !== 'done') before[k] = beforeC[k] ?? null
    if (description !== undefined) before.description = beforeMeta.description ?? ''
    if (subtasks !== undefined)   before.subtasks = Array.isArray(beforeMeta.subtasks) ? beforeMeta.subtasks : []
    if (cats !== undefined)       before.cats = beforeMeta.cats
    if (color !== undefined)      before.color = beforeMeta.color ?? ''
    if (icon !== undefined)       before.icon = beforeMeta.icon ?? ''
    if (location !== undefined)   before.location = beforeMeta.location ?? ''
    const subLen = Array.isArray(subtasks) ? subtasks.length : null
    const beforeSubLen = Array.isArray(beforeMeta.subtasks) ? beforeMeta.subtasks.length : 0
    const meaningful =
      coreKeys.some(k => k !== 'done') ||
      (description !== undefined && (beforeMeta.description || '') !== (description || '')) ||
      (subLen !== null && subLen !== beforeSubLen) ||
      cats !== undefined || color !== undefined || icon !== undefined || location !== undefined
    try {
      if (Object.keys(core).length) {
        const updated = await dbUpdateCommitment(id, core)
        setCommitments_(prev => prev.map(c => c.id===id ? updated : c))
      }
      if (description !== undefined || subtasks !== undefined || cats !== undefined || color !== undefined || icon !== undefined || location !== undefined || startedAt !== undefined || block !== undefined || routine !== undefined || autoComplete !== undefined || recordValues !== undefined) {
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
          if (routine !== undefined) {
            if (routine) merged.routine = routine
            else delete merged.routine
          }
          if (autoComplete !== undefined) {
            if (autoComplete) merged.autoComplete = true
            else delete merged.autoComplete
          }
          if (recordValues !== undefined) {
            if (recordValues && Object.keys(recordValues).length) merged.recordValues = recordValues
            else delete merged.recordValues
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
      if (!opts.silent && meaningful) recordChange({ kind: 'edit', entity: 'task', label: 'Edited “' + (beforeC.text || 'task') + '”', inverse: { op: 'update', entity: 'task', id, before } })
      // Keep the books in step with the edit: re-file the task into the folders
      // its labels point at now, and drop the entries a removed label orphaned.
      const after = { ...beforeC, ...core }
      const nextCats = cats !== undefined
        ? (cats || [])
        : ((Array.isArray(beforeMeta.cats) && beforeMeta.cats.length) ? beforeMeta.cats : (after.cat ? [after.cat] : []))
      const nextValues = recordValues !== undefined ? (recordValues || {}) : (beforeMeta.recordValues || {})
      recordTask({ id, text: after.text, date: after.date, durationMins: after.durationMins }, nextCats, nextValues)
    } catch (e) { reportSaveError(e) }
  }, [])
  const deleteCommitment = useCallback(async (id, opts = {}) => {
    // Snapshot what we're removing so Ctrl+Z can put it back exactly.
    let snapC = null, snapMeta = null
    setCommitments_(prev => { snapC = prev.find(c => c.id === id) || null; return prev.filter(c => c.id !== id) })
    setCompletions_(prev => { const n = {...prev}; delete n[id]; return n })
    setCommitmentMeta_(prev => {
      snapMeta = prev[id] || null
      if (!(id in prev)) return prev
      const n = { ...prev }; delete n[id]
      setCommitmentMeta(n).catch(reportSaveError)
      return n
    })
    if (snapC) {
      const c = snapC, meta = snapMeta
      if (!opts.silent) recordChange({ kind: 'delete', entity: 'task', label: 'Deleted “' + (c.text || 'task') + '”', inverse: { op: 'restore', entity: 'task', snapshot: { core: c, meta } } })
      pushUndo('deleted “' + (c.text || 'task') + '”', async () => {
        try {
          const created = await dbAddCommitment(c)   // c keeps its id → same row back
          setCommitments_(prev => [created, ...prev.filter(x => x.id !== created.id)])
          if (meta) setCommitmentMeta_(prev => { const n = { ...prev, [created.id]: meta }; setCommitmentMeta(n).catch(reportSaveError); return n })
          // …and so does whatever it had written into the record folders.
          recordTask({ id: created.id, text: created.text, date: created.date, durationMins: created.durationMins },
            (Array.isArray(meta?.cats) && meta.cats.length) ? meta.cats : (created.cat ? [created.cat] : []),
            meta?.recordValues || {})
        } catch (e) { reportSaveError(e) }
      })
    }
    // Whatever this task had written into the record folders goes with it.
    const trimmed = removeTaskEntries(trackerEntriesRef.current, id)
    if (trimmed !== trackerEntriesRef.current) saveTrackerEntries(trimmed)
    try { await Promise.all([dbDeleteCommitment(id), setCompletion(id, false)]) }
    catch (e) { reportSaveError(e) }
  }, [])

  // Pull a scheduled task off the calendar and pin it to the Thoughts board as
  // a sticky note — the replacement for the old "Move to Inbox". The task's text
  // becomes the note; the commitment itself is then deleted (which registers its
  // own undo, so Ctrl+Z brings the task back).
  const moveCommitmentToThoughts = useCallback(async c => {
    try { await addThought(c?.text || '') } catch (e) { reportSaveError(e) }
    deleteCommitment(c.id)
  }, [deleteCommitment])

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
  const addEvent = useCallback(async (e, opts = {}) => {
    try {
      const created = await dbAddEvent(e)
      setEvents_(prev => [...prev, created])
      if (!opts.silent) recordChange({ kind: 'add', entity: 'event', label: 'Added event “' + (created.label || 'event') + '”', inverse: { op: 'delete', entity: 'event', id: created.id } })
    } catch (err) { reportSaveError(err) }
  }, [])
  const deleteEvent = useCallback(async (id, opts = {}) => {
    const snap = eventsRef.current.find(e => e.id === id) || null
    setEvents_(prev => prev.filter(e => e.id !== id))
    if (snap && !opts.silent) recordChange({ kind: 'delete', entity: 'event', label: 'Deleted event “' + (snap.label || 'event') + '”', inverse: { op: 'restore', entity: 'event', snapshot: snap } })
    try { await dbDeleteEvent(id) } catch (e) { reportSaveError(e) }
  }, [])

  // Reverse one recorded change (the "delete an edit" action in Settings). Reads
  // the entry from the live mirror, applies its inverse with { silent:true } so
  // the reversal isn't itself logged, then marks the entry undone.
  const undoChange = useCallback(id => {
    const entry = changeHistoryRef.current.find(h => h.id === id)
    if (!entry || entry.undone) return
    const inv = entry.inverse || {}
    try {
      if (inv.op === 'delete') {
        if (inv.entity === 'event') deleteEvent(inv.id, { silent: true })
        else deleteCommitment(inv.id, { silent: true })
      } else if (inv.op === 'restore') {
        if (inv.entity === 'event') { if (inv.snapshot) addEvent(inv.snapshot, { silent: true }) }
        else { const s = inv.snapshot || {}; addCommitment({ ...(s.core || {}), ...(s.meta || {}) }, { silent: true }) }
      } else if (inv.op === 'update') {
        if (inv.entity === 'task') updateCommitment(inv.id, inv.before || {}, { silent: true })
      }
    } catch (e) { reportSaveError(e) }
    setChangeHistory_(prev => {
      const next = prev.map(h => h.id === id ? { ...h, undone: true, undoneAt: new Date().toISOString() } : h)
      setChangeHistory(next).catch(() => {})
      return next
    })
  }, [addCommitment, updateCommitment, deleteCommitment, addEvent, deleteEvent])

  // Wipe the history list (does not touch any tasks/events — just clears the log).
  const clearChangeHistory = useCallback(() => {
    setChangeHistory_(() => { setChangeHistory([]).catch(() => {}); return [] })
  }, [])

  // ── Manual time logs (Informatics) ──────────────────────────
  const addTimeLog = useCallback(entry => {
    const row = { id: 'tl-' + Date.now().toString(36), createdAt: new Date().toISOString(), ...entry }
    setTimeLogs_(prev => { const next = [row, ...prev]; setTimeLogs(next).catch(reportSaveError); return next })
  }, [])
  const deleteTimeLog = useCallback(id => {
    setTimeLogs_(prev => { const next = prev.filter(t => t.id !== id); setTimeLogs(next).catch(reportSaveError); return next })
  }, [])

  // ── Labels ↔ record folders ──────────────────────────────────
  // Everything that lets a tagged task write itself into a record folder. The
  // label wiring and the tracker blobs are mirrored into refs (and into the
  // lib/labels.js registers) so the dep-stable commitment CRUD below can read
  // the latest values without being rebuilt on every edit.
  const labelMetaRef      = useRef({})
  const categoriesRef     = useRef([])
  const trackerFoldersRef = useRef([])
  const trackerPeopleRef  = useRef([])
  const trackerEntriesRef = useRef([])
  const commitmentsLiveRef = useRef([])
  useEffect(() => { labelMetaRef.current = labelMeta; registerLabelMeta(labelMeta) }, [labelMeta])
  useEffect(() => { categoriesRef.current = categories }, [categories])
  useEffect(() => { trackerFoldersRef.current = trackerFolders; registerRecordFolders(trackerFolders) }, [trackerFolders])
  useEffect(() => { trackerPeopleRef.current = trackerPeople }, [trackerPeople])
  useEffect(() => { trackerEntriesRef.current = trackerEntries }, [trackerEntries])
  useEffect(() => { commitmentsLiveRef.current = commitments }, [commitments])

  // Each tracker blob is written whole, like the routine groups and time logs.
  // The ref is updated alongside the state so a second change in the same tick
  // (a task recording into two folders at once) builds on the first.
  const saveTrackerFolders = useCallback(next => {
    trackerFoldersRef.current = next; registerRecordFolders(next)
    setTrackerFolders_(next); setTrackerFolders(next).catch(reportSaveError)
  }, [])
  const saveTrackerPeople = useCallback(next => {
    trackerPeopleRef.current = next
    setTrackerPeople_(next); setTrackerPeople(next).catch(reportSaveError)
  }, [])
  const saveTrackerEntries = useCallback(next => {
    trackerEntriesRef.current = next
    setTrackerEntries_(next); setTrackerEntries(next).catch(reportSaveError)
  }, [])

  // Write (or clear) one label's record wiring. Passing null forgets it — used
  // when the label itself is deleted.
  const updateLabelMeta = useCallback((labelId, next) => {
    const merged = { ...labelMetaRef.current }
    if (next && ((next.folders || []).length || (next.fields || []).length)) merged[labelId] = { folders: next.folders || [], fields: next.fields || [] }
    else delete merged[labelId]
    const clean = normalizeLabelMeta(merged)
    labelMetaRef.current = clean
    registerLabelMeta(clean)
    setLabelMeta_(clean)
    setLabelMeta(clean).catch(reportSaveError)
  }, [])

  // Find (or quietly create) the person a record field named, inside one
  // folder. Newly created people are returned so the caller can persist them in
  // one write rather than one per field.
  const makePersonResolver = (pending) => (folderId, name) => {
    const wanted = (name || '').trim().toLowerCase()
    if (!wanted) return null
    const all = [...trackerPeopleRef.current, ...pending]
    const found = all.find(p => p.folderId === folderId && (p.name || '').trim().toLowerCase() === wanted)
    if (found) return found.id
    const person = {
      id: 'p-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      folderId, name: name.trim(),
      color: ACCENT_COLORS[all.filter(p => p.folderId === folderId).length % ACCENT_COLORS.length],
      createdAt: new Date().toISOString(),
    }
    pending.push(person)
    return person.id
  }

  // File one task into every record folder its labels link to — creating,
  // refreshing or removing its entries so the books always match the task. A
  // no-op when nothing changed, so it's safe to call on every save.
  const recordTask = useCallback((task, catIds, values) => {
    if (!task?.id) return
    const pending = []
    const next = syncTaskEntries({
      entries: trackerEntriesRef.current, task,
      catIds: catIds || [], values: values || {},
      categories: categoriesRef.current,
      resolvePerson: makePersonResolver(pending),
    })
    if (pending.length) saveTrackerPeople([...trackerPeopleRef.current, ...pending])
    if (next !== trackerEntriesRef.current) saveTrackerEntries(next)
  }, [saveTrackerEntries, saveTrackerPeople])

  // Re-file every task carrying a label whose record wiring just changed. This
  // is what makes tagging first and linking later work: link "Rental" to the
  // Rental folder and the tasks already tagged with it appear in that folder.
  const resyncLabel = useCallback((labelId) => {
    const meta = commitmentMetaRef.current
    for (const c of commitmentsLiveRef.current) {
      const m = meta[c.id] || {}
      const catIds = (Array.isArray(m.cats) && m.cats.length) ? m.cats : (c.cat ? [c.cat] : [])
      if (!catIds.includes(labelId)) continue
      recordTask({ id: c.id, text: c.text, date: c.date, durationMins: c.durationMins }, catIds, m.recordValues || {})
    }
  }, [recordTask])
  const saveLabelMeta = useCallback((labelId, next) => {
    updateLabelMeta(labelId, next)
    // Let the register settle before re-filing, so the sync reads the new links.
    setTimeout(() => resyncLabel(labelId), 0)
  }, [updateLabelMeta, resyncLabel])

  // ── Record folders (the Records tab's trackers) ──────────────
  const addTrackerFolder = useCallback(folder => { saveTrackerFolders([...trackerFoldersRef.current, folder]) }, [saveTrackerFolders])
  const updateTrackerFolder = useCallback((id, changes) => {
    saveTrackerFolders(trackerFoldersRef.current.map(f => f.id === id ? { ...f, ...changes } : f))
  }, [saveTrackerFolders])
  const deleteTrackerFolder = useCallback(id => {
    saveTrackerFolders(trackerFoldersRef.current.filter(f => f.id !== id))
    saveTrackerEntries(trackerEntriesRef.current.filter(e => e.folderId !== id))
    saveTrackerPeople(trackerPeopleRef.current.filter(p => p.folderId !== id))
    // Any label that filed into it stops pointing at a folder that's gone.
    const meta = labelMetaRef.current
    const cleaned = {}
    let touched = false
    for (const [k, v] of Object.entries(meta)) {
      const folders = (v.folders || []).filter(l => l.folderId !== id)
      if (folders.length !== (v.folders || []).length) touched = true
      cleaned[k] = { ...v, folders }
    }
    if (touched) {
      const clean = normalizeLabelMeta(cleaned)
      labelMetaRef.current = clean; registerLabelMeta(clean)
      setLabelMeta_(clean); setLabelMeta(clean).catch(reportSaveError)
    }
  }, [saveTrackerFolders, saveTrackerEntries, saveTrackerPeople])

  // Merge one record folder into another. Categories, people and entries move
  // across; labels that pointed at the old folder now point at the new one; and
  // a task that had been recorded in both folders collapses back into a single
  // entry, so it reads as one task again rather than two records of it.
  const mergeTrackerFolders = useCallback((sourceId, targetId) => {
    const res = mergeRecordFolders({
      folders: trackerFoldersRef.current, entries: trackerEntriesRef.current,
      people: trackerPeopleRef.current, sourceId, targetId,
    })
    if (!res) return null
    saveTrackerFolders(res.folders); saveTrackerPeople(res.people); saveTrackerEntries(res.entries)
    const remapped = normalizeLabelMeta(remapLabelFolders(labelMetaRef.current, sourceId, targetId))
    labelMetaRef.current = remapped; registerLabelMeta(remapped)
    setLabelMeta_(remapped); setLabelMeta(remapped).catch(reportSaveError)
    return res
  }, [saveTrackerFolders, saveTrackerPeople, saveTrackerEntries])

  const addTrackerEntry = useCallback(entry => { saveTrackerEntries([...trackerEntriesRef.current, entry]) }, [saveTrackerEntries])
  const addTrackerEntries = useCallback(list => { saveTrackerEntries([...trackerEntriesRef.current, ...list]) }, [saveTrackerEntries])
  const deleteTrackerEntry = useCallback(id => { saveTrackerEntries(trackerEntriesRef.current.filter(e => e.id !== id)) }, [saveTrackerEntries])
  const addTrackerPerson = useCallback(p => {
    const person = { id: 'p-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), color: ACCENT_COLORS[trackerPeopleRef.current.length % ACCENT_COLORS.length], createdAt: new Date().toISOString(), ...p }
    saveTrackerPeople([...trackerPeopleRef.current, person])
    return person
  }, [saveTrackerPeople])
  const updateTrackerPerson = useCallback((id, ch) => { saveTrackerPeople(trackerPeopleRef.current.map(p => p.id === id ? { ...p, ...ch } : p)) }, [saveTrackerPeople])
  const deleteTrackerPerson = useCallback(id => { saveTrackerPeople(trackerPeopleRef.current.filter(p => p.id !== id)) }, [saveTrackerPeople])

  // ── Task Menu templates (one synced kv blob) ─────────────────
  // Reusable, date-less task presets. Each op writes the whole next array, like
  // the routine groups + time logs above.
  const addTaskTemplate = useCallback(tpl => {
    const row = { id: tpl.id || ('tpl-' + Date.now().toString(36)), createdAt: tpl.createdAt || new Date().toISOString(), ...tpl }
    setTaskTemplates_(prev => { const next = [...prev, row]; setTaskTemplates(next).catch(reportSaveError); return next })
  }, [])
  const updateTaskTemplate = useCallback((id, changes) => {
    setTaskTemplates_(prev => { const next = prev.map(t => t.id === id ? { ...t, ...changes } : t); setTaskTemplates(next).catch(reportSaveError); return next })
  }, [])
  const deleteTaskTemplate = useCallback(id => {
    setTaskTemplates_(prev => { const next = prev.filter(t => t.id !== id); setTaskTemplates(next).catch(reportSaveError); return next })
  }, [])

  // ── Wellness persist helpers (each one synced kv blob) ───────
  // The wellness tab composes the pure game/analysis logic in lib/wellness.js
  // and hands us the whole next value to save — mirroring the routine-group /
  // time-log pattern above (local state first, cloud write best-effort).
  const persistWlCheckins = useCallback(next => { setWlCheckins_(next); setWellnessCheckins(next).catch(reportSaveError) }, [])
  const persistWlEffects  = useCallback(next => { setWlEffects_(next);  setWellnessEffects(next).catch(reportSaveError) }, [])
  const persistWlEpisodes = useCallback(next => { setWlEpisodes_(next); setWellnessEpisodes(next).catch(reportSaveError) }, [])
  const persistWlGame     = useCallback(next => { setWlGame_(next);     setWellnessGame(next).catch(reportSaveError) }, [])
  const persistWlEmotions = useCallback(next => { registerEmotionPrefs(next); setWlEmotions_(next); setWellnessEmotions(next).catch(reportSaveError) }, [])
  const persistWlTreasures = useCallback(next => { setWlTreasures_(next); setWellnessTreasures(next).catch(reportSaveError) }, [])
  const persistWlSpace     = useCallback(next => { setWlSpace_(next);     setWellnessSpace(next).catch(reportSaveError) }, [])
  // Custom-art uploads: the Art Studio mutates the in-memory override store
  // (lib/art.js) for an instant re-render, then hands us the whole map to sync.
  const persistArt         = useCallback(map  => { setArtOverrides(map).catch(reportSaveError) }, [])

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

    pushUndo((nowDone ? 'checked off' : 'unchecked') + ' “' + (label || 'task') + '”', () => syncToggle(id, label, tag, date, !!currentDone))

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

  // Drop a task's stored completion record entirely (as opposed to syncToggle,
  // which records an explicit true/false). With no record, a routine / block /
  // auto-complete task falls back to being ticked purely by the clock — checked
  // once its window has passed, unchecked until then. Used when the timeline
  // re-times such a task so its checkmark follows the new time, not a stale tap.
  const clearCompletion = useCallback((id, date) => {
    const storageKey = date ? `${date}_${id}` : id
    setCompletions_(prev => {
      if (!(storageKey in prev)) return prev
      const next = { ...prev }; delete next[storageKey]
      setCompletion(storageKey, false).catch(reportSaveError)
      return next
    })
  }, [])

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
    routine: commitmentMeta[c.id]?.routine ?? null,
    autoComplete: commitmentMeta[c.id]?.autoComplete ?? false,
    recordValues: commitmentMeta[c.id]?.recordValues ?? null,
  }))

  const sharedProps = {
    // Every consumer reads todos[k] || weekState[k] — both point at the same
    // completions object rather than keeping two copies in sync.
    todos: completions, weekState: completions, syncToggle, clearCompletion, pushUndo,
    log, appendLog, notes, updateNotes,
    fcProgress, updateFcProgress, fcStudied, updateFcStudied,
    scheduled, addScheduledTask,
    commitments: commitmentsView, addCommitment, updateCommitment, deleteCommitment, moveCommitmentToThoughts,
    vacations, addVacation, deleteVacation,
    // The Calendar sees the user's own events plus the read-only spans from any
    // enabled subscribed calendars (Mom's family calendar, etc.). Editing/adding
    // still only ever touches the user's own `events` (EventsManager gets those
    // raw), and reminders never fire for the external ones.
    events: [...events, ...externalSpans], addEvent, deleteEvent,
    // Subscribed-calendar plumbing the Day/Week/Month views share: the config
    // (for the visibility legend + its toggle), the read-only event spans (only
    // from enabled calendars), and the "add to my schedule" adoption map + action.
    externalCalendars: extCalendars, toggleCalendar,
    externalEvents: externalSpans,
    importedAdoptions, adoptImportedEvent,
    categories,
    // History-based label prediction for the add sheet (no blind defaults).
    labelModel,
    // Unified recurring schedule — the rule-enriched templates, the synced skip
    // map, and the operations Today/Week/Calendar share so all three stay in sync.
    recurringTasks: recurringTasksEnriched,
    recurringExceptions,
    occStarted,
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
    // The Task Menu — reusable date-less presets the add sheet can pull from.
    taskTemplates,
    summary,
  }

  return (
    <div>
      <div className="shimmer-bg" aria-hidden="true" />
      <div className="bg-illustration" aria-hidden="true" />
      <SeasonalEffects effect={effectsOn ? resolveSeason(season).effect : null} />
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
          {TABS.filter(t => !MORE_TAB_IDS.includes(t.id)).map(t => (
            <button key={t.id} className={`nav-btn ${tab===t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
          <button ref={moreBtnRef}
            className={`nav-btn ${MORE_TAB_IDS.includes(tab) ? 'active' : ''}`}
            aria-haspopup="menu" aria-expanded={moreOpen} onClick={openMore}>
            More <span className="nav-more-caret" aria-hidden="true">▾</span>
          </button>
        </nav>
      </header>

      {/* Desktop "More" dropdown — Recurring / Task Menu / Events. Fixed-
          positioned from the button rect so the nav's overflow scroll can't
          clip it; the scrim catches an outside click to close. */}
      {moreOpen && moreCoords && (
        <>
          <div className="nav-more-scrim" onClick={() => setMoreOpen(false)} aria-hidden="true" />
          <div className="nav-more-menu" role="menu" style={{ top: moreCoords.top, right: moreCoords.right }}>
            {MORE_TAB_IDS.map(id => {
              const t = TABS.find(x => x.id === id)
              if (!t) return null
              return (
                <button key={id} role="menuitem"
                  className={`nav-more-item ${tab===id ? 'active' : ''}`}
                  onClick={() => { setTab(id); setMoreOpen(false) }}>
                  <Glyph id={t.glyph} size={16} />
                  <span>{t.label}</span>
                </button>
              )
            })}
          </div>
        </>
      )}

      <main className="content">
        {tab==='today'       && <Today       {...sharedProps} appendLog={appendLog} scheduled={scheduled} deleteCommitment={deleteCommitment}
          wlCheckins={wlCheckins} persistWlCheckins={persistWlCheckins}
          wlEffects={wlEffects} persistWlEffects={persistWlEffects}
          wlEpisodes={wlEpisodes} persistWlEpisodes={persistWlEpisodes}
          wlGame={wlGame} persistWlGame={persistWlGame} wlLog={log}
          wlEmotions={wlEmotions} persistWlEmotions={persistWlEmotions}
          onOpenWellness={() => setTab('wellness')} />}
        {tab==='week'        && <ThisWeek    {...sharedProps} deleteCommitment={deleteCommitment} />}
        {tab==='taskmenu'    && <TaskMenu templates={taskTemplates} addTemplate={addTaskTemplate}
          updateTemplate={updateTaskTemplate} deleteTemplate={deleteTaskTemplate} categories={categories}
          addCategory={addCategoryFn} updateCategory={updateCategoryFn} deleteCategory={deleteCategoryFn}
          labelMeta={labelMeta} updateLabelMeta={saveLabelMeta} trackerFolders={trackerFolders} />}
        {tab==='calendar'    && <Calendar    {...sharedProps} jumpTo={jumpTo} />}
        {tab==='thoughts'    && <ThoughtsBoard addCommitment={addCommitment} addRecurringTask={addRecurringTaskFn}
          categories={categories} routines={routines} taskTemplates={taskTemplates} labelModel={labelModel}
          appendLog={appendLog} />}
        {tab==='events'      && <EventsManager events={events} addEvent={addEvent} deleteEvent={deleteEvent}
          vacations={vacations} addVacation={addVacation} deleteVacation={deleteVacation} />}
        {tab==='recurring'   && <RecurringTasksManager recurringTasks={{ tasks: recurringTasksEnriched }}
          addRecurringTask={addRecurringTaskFn} updateRecurringTask={updateRecurringTaskFn}
          deleteRecurringTask={deleteRecurringTaskFn} clearRecurringTasks={clearRecurringTasksFn}
          categories={categories} taskTemplates={taskTemplates} labelModel={labelModel}
          routines={routines} addRoutine={addRoutineFn} updateRoutine={updateRoutineFn} deleteRoutine={deleteRoutineFn}
          defaultWeekTasks={DEFAULT_RECURRING_TASKS} defaultDailyTodos={DEFAULT_DAILY_TODOS} />}
        {tab==='wellness'    && <BloomWellness
          checkins={wlCheckins} persistCheckins={persistWlCheckins}
          effects={wlEffects} persistEffects={persistWlEffects}
          episodes={wlEpisodes} persistEpisodes={persistWlEpisodes}
          game={wlGame} persistGame={persistWlGame}
          treasures={wlTreasures} persistTreasures={persistWlTreasures}
          emotionPrefs={wlEmotions} persistEmotionPrefs={persistWlEmotions}
          log={log} />}
        {tab==='voyage'      && <Voyage game={wlGame} persistGame={persistWlGame}
          space={wlSpace} persistSpace={persistWlSpace} checkins={wlCheckins} />}
        {tab==='informatics' && <Informatics commitments={commitmentsView} recurringTasks={recurringTasksEnriched} completions={completions} log={log} categories={categories} timeLogs={timeLogs} addTimeLog={addTimeLog} deleteTimeLog={deleteTimeLog} wlCheckins={wlCheckins} wlEffects={wlEffects} wlEpisodes={wlEpisodes} />}
        {tab==='records'     && <Insights
          folders={trackerFolders} people={trackerPeople} entries={trackerEntries}
          addFolder={addTrackerFolder} updateFolder={updateTrackerFolder} deleteFolder={deleteTrackerFolder}
          mergeFolders={mergeTrackerFolders}
          addEntry={addTrackerEntry} addEntries={addTrackerEntries} deleteEntry={deleteTrackerEntry}
          addPerson={addTrackerPerson} updatePerson={updateTrackerPerson} deletePerson={deleteTrackerPerson}
          commitments={commitmentsView} categories={categories} labelMeta={labelMeta} />}
      </main>

      <SettingsDrawer
        open={settingsOpen} onClose={() => setSettingsOpen(false)}
        settingsTab={settingsTab} setSettingsTab={setSettingsTab}
        changeHistory={changeHistory} undoChange={undoChange} clearChangeHistory={clearChangeHistory}
        notes={notes} updateNotes={updateNotes}
        categories={categories} addCategory={addCategoryFn}
        updateCategory={updateCategoryFn} deleteCategory={deleteCategoryFn}
        labelMeta={labelMeta} updateLabelMeta={saveLabelMeta} trackerFolders={trackerFolders}
        events={events} commitments={commitments}
        recurring={recurringReminderItems} locatedCount={locatedTaskCount}
        externalCalendars={extCalendars} calendarStatuses={calStatuses}
        addCalendar={addCalendar} toggleCalendar={toggleCalendar}
        removeCalendar={removeCalendar} refreshOneCalendar={refreshOneCalendar}
        updateCalendar={updateCalendar}
        font={font} setFont={setFont} theme={theme} setTheme={setTheme}
        season={season} setSeason={setSeason}
        customColor={customColor} setCustom={setCustom}
        background={background} setBackground={setBackground} customBg={customBg} setCustomBg={setCustomBg}
        mobileBackground={mobileBackground} setMobileBackground={setMobileBackground}
        mobileCustomBg={mobileCustomBg} setMobileCustomBg={setMobileCustomBg}
        layout={layout} setLayout={setLayout} soundOn={soundOn} setSound={setSound}
        summary={summary} setSummary={setSummary}
        effectsOn={effectsOn} setEffects={setEffects}
        admin={admin} persistArt={persistArt} />

      <SearchOverlay
        open={searchOpen} onClose={() => setSearchOpen(false)}
        commitments={commitments} events={events} log={log}
        onJump={date => { setTab('calendar'); setJumpTo({ date, nonce: Date.now() }) }} />

      {/* Undo toast — appears after any change; tap Undo to reverse it (also
          Ctrl/Cmd+Z on desktop). */}
      {undoToast && (
        <div style={{ position:'fixed', left:'50%', bottom:96, transform:'translateX(-50%)', zIndex:900,
          background:'#2C3A34', color:'white', padding: undoToast.action ? '8px 8px 8px 18px' : '10px 18px', borderRadius:999, fontSize:13, fontWeight:600,
          boxShadow:'0 8px 30px rgba(0,0,0,.28)', fontFamily:'DM Sans,sans-serif', maxWidth:'calc(100vw - 32px)',
          display:'flex', alignItems:'center', gap:12, pointerEvents: undoToast.action ? 'auto' : 'none' }}>
          <span style={{ minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>↩ {undoToast.text}</span>
          {undoToast.action && (
            <button onClick={runUndo}
              style={{ flexShrink:0, background:'rgba(255,255,255,.16)', color:'white', border:'none', borderRadius:999,
                padding:'6px 16px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'DM Sans,sans-serif' }}>
              Undo
            </button>
          )}
        </div>
      )}

      {/* Mobile side-nav drawer (phones only; CSS hides it on desktop). Its
          rows are drag sources — grab a grip and drag onto the bottom bar. */}
      <MobileNav open={navOpen} onClose={() => setNavOpen(false)}
        tab={tab} setTab={setTab} onOpenSettings={() => setSettingsOpen(true)}
        bind={bindDrag} barItems={barItems} />

      {/* Mobile bottom tab bar (phones only) — a user-arranged set of
          destinations. Drag rows in from the side menu; long-press one and drag
          it off to remove. Everything not on the bar still lives in the side
          menu (top-left) and Settings is always reachable there. */}
      <nav className={`bottom-nav ${drag ? 'dragging-src' : ''}`}>
        {barItems.map(id => {
          const m = barItemMeta(id)
          const active = id === 'settings' ? settingsOpen : (tab === id && !settingsOpen)
          return (
            <button key={id} className={`bottom-nav-btn ${active ? 'active' : ''}`}
              style={{ touchAction: 'none' }} {...bindDrag(id, 'bar', 'hold')}>
              <span className="bottom-nav-icon"><BottomBarGlyph id={id} /></span>
              <span className="bottom-nav-label">{m.label}</span>
            </button>
          )
        })}
      </nav>

      {/* Drag overlay — the floating item under the finger + a live preview of
          where it will land on the bar (or a "release to remove" cue). */}
      {drag && (() => {
        const base = barItems.filter(x => x !== drag.id)
        let list, activeIndex
        if (drag.overBar) {
          const i = Math.max(0, Math.min(base.length, drag.index ?? base.length))
          list = [...base.slice(0, i), drag.id, ...base.slice(i)]
          activeIndex = i
        } else {
          list = base; activeIndex = -1
        }
        const meta = barItemMeta(drag.id)
        return (
          <div className="bar-drag-layer">
            <nav className="bottom-nav bar-drag-preview">
              {list.map((id, i) => {
                const m = barItemMeta(id)
                return (
                  <div key={id} className={`bottom-nav-btn ${i === activeIndex ? 'drop-target' : ''}`}>
                    <span className="bottom-nav-icon"><BottomBarGlyph id={id} /></span>
                    <span className="bottom-nav-label">{m.label}</span>
                  </div>
                )
              })}
            </nav>
            {drag.removing && (
              <div className="bar-remove-hint">Release to remove {meta.label}</div>
            )}
            <div className={`bar-drag-ghost ${drag.removing ? 'removing' : ''}`} style={{ left: drag.x, top: drag.y }}>
              <span className="bottom-nav-icon"><BottomBarGlyph id={drag.id} /></span>
              <span className="bottom-nav-label">{drag.removing ? 'Remove' : meta.label}</span>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
