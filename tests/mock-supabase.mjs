// A small in-memory stand-in for the Supabase client: enough of the query
// builder for everything storage.js calls, plus a switch to simulate the
// network being gone.
export const state = { tables: {}, files: {}, offline: false, calls: [] }

export function reset() { state.tables = {}; state.files = {}; state.offline = false; state.calls = [] }
const table = t => (state.tables[t] ||= [])
const netErr = () => Object.assign(new Error('TypeError: Failed to fetch'), { name: 'TypeError' })
const match = (row, filters) => filters.every(f => {
  if (f.op === 'eq') return row[f.col] === f.val
  if (f.op === 'is') return (row[f.col] ?? null) === f.val
  if (f.op === 'in') return f.val.includes(row[f.col])
  if (f.op === 'not-is-null') return (row[f.col] ?? null) !== null
  return true
})

class Query {
  constructor(name) { this.name = name; this.filters = []; this.action = null; this.payload = null; this.sort = null; this._limit = null; this.opts = null }
  select() { if (!this.action) this.action = 'select'; this._selected = true; return this }
  insert(v) { this.action = 'insert'; this.payload = v; return this }
  upsert(v, o) { this.action = 'upsert'; this.payload = v; this.opts = o; return this }
  update(v) { this.action = 'update'; this.payload = v; return this }
  delete() { this.action = 'delete'; return this }
  eq(c, v) { this.filters.push({ op: 'eq', col: c, val: v }); return this }
  is(c, v) { this.filters.push({ op: 'is', col: c, val: v }); return this }
  in(c, v) { this.filters.push({ op: 'in', col: c, val: v }); return this }
  not(c, _op, v) { this.filters.push({ op: 'not-is-null', col: c, val: v }); return this }
  order(c, o) { this.sort = { col: c, asc: !o || o.ascending !== false }; return this }
  limit(n) { this._limit = n; return this }
  maybeSingle() { this.single_ = 'maybe'; return this }
  single() { this.single_ = 'one'; return this }
  then(res, rej) { return this.run().then(res, rej) }

  async run() {
    state.calls.push(`${this.name}.${this.action}`)
    if (state.offline) return { data: null, error: netErr() }
    const rows = table(this.name)
    try {
      if (this.action === 'insert') {
        const list = Array.isArray(this.payload) ? this.payload : [this.payload]
        for (const r of list) {
          if (r.id != null && rows.some(x => x.id === r.id)) {
            return { data: null, error: Object.assign(new Error('duplicate key value'), { code: '23505' }) }
          }
          rows.push({ ...r })
        }
        return this.shape(list.map(r => rows.find(x => x.id === r.id) || r))
      }
      if (this.action === 'upsert') {
        const list = Array.isArray(this.payload) ? this.payload : [this.payload]
        // Conflict target: the declared onConflict columns, else `id`, else the
        // single-column primary keys these tables actually use.
        const keys = this.opts?.onConflict ? this.opts.onConflict.split(',')
          : (this.name === 'task_completions' ? ['storage_key'] : ['id'])
        const out = []
        for (const r of list) {
          const i = rows.findIndex(x => keys.every(k => x[k] === r[k]))
          if (i >= 0) rows[i] = { ...rows[i], ...r }; else rows.push({ ...r })
          out.push(rows[i >= 0 ? i : rows.length - 1])
        }
        return this.shape(out)
      }
      if (this.action === 'update') {
        const hits = rows.filter(r => match(r, this.filters))
        if (!hits.length) return { data: null, error: Object.assign(new Error('JSON object requested, multiple (or no) rows returned'), { code: 'PGRST116' }) }
        hits.forEach(r => Object.assign(r, this.payload))
        return this.shape(hits)
      }
      if (this.action === 'delete') {
        const keep = rows.filter(r => !match(r, this.filters))
        state.tables[this.name] = keep
        return { data: null, error: null }
      }
      let out = rows.filter(r => match(r, this.filters))
      if (this.sort) out = [...out].sort((a, b) => (this.sort.asc ? 1 : -1) * String(a[this.sort.col] ?? '').localeCompare(String(b[this.sort.col] ?? '')))
      if (this._limit != null) out = out.slice(0, this._limit)
      return this.shape(out)
    } catch (e) { return { data: null, error: e } }
  }
  shape(out) {
    if (this.single_ === 'one') {
      if (out.length !== 1) return { data: null, error: Object.assign(new Error('JSON object requested, multiple (or no) rows returned'), { code: 'PGRST116' }) }
      return { data: out[0], error: null }
    }
    if (this.single_ === 'maybe') return { data: out[0] ?? null, error: null }
    return { data: out, error: null }
  }
}

export function createClient() {
  return {
    from: name => new Query(name),
    storage: {
      from: bucket => ({
        upload: async (path, file) => {
          if (state.offline) return { error: netErr() }
          state.files[bucket + '/' + path] = file
          return { error: null }
        },
        getPublicUrl: path => ({ data: { publicUrl: 'https://cdn.test/' + path } }),
        remove: async paths => { paths.forEach(p => delete state.files[bucket + '/' + p]); return { error: null } },
      }),
    },
    auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => {} },
  }
}
