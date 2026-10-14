// src/components/Informatics.jsx
// ─────────────────────────────────────────────────────────────
// The "Insights" tab — where your time, your skills and your wellbeing went,
// read from everything you finished and every check-in you made.
//
// The page is built so no two numbers on it can disagree: one timeframe at the
// top — the past 7 days unless you set another — scopes everything below it,
// and nothing on it is cumulative. Under that, a row of headline tiles (time
// tracked, top area, mood, conditions), the question box — "how many hours on
// MCAT?", "what skills am I using?", "where does my time go?" — and then three
// views, Time · Skills · Mind & body, so each is a screen you can take in rather
// than a scroll you give up on. The arithmetic lives in lib/insights.js,
// lib/skills.js, lib/wellness.js and lib/timeframe.js; this file only lays it out.
// ─────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { Icon } from './IconPicker.jsx'
import { Glyph } from '../lib/glyphs.jsx'
import Segmented, { useRememberedView } from './Segmented.jsx'
import { useTimeframe, TimeframePicker } from './Timeframe.jsx'
import MindBody from './WellnessInsights.jsx'
import { computeEntries, filterByDates, aggregate, answerQuestion, fmtHours, decimalHours } from '../lib/insights.js'
import { computeSkills, skillCoverage, skillTrend } from '../lib/skills.js'
import {
  DEFAULT_EFFECTS, moodMeta, fmtDuration, keyToDate,
  moodSeriesBetween, moodSummary, effectTotalsBetween,
} from '../lib/wellness.js'

const VIEWS = [
  { id: 'time',   label: 'Time',        glyph: 'clock' },
  { id: 'skills', label: 'Skills',      glyph: 'target' },
  { id: 'body',   label: 'Mind & body', glyph: 'pulse' },
]
const DUR_CHIPS = [15, 30, 45, 60, 90, 120]
const sessions = (n) => `${n} session${n === 1 ? '' : 's'}`

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function shortDate(date) {
  return date ? new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''
}
// "3 days ago" style label for a YYYY-MM-DD date.
function ago(date) {
  if (!date) return ''
  const days = Math.round((new Date(todayStr() + 'T12:00:00') - new Date(date + 'T12:00:00')) / 86400000)
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : days < 14 ? `${days} days ago` : days < 60 ? `${Math.round(days / 7)} weeks ago` : `${Math.round(days / 30)} months ago`
}
// Change between two windows, in hours when either has hours, else in sessions.
function delta(t) {
  if (!t) return null
  const useMins = t.recentMins > 0 || t.priorMins > 0
  const d = useMins ? t.recentMins - t.priorMins : t.recentCount - t.priorCount
  if (!d) return null
  const label = useMins ? fmtHours(Math.abs(d)) : `${Math.abs(d)}×`
  return { up: d > 0, size: useMins ? d : d * 30, text: `${d > 0 ? '↑' : '↓'} ${label}` }
}

// ── Small pieces ───────────────────────────────────────────────

// A thin bar, filled to `frac` of the row, in the thing's own colour.
function Bar({ frac, color }) {
  return (
    <div className="in-bar" aria-hidden="true">
      <div className="in-bar-fill" style={{ width: `${Math.max(2, Math.min(100, frac * 100))}%`, background: color }} />
    </div>
  )
}

// One headline number. Tapping a tile opens the view it summarizes.
function StatTile({ label, value, sub, delta, good, swatch, onClick }) {
  const dir = delta == null || Math.abs(delta) < 0.05 ? null : delta > 0 ? 'up' : 'down'
  const tone = dir == null ? 'flat' : (dir === 'up') === (good !== false) ? 'good' : 'watch'
  return (
    <button type="button" className="in-tile" onClick={onClick}>
      <span className="in-tile-label">{label}</span>
      <span className="in-tile-value">
        {swatch && <span className="in-tile-swatch" style={{ background: swatch }} />}
        <span className="in-tile-num">{value}</span>
        {dir && <span className={`in-tile-delta ${tone}`}>{dir === 'up' ? '↑' : '↓'} {Math.abs(delta)}</span>}
      </span>
      {sub && <span className="in-tile-sub">{sub}</span>}
    </button>
  )
}

// The actual entries behind a number — date, title, hours, and the description
// and subtasks you wrote — newest first. `dark` inside the answer card.
function EntryLog({ entries = [], dark = false, initial = 8 }) {
  const [all, setAll] = useState(false)
  const shown = all ? entries : entries.slice(0, initial)
  if (!entries.length) return null
  return (
    <div className={`in-entries ${dark ? 'dark' : ''}`}>
      {shown.map((e, i) => (
        <div key={(e.date || '') + (e.title || '') + i} className="in-entry">
          <div className="in-entry-top">
            <span className="in-entry-date">{shortDate(e.date)}</span>
            <span className="in-entry-title">{e.title}</span>
            {e.mins > 0 && <span className="in-entry-mins">{fmtHours(e.mins)}</span>}
          </div>
          {e.desc && e.desc.trim() && <div className="in-entry-desc">{e.desc.trim()}</div>}
          {e.subList && e.subList.length > 0 && (
            <ul className="in-entry-subs">{e.subList.map((t, j) => <li key={j}>{t}</li>)}</ul>
          )}
        </div>
      ))}
      {entries.length > initial && (
        <button type="button" className="in-more" onClick={() => setAll(a => !a)}>
          {all ? 'Show fewer' : `Show all ${entries.length}`}
        </button>
      )}
    </div>
  )
}

// A row with a bar under it: icon · name · value, then the bar.
function BarRow({ icon, color, name, meta, value, frac, onClick, open }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag type={onClick ? 'button' : undefined} className={`in-row ${onClick ? 'tappable' : ''}`} onClick={onClick} aria-expanded={onClick ? !!open : undefined}>
      <div className="in-row-top">
        <span className="in-row-ico" style={{ color }}>{icon}</span>
        <span className="in-row-name">{name}</span>
        {meta && <span className="in-row-meta">{meta}</span>}
        <span className="in-row-val">{value}</span>
        {onClick && <span className={`in-chevron ${open ? 'open' : ''}`} aria-hidden="true">›</span>}
      </div>
      <Bar frac={frac} color={color} />
    </Tag>
  )
}

// Record hours for something that had no timed task.
function LogTimeCard({ categories, onSave, onClose }) {
  const [title, setTitle] = useState('')
  const [cat, setCat] = useState('')
  const [mins, setMins] = useState(0)
  const [date, setDate] = useState(todayStr())
  const save = () => {
    if (!(mins > 0)) return
    onSave({ date: date || todayStr(), mins, cat, title: title.trim() || (categories.find(c => c.id === cat)?.label || 'Logged time') })
    onClose()
  }
  return (
    <section className="in-card in-log">
      <div className="in-card-head">
        <h3 className="serif">Log time on something</h3>
        <button type="button" className="in-link" onClick={onClose}>Cancel</button>
      </div>
      <p className="in-card-sub">For work that never was a task — a study session, a shift, a long call. It counts toward the hours here like anything you checked off.</p>
      <input className="in-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="What did you work on? (e.g. MCAT biochem)" />
      {categories.length > 0 && (
        <div className="in-pills">
          <button type="button" className={`in-pill ${cat === '' ? 'on' : ''}`} onClick={() => setCat('')}>No area</button>
          {categories.map(c => (
            <button type="button" key={c.id} className={`in-pill ${cat === c.id ? 'on' : ''}`} onClick={() => setCat(c.id)}
              style={cat === c.id ? { borderColor: c.color, color: c.color, background: `${c.color}18` } : undefined}>
              {c.icon && <Icon value={c.icon} size={12} color={cat === c.id ? c.color : 'var(--muted)'} />}{c.label}
            </button>
          ))}
        </div>
      )}
      <div className="in-pills">
        {DUR_CHIPS.map(m => (
          <button type="button" key={m} className={`in-pill ${mins === m ? 'on' : ''}`} onClick={() => setMins(m)}>{fmtHours(m)}</button>
        ))}
        <span className="in-hm">
          <input type="number" min="0" className="in-num" value={Math.floor(mins / 60) || ''} aria-label="Hours"
            onChange={e => setMins(Math.max(0, +e.target.value || 0) * 60 + (mins % 60))} /><span>h</span>
          <input type="number" min="0" max="59" className="in-num" value={mins % 60 || ''} aria-label="Minutes"
            onChange={e => setMins(Math.floor(mins / 60) * 60 + Math.min(59, Math.max(0, +e.target.value || 0)))} /><span>m</span>
        </span>
      </div>
      <div className="in-form-row">
        <input type="date" className="in-date" value={date} onChange={e => setDate(e.target.value)} max={todayStr()} aria-label="Date" />
        <button type="button" className="in-primary" disabled={!(mins > 0)} onClick={save}>Log {mins > 0 ? fmtHours(mins) : 'time'}</button>
      </div>
    </section>
  )
}

// ── The tab ────────────────────────────────────────────────────
export default function Informatics({ commitments = [], recurringTasks = [], completions = {}, log = [], categories = [], timeLogs = [], addTimeLog, deleteTimeLog, wlCheckins = [], wlEffects, wlEpisodes = [] }) {
  const tf = useTimeframe()
  const [view, setView] = useRememberedView('bloom_insights_view', 'time', VIEWS.map(v => v.id))
  const [query, setQuery] = useState('')
  const [asked, setAsked] = useState('')      // the submitted question
  const [logOpen, setLogOpen] = useState(false)
  const [openSkill, setOpenSkill] = useState(null)   // expanded skill row (shows its tasks)

  // ── Time & skills ────────────────────────────────────────────
  const allEntries = useMemo(
    () => computeEntries({ log, commitments, recurringTasks, completions, timeLogs }),
    [log, commitments, recurringTasks, completions, timeLogs],
  )
  const entries = useMemo(() => filterByDates(allEntries, tf.from, tf.to), [allEntries, tf.from, tf.to])
  const agg = useMemo(() => aggregate(entries, categories), [entries, categories])
  const skills = useMemo(() => computeSkills(entries, categories), [entries, categories])
  const answer = useMemo(() => asked ? answerQuestion(entries, asked, categories) : null, [asked, entries, categories])

  // Momentum: the window against the same number of days before it (a week
  // against the week before, by default); and how much of the tracked time
  // maps to a skill at all (rows overlap, so their sum overstates it).
  const trendDays = Math.max(7, Math.min(90, tf.days))
  const trend = useMemo(() => skillTrend(allEntries, categories, trendDays, keyToDate(tf.to)), [allEntries, categories, trendDays, tf.to])
  const coverage = useMemo(() => skillCoverage(entries, categories), [entries, categories])
  const skillMoves = useMemo(() => {
    const withDelta = skills.map(s => ({ s, d: delta(trend.get(s.id)) })).filter(x => x.d)
    const rising = withDelta.filter(x => x.d.up).sort((a, b) => b.d.size - a.d.size).slice(0, 2).map(x => x.s)
    const fading = skills.filter(s => { const t = trend.get(s.id); return t && t.priorCount > 0 && t.recentCount === 0 })
      .sort((a, b) => (b.mins - a.mins) || (b.count - a.count)).slice(0, 2)
    return { rising, fading }
  }, [skills, trend])

  // ── Mind & body (the same window, in days) ───────────────────
  const effectList = (wlEffects && wlEffects.length) ? wlEffects : DEFAULT_EFFECTS
  const days = tf.days
  const series = useMemo(() => moodSeriesBetween(wlCheckins, tf.from, tf.to), [wlCheckins, tf.from, tf.to])
  const mood = useMemo(() => moodSummary(series), [series])
  const fxTotals = useMemo(() => effectTotalsBetween(wlEpisodes, tf.from, tf.to), [wlEpisodes, tf.from, tf.to])
  const fxRows = useMemo(() => [...fxTotals.values()]
    .map(r => ({ ...r, fx: effectList.find(f => f.id === r.effectId) }))
    .filter(r => r.fx).sort((a, b) => b.mins - a.mins), [fxTotals, effectList])
  const fxMins = fxRows.reduce((a, r) => a + r.mins, 0)

  const hasHours = agg.totalMins > 0
  const totalSessions = entries.length
  const maxCatV = Math.max(1, ...agg.byCategory.map(c => hasHours ? c.mins : c.count))
  const maxSkillV = Math.max(1, ...skills.map(s => hasHours ? s.mins : s.count))
  const rangeLabel = tf.label
  const inRange = tf.phrase

  // Suggestions of what to ask: a couple of self-questions, then the top
  // skills, areas, and a few frequent task names — the things there's data for.
  const suggestions = [
    ...(skills.length ? ['What skills am I using?'] : []),
    ...(totalSessions ? ['Where does my time go?'] : []),
    ...skills.slice(0, 3).map(s => s.label),
    ...agg.byCategory.slice(0, 3).map(c => c.label),
    ...agg.byTask.slice(0, 3).map(t => t.title),
  ].filter((v, i, a) => v && a.indexOf(v) === i).slice(0, 8)

  const ask = (text) => { const v = (text ?? query).trim(); setAsked(v); setQuery(v) }
  const clearAnswer = () => { setAsked(''); setQuery('') }

  // Manual logs within the current range, most recent first (for the list + delete).
  const rangeLogs = filterByDates((timeLogs || []).map(t => ({ ...t })), tf.from, tf.to)
    .slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''))

  const topCat = agg.byCategory[0]

  return (
    <div className="in-wrap">
      <div className="in-head">
        <div className="page-title">Insights</div>
        <div className="page-sub">Where your time, skills and wellbeing went — read from everything you finished and every check-in.</div>
      </div>

      {/* One timeframe scopes the whole page — the past 7 days unless you set another. */}
      <div className="in-toolbar">
        <TimeframePicker />
        {!logOpen && addTimeLog && (
          <button type="button" className="in-log-btn" onClick={() => setLogOpen(true)}><Glyph id="plus" size={13} /> Log time</button>
        )}
      </div>

      {logOpen && <LogTimeCard categories={categories} onSave={addTimeLog} onClose={() => setLogOpen(false)} />}

      {/* Headline tiles — each opens the view that explains it. */}
      <div className="in-tiles">
        <StatTile label="Time tracked" onClick={() => setView('time')}
          value={hasHours ? fmtHours(agg.totalMins) : totalSessions ? sessions(totalSessions) : '—'}
          sub={totalSessions ? `${hasHours ? sessions(totalSessions) + ' · ' : ''}${agg.days} active day${agg.days === 1 ? '' : 's'}` : `Nothing finished ${inRange}`} />
        <StatTile label="Top area" onClick={() => setView('time')}
          value={topCat ? topCat.label : '—'} swatch={topCat?.color}
          sub={topCat ? (topCat.mins > 0 ? fmtHours(topCat.mins) : sessions(topCat.count)) : 'Finish a task to see one'} />
        <StatTile label="Mood" onClick={() => setView('body')}
          value={mood.avg != null ? `${mood.avg}` : '—'} delta={mood.days >= 4 ? mood.direction : null} good
          sub={mood.avg != null ? `${moodMeta(Math.round(mood.avg)).label} · ${mood.days} of ${days} days` : 'No check-ins ' + inRange} />
        <StatTile label="Conditions" onClick={() => setView('body')}
          value={fxRows.length ? fmtDuration(fxMins) : '—'}
          sub={fxRows.length ? `${fxRows[0].fx.name} most${fxRows.length > 1 ? ` · ${fxRows.length} tracked` : ''}` : 'None running ' + inRange} />
      </div>

      {/* Ask about yourself. */}
      <section className="in-card in-ask">
        <div className="in-ask-row">
          <input className="in-input" value={query} onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') ask() }}
            placeholder="How many hours did I spend on…" aria-label="Ask about your time" />
          <button type="button" className="in-primary" onClick={() => ask()} disabled={!query.trim()}>Ask</button>
        </div>
        {suggestions.length > 0 && (
          <div className="in-try">
            <span className="in-try-label">Try</span>
            {suggestions.map(s => (
              <button type="button" key={s} className="in-pill" onClick={() => ask(s)}>{s}</button>
            ))}
          </div>
        )}
      </section>

      {/* The answer. */}
      {answer && ((answer.type === 'skills' ? answer.skills.length > 0 : answer.sessions > 0) ? (
        <section className="in-answer" aria-live="polite">
          <button type="button" className="in-answer-x" onClick={clearAnswer} aria-label="Dismiss answer">✕</button>
          {answer.type === 'skills' ? (() => {
            const totalMins = answer.totalMins
            const pct = totalMins > 0 ? Math.round(coverage.mins / totalMins * 100) : Math.round(coverage.count / Math.max(1, answer.sessions) * 100)
            const maxV = Math.max(1, ...answer.skills.map(s => totalMins > 0 ? s.mins : s.count))
            return (
              <>
                <div className="in-kicker">Skills you’ve been using · {rangeLabel}</div>
                <div className="serif in-hero-serif">
                  Mostly {answer.skills.slice(0, 3).map(s => s.label.split(' & ')[0].toLowerCase()).join(', ').replace(/, ([^,]*)$/, ' & $1')}
                </div>
                <div className="in-answer-sub">
                  {totalMins > 0
                    ? <>{fmtHours(coverage.mins)} of your {fmtHours(totalMins)} ({pct}%) reads as a skill — the rest had titles too vague to tell.</>
                    : <>{coverage.count} of {sessions(answer.sessions)} ({pct}%) read as a skill.</>}
                </div>
                {(skillMoves.rising.length > 0 || skillMoves.fading.length > 0) && (
                  <div className="in-answer-moves">
                    {skillMoves.rising.length > 0 && <div><span>Picking up</span> <b>{skillMoves.rising.map(s => `${s.label} (${delta(trend.get(s.id)).text})`).join(', ')}</b></div>}
                    {skillMoves.fading.length > 0 && <div><span>Dropped off</span> <b>{skillMoves.fading.map(s => `${s.label} (last ${ago(s.lastDate)})`).join(', ')}</b></div>}
                    <div className="in-note">{trendDays} days vs the {trendDays} before</div>
                  </div>
                )}
                <div className="in-answer-rows">
                  {answer.skills.map(s => {
                    const d = delta(trend.get(s.id))
                    const open = openSkill === s.id
                    const share = totalMins > 0 && s.mins > 0 ? Math.round(s.mins / totalMins * 100) : null
                    return (
                      <div key={s.id} className="in-arow-wrap">
                        <button type="button" className="in-arow" onClick={() => setOpenSkill(open ? null : s.id)} aria-expanded={open}>
                          <Icon value={s.icon} size={14} color="currentColor" />
                          <span className="in-arow-body">
                            <span className="in-arow-name">{s.label}</span>
                            <span className="in-arow-sub">{s.tasks.slice(0, 2).map(t => t.title).join(', ')}{s.lastDate ? ` · last ${ago(s.lastDate)}` : ''}</span>
                          </span>
                          {d && <span className={`in-arow-delta ${d.up ? 'up' : 'down'}`}>{d.text}</span>}
                          <span className="in-arow-val">
                            {s.mins > 0 ? fmtHours(s.mins) : sessions(s.count)}
                            {share != null && <small>{share}%</small>}
                          </span>
                        </button>
                        <div className="in-bar dark"><div className="in-bar-fill" style={{ width: `${Math.max(2, (totalMins > 0 ? s.mins : s.count) / maxV * 100)}%` }} /></div>
                        {open && <EntryLog entries={s.entries} dark />}
                      </div>
                    )
                  })}
                </div>
                <div className="in-note">Tap a skill to see everything you logged for it, with your notes. One task can count toward several skills, so the rows overlap.</div>
              </>
            )
          })() : answer.type === 'overview' ? (
            <>
              <div className="in-kicker">Where your time went · {rangeLabel}</div>
              <div className="in-hero">{answer.totalMins > 0 ? fmtHours(answer.totalMins) : sessions(answer.sessions)}</div>
              <div className="in-answer-sub">{answer.totalMins > 0 ? <>{decimalHours(answer.totalMins)} hours · </> : null}{sessions(answer.sessions)} across {answer.days} day{answer.days === 1 ? '' : 's'}</div>
              {answer.byCategory.length > 0 && (
                <div className="in-answer-rows">
                  {answer.byCategory.map(c => (
                    <div key={c.id} className="in-arow static">
                      {c.icon && <Icon value={c.icon} size={13} color="currentColor" />}
                      <span className="in-arow-name">{c.label}</span>
                      <span className="in-arow-val">{c.mins > 0 ? fmtHours(c.mins) : sessions(c.count)}</span>
                    </div>
                  ))}
                </div>
              )}
              {answer.skills.length > 0 && (
                <div className="in-chips">
                  {answer.skills.map(s => <span key={s.id} className="in-chip"><Icon value={s.icon} size={12} color="currentColor" />{s.label}</span>)}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="in-kicker">{answer.totalMins > 0 ? 'Time on' : 'Worked on'} “{answer.topic}” · {rangeLabel}</div>
              <div className="in-hero">{answer.totalMins > 0 ? fmtHours(answer.totalMins) : sessions(answer.sessions)}</div>
              <div className="in-answer-sub">
                {answer.totalMins > 0
                  ? <>{decimalHours(answer.totalMins)} hours · {sessions(answer.sessions)} across {answer.days} day{answer.days === 1 ? '' : 's'}</>
                  : <>{sessions(answer.sessions)} across {answer.days} day{answer.days === 1 ? '' : 's'} · no time estimate on these</>}
              </div>
              {answer.byCategory.length > 0 && (
                <div className="in-chips">
                  {answer.byCategory.map(c => (
                    <span key={c.id} className="in-chip">{c.icon && <Icon value={c.icon} size={12} color="currentColor" />}{c.label} · {c.mins > 0 ? fmtHours(c.mins) : sessions(c.count)}</span>
                  ))}
                </div>
              )}
              {answer.skills && answer.skills.length > 0 && (
                <div className="in-chips faint">
                  <span className="in-chips-label">Skills</span>
                  {answer.skills.map(s => <span key={s.id} className="in-chip"><Icon value={s.icon} size={12} color="currentColor" />{s.label}</span>)}
                </div>
              )}
              {answer.entries && answer.entries.length > 0 && <EntryLog entries={answer.entries} dark />}
            </>
          )}
        </section>
      ) : (
        <section className="in-card in-noanswer">
          <button type="button" className="in-answer-x muted" onClick={clearAnswer} aria-label="Dismiss">✕</button>
          {answer.type === 'skills'
            ? <>No skills inferred {inRange}. Add descriptions or subtasks to your tasks — the more detail, the more the page can pick up.</>
            : <>No tracked time matches “{answer.topic}” {inRange}. Try an area, task or skill name, or widen the range.</>}
        </section>
      ))}

      {/* The three views. */}
      <Segmented ariaLabel="Section" className="in-views" items={VIEWS} value={view} onChange={setView} />

      {view === 'time' && (
        totalSessions === 0 ? (
          <section className="in-card in-empty">
            <Glyph id="clock" size={22} color="var(--muted)" />
            <p>Nothing logged {inRange}. Check tasks off as you finish them and they’ll show up here — with hours wherever you gave the task a duration — or log time by hand above.</p>
          </section>
        ) : (
          <>
            <section className="in-card">
              <div className="in-card-head">
                <h3 className="serif">By area</h3>
                <span className="in-card-meta">{hasHours ? `${fmtHours(agg.totalMins)} · ` : ''}{sessions(totalSessions)}</span>
              </div>
              <div className="in-rows">
                {agg.byCategory.slice(0, 12).map(c => (
                  <BarRow key={c.id} color={c.color} name={c.label}
                    icon={c.icon ? <Icon value={c.icon} size={14} color={c.color} /> : <span className="in-dot" style={{ background: c.color }} />}
                    meta={hasHours && c.mins > 0 ? sessions(c.count) : null}
                    value={c.mins > 0 ? fmtHours(c.mins) : sessions(c.count)}
                    frac={(hasHours ? c.mins : c.count) / maxCatV} />
                ))}
              </div>
            </section>

            <section className="in-card">
              <div className="in-card-head">
                <h3 className="serif">Topics &amp; projects</h3>
                <span className="in-card-meta">{agg.byTask.length} thing{agg.byTask.length === 1 ? '' : 's'}</span>
              </div>
              <div className="in-rank">
                {agg.byTask.slice(0, 12).map((t, i) => {
                  const c = categories.find(x => x.id === t.cat)
                  return (
                    <div key={t.title} className="in-rank-row">
                      <span className="in-rank-n">{i + 1}</span>
                      <span className="in-dot" style={{ background: c?.color || '#C9CFD6' }} />
                      <span className="in-rank-name">{t.title}</span>
                      <span className="in-rank-count">{sessions(t.count)}</span>
                      {t.mins > 0 && <span className="in-rank-val">{fmtHours(t.mins)}</span>}
                    </div>
                  )
                })}
              </div>
            </section>

            {rangeLogs.length > 0 && (
              <section className="in-card">
                <div className="in-card-head">
                  <h3 className="serif">Time you logged</h3>
                  <span className="in-card-meta">{fmtHours(rangeLogs.reduce((a, t) => a + (t.mins || 0), 0))}</span>
                </div>
                <div className="in-rank">
                  {rangeLogs.map(t => {
                    const c = categories.find(x => x.id === t.cat)
                    return (
                      <div key={t.id} className="in-rank-row">
                        <span className="in-dot" style={{ background: c?.color || '#C6A15B' }} />
                        <span className="in-rank-name">
                          {t.title}
                          <small>{shortDate(t.date)}{c ? ` · ${c.label}` : ''}</small>
                        </span>
                        <span className="in-rank-val">{fmtHours(t.mins)}</span>
                        <button type="button" className="in-del" onClick={() => deleteTimeLog && deleteTimeLog(t.id)} title="Remove" aria-label="Remove logged time">✕</button>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}
          </>
        )
      )}

      {view === 'skills' && (
        skills.length === 0 ? (
          <section className="in-card in-empty">
            <Glyph id="target" size={22} color="var(--muted)" />
            <p>No skills inferred {inRange}. Skills are read from the words in what you finish — titles, descriptions, subtasks. The more you write down, the more shows up here.</p>
          </section>
        ) : (
          <>
            {(skillMoves.rising.length > 0 || skillMoves.fading.length > 0) && (
              <section className="in-card in-momentum">
                <div className="in-card-head">
                  <h3 className="serif">Momentum</h3>
                  <span className="in-card-meta">{trendDays} days vs the {trendDays} before</span>
                </div>
                {skillMoves.rising.length > 0 && (
                  <div className="in-momentum-row">
                    <span className="in-momentum-k up">Picking up</span>
                    <span>{skillMoves.rising.map(s => <span key={s.id} className="in-momentum-item"><Icon value={s.icon} size={13} color={s.color} />{s.label} <b className="up">{delta(trend.get(s.id)).text}</b></span>)}</span>
                  </div>
                )}
                {skillMoves.fading.length > 0 && (
                  <div className="in-momentum-row">
                    <span className="in-momentum-k down">Dropped off</span>
                    <span>{skillMoves.fading.map(s => <span key={s.id} className="in-momentum-item"><Icon value={s.icon} size={13} color={s.color} />{s.label} <b>last {ago(s.lastDate)}</b></span>)}</span>
                  </div>
                )}
              </section>
            )}

            <section className="in-card">
              <div className="in-card-head">
                <h3 className="serif">Skills you’ve practiced</h3>
                <span className="in-card-meta">{skills.length} skill{skills.length === 1 ? '' : 's'}</span>
              </div>
              <div className="in-rows">
                {skills.slice(0, 14).map(s => {
                  const open = openSkill === s.id
                  return (
                    <div key={s.id}>
                      <BarRow color={s.color} name={s.label}
                        icon={<Icon value={s.icon} size={15} color={s.color} />}
                        meta={sessions(s.count)}
                        value={s.mins > 0 ? fmtHours(s.mins) : `${s.days} day${s.days === 1 ? '' : 's'}`}
                        frac={(hasHours ? s.mins : s.count) / maxSkillV}
                        onClick={() => setOpenSkill(open ? null : s.id)} open={open} />
                      {open && s.entries.length > 0 && <div className="in-row-detail"><EntryLog entries={s.entries} /></div>}
                    </div>
                  )
                })}
              </div>
              <div className="in-card-foot">
                {hasHours
                  ? <>{fmtHours(coverage.mins)} of {fmtHours(agg.totalMins)} reads as a skill; the rest had titles too vague to tell. </>
                  : <>{coverage.count} of {sessions(totalSessions)} read as a skill. </>}
                One task can count toward several skills, so the rows overlap. Tap one to see what fed it.
              </div>
            </section>
          </>
        )
      )}

      {view === 'body' && (
        <MindBody checkins={wlCheckins} effects={effectList} episodes={wlEpisodes} log={log}
          days={days} rangeLabel={rangeLabel} phrase={inRange} series={series} summary={mood} fxRows={fxRows} />
      )}
    </div>
  )
}
