// src/lib/notation.js
// ─────────────────────────────────────────────────────────────
// Scientific notation said the way a person would explain it out loud, for
// the phone's quick voice. A line-for-line twin of scripts/narrate/notation.py
// (Alba's narrator); tests/speakable_cases.json holds the cases both must agree
// on, and both test suites check them. Change one, change the other.
//
//     CO2          → carbon bonded to two oxygen atoms
//     Ca2+ / Ca²⁺  → calcium ion, with a positive charge of 2
//     C=O          → carbon double-bonded to oxygen
//     x² / x^2     → x squared
//     3 × 10^-5    → 3 times ten to the power of minus 5
//     5 µM         → 5 micromolar
//     2-chloropropan-1-ol → 2 chloro propan 1 ol
//
// Only what is spoken is rewritten; the screen always shows the original.
// ─────────────────────────────────────────────────────────────

const ELEMENTS = {
  H: 'hydrogen', He: 'helium', Li: 'lithium', Be: 'beryllium', B: 'boron',
  C: 'carbon', N: 'nitrogen', O: 'oxygen', F: 'fluorine', Ne: 'neon',
  Na: 'sodium', Mg: 'magnesium', Al: 'aluminium', Si: 'silicon', P: 'phosphorus',
  S: 'sulfur', Cl: 'chlorine', Ar: 'argon', K: 'potassium', Ca: 'calcium',
  Sc: 'scandium', Ti: 'titanium', V: 'vanadium', Cr: 'chromium', Mn: 'manganese',
  Fe: 'iron', Co: 'cobalt', Ni: 'nickel', Cu: 'copper', Zn: 'zinc',
  Ga: 'gallium', Ge: 'germanium', As: 'arsenic', Se: 'selenium', Br: 'bromine',
  Kr: 'krypton', Rb: 'rubidium', Sr: 'strontium', Y: 'yttrium', Zr: 'zirconium',
  Mo: 'molybdenum', Ag: 'silver', Cd: 'cadmium', Sn: 'tin', Sb: 'antimony',
  I: 'iodine', Xe: 'xenon', Cs: 'caesium', Ba: 'barium', La: 'lanthanum',
  Gd: 'gadolinium', W: 'tungsten', Pt: 'platinum', Au: 'gold', Hg: 'mercury',
  Pb: 'lead', Bi: 'bismuth', Rn: 'radon', U: 'uranium',
}
const ANION = { Cl: 'chloride', F: 'fluoride', Br: 'bromide', I: 'iodide', O: 'oxide', S: 'sulfide', N: 'nitride', H: 'hydride' }
const POLYATOMIC = {
  NH4: 'ammonium', H3O: 'hydronium', OH: 'hydroxide', NO3: 'nitrate',
  NO2: 'nitrite', SO4: 'sulfate', SO3: 'sulfite', PO4: 'phosphate',
  HPO4: 'hydrogen phosphate', H2PO4: 'dihydrogen phosphate', CO3: 'carbonate',
  HCO3: 'bicarbonate', CN: 'cyanide', MnO4: 'permanganate', ClO: 'hypochlorite',
  CH3COO: 'acetate',
}
const DIATOMIC = new Set(['H2', 'N2', 'O2', 'O3', 'F2', 'Cl2', 'Br2', 'I2', 'P4', 'S8'])
const NOT_FORMULAS = new Set(['HeLa', 'BiP', 'NaV', 'CaV', 'InS'])
const NOT_FORMULA_RE = /^(Th\d+|H\d+N\d+|B\d+|C\d+[a-z]?)$/
const UPPER_OK = new Set('CHONSPFI'.split(''))
const UPPER_COMMON = new Set(['CO', 'CO2', 'SO2', 'SO3', 'NO2', 'N2O', 'O2', 'O3', 'N2', 'H2', 'F2', 'I2', 'P4', 'S8'])

const SYM = '(?:' + Object.keys(ELEMENTS).sort((a, b) => b.length - a.length).join('|') + ')'
const TOKEN_RE = new RegExp('(' + SYM + ')(\\d*)', 'y')
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
const num = n => (n < WORDS.length ? WORDS[n] : String(n))

function parse(tok) {
  const out = []
  let pos = 0
  while (pos < tok.length) {
    TOKEN_RE.lastIndex = pos
    const m = TOKEN_RE.exec(tok)
    if (!m) return null
    out.push([m[1], parseInt(m[2] || '1', 10)])
    pos = TOKEN_RE.lastIndex
  }
  return out
}

function looksLikeFormula(tok) {
  if (NOT_FORMULAS.has(tok) || NOT_FORMULA_RE.test(tok)) return false
  const parts = parse(tok)
  if (!parts) return false
  if (parts.length === 1) return DIATOMIC.has(tok)
  if (/[a-z]/.test(tok)) return true
  if (UPPER_COMMON.has(tok)) return true
  const elems = new Set(parts.map(p => p[0]))
  return /\d/.test(tok) && [...elems].every(e => UPPER_OK.has(e)) && elems.has('H')
}

const atoms = (n, el) => `${num(n)} ${ELEMENTS[el]} atom${n === 1 ? '' : 's'}`

function describe(tok) {
  const parts = parse(tok)
  if (parts.length === 1) {
    const [el, n] = parts[0]
    return `${num(n)} ${ELEMENTS[el]} atoms bonded together`
  }
  const total = new Map()
  for (const [el, n] of parts) total.set(el, (total.get(el) || 0) + n)
  const repeated = total.size < parts.length
  if (total.size === 2 && !repeated) {
    let [[a, na], [b, nb]] = parts
    if (nb === 1 && na !== 1 && b !== 'H') [a, na, b, nb] = [b, nb, a, na]
    if (na === 1) return `${ELEMENTS[a]} bonded to ${nb > 1 ? atoms(nb, b) : ELEMENTS[b]}`
  }
  const items = [...total].map(([el, n]) => atoms(n, el))
  return 'a molecule of ' + items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1]
}

function ion(tok, charge, sign) {
  const n = parseInt(charge || '1', 10)
  const kind = sign === '+' ? 'positive' : 'negative'
  let name
  if (tok in POLYATOMIC) name = POLYATOMIC[tok]
  else if (tok in ELEMENTS) name = sign === '-' ? (ANION[tok] || ELEMENTS[tok]) : ELEMENTS[tok]
  else return null
  return ` ${name} ion, with a ${kind} charge of ${n}, `
}

const SUP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁺': '+', '⁻': '-' }
const SUB = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' }

function normalize(s) {
  s = s.replace(/[₀-₉]/g, c => SUB[c]).replace(/−/g, '-')
  return s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+/g, m => '^' + [...m].map(c => SUP[c]).join(''))
}

const UNITS = {
  M: 'molar', mM: 'millimolar', 'µM': 'micromolar', 'μM': 'micromolar', uM: 'micromolar',
  nM: 'nanomolar', pM: 'picomolar', mg: 'milligrams', 'µg': 'micrograms',
  'μg': 'micrograms', ng: 'nanograms', kg: 'kilograms', g: 'grams',
  mL: 'millilitres', ml: 'millilitres', 'µL': 'microlitres', 'μL': 'microlitres',
  uL: 'microlitres', L: 'litres', kDa: 'kilodaltons', Da: 'daltons',
  bp: 'base pairs', kb: 'kilobases', nm: 'nanometres', 'µm': 'micrometres',
  'μm': 'micrometres', mm: 'millimetres', cm: 'centimetres', min: 'minutes',
}
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const UNIT = '(?:' + Object.keys(UNITS).sort((a, b) => b.length - a.length).map(esc).join('|') + ')'
const UNITS_RE = new RegExp('(\\d)\\s{0,2}(' + UNIT + ')(?:/(' + UNIT + '))?(?![\\w/])', 'g')

function units(s) {
  return s.replace(UNITS_RE, (m, d, u, per) => d + ' ' + UNITS[u] + (per ? ' per ' + UNITS[per].replace(/s$/, '') : '') + ' ')
}

function power(exp) {
  exp = exp.replace(/^[{(]+|[})]+$/g, '')
  if (exp === '2') return ' squared '
  if (exp === '3') return ' cubed '
  return ' to the power of ' + (exp.startsWith('-') ? 'minus ' + exp.slice(1) : exp) + ' '
}

const BOND = { '-': 'single-bonded to', '–': 'single-bonded to', '—': 'single-bonded to', '=': 'double-bonded to', '≡': 'triple-bonded to' }
const BONDS_RE = new RegExp('(?<![\\w-])' + SYM + '(?:[-–—=≡]' + SYM + ')+(?![\\w=≡–—-])', 'g')

function bonds(s) {
  return s.replace(BONDS_RE, (m) => {
    const chain = m.split(/([-–—=≡])/)
    const at = chain.filter((_, i) => i % 2 === 0)
    if (!at.some(a => ['C', 'H', 'O', 'N'].includes(a))) return m
    const words = [ELEMENTS[at[0]]]
    chain.filter((_, i) => i % 2 === 1).forEach((b, i) => words.push((i === 0 ? '' : ', ') + BOND[b] + ' ' + ELEMENTS[at[i + 1]]))
    return ' ' + words.join(' ').replace(/ , /g, ', ') + ' '
  })
}

const ION_RE = new RegExp('(?<![\\w^])((?:' + SYM + '\\d*)+?)(?:\\^(\\d*)|\\s?(\\d)?)([+-])(?=[\\s.,;:)\\]/-]|$)', 'g')

export function chemistry(s) {
  s = normalize(s)
  s = s.replace(/(\d)\s*[×x·]\s*10\s*\^\s*\(?(-?\d+)\)?/g, (m, d, e) => d + ' times ten' + power(e))
  s = s.replace(/\b(\d+(?:\.\d+)?)[eE](-?\d+)\b/g, (m, d, e) => d + ' times ten' + power(e))
  s = s.replace(ION_RE, (m, tok0, supCharge, plainCharge, sign) => {
    let tok = tok0
    let charge = supCharge !== undefined ? supCharge : plainCharge
    if (supCharge === undefined) {
      const parts = parse(tok) || []
      if (parts.length === 1 && parts[0][1] > 1 && !(tok in POLYATOMIC)) { tok = parts[0][0]; charge = String(parts[0][1]) }
    }
    if (['O', 'B', 'A', 'AB'].includes(tok) && !charge) return m
    return ion(tok, charge, sign) || m
  })
  s = bonds(s)
  s = s.replace(/(?<![\w-])([A-Z][A-Za-z0-9]*)(?![\w-])/g, (m, tok) => (looksLikeFormula(tok) ? ' ' + describe(tok) + ' ' : m))
  s = units(s)
  s = s.replace(/\^\s*(\{[^}]*\}|\([^)]*\)|-?[\w.]+)/g, (m, e) => power(e))
  return s
}

const PREFIX = '(?:chloro|bromo|fluoro|iodo|nitro|amino|hydroxy|methoxy|ethoxy|oxo|cyano|methyl|ethyl|propyl|butyl|phenyl)'
const PARENT = '(?:meth|eth|prop|but|pent|hex|hept|oct|non|dec|benz|phen|cyclo)'
const PREFIX_RE = new RegExp('\\b(di|tri|tetra)?(' + PREFIX + ')(?=' + PARENT + ')', 'g')

export function iupac(s) {
  s = s.replace(/\(([RSEZ])\)-/g, ' $1 ')
  s = s.replace(/(?<=[a-z])-(\d+(?:,\d+)*)-(?=[a-z])/g, (m, d) => ' ' + d.replace(/,/g, ' ') + ' ')
  s = s.replace(/\b(\d+(?:,\d+)*)-(?=[a-z])/g, (m, d) => d.replace(/,/g, ' ') + ' ')
  s = s.replace(/\b([A-Z](?:,[A-Z])+)-(?=[a-z])/g, (m, d) => d.replace(/,/g, ' ') + ' ')
  s = s.replace(PREFIX_RE, (m, multi, pre) => (multi ? multi + ' ' : '') + pre + ' ')
  return s
}

const MATH = [['√', ' square root of '], ['∑', ' the sum of '], ['∝', ' proportional to '],
  ['≠', ' not equal to '], ['∞', ' infinity '], ['⇌', ' in equilibrium with '],
  ['⟶', ' leading to '], ['½', ' one half '], ['¼', ' one quarter '], ['¾', ' three quarters ']]

export function mathSymbols(s) {
  for (const [k, v] of MATH) s = s.split(k).join(v)
  return s
}
