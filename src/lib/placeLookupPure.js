// src/lib/placeLookupPure.js
// ─────────────────────────────────────────────────────────────
// The name a person would give a spot, picked from OpenStreetMap's answers.
// A check-in at 2438 18½ Ave NW is "Heritage Manor Apartments", not
// "18 1/2 Avenue Northwest"; one in a Mayo ramp is "Mayo Clinic parking", not
// "4th Street Southwest".
//
// Two sources (lib/placeNames.js asks them):
//   • Overpass `is_in` — the named areas the point is inside (a building, a
//     parking lot, an apartment complex, a hospital campus), plus named places
//     and parking lots right next to it.
//   • Nominatim reverse — one nearest object and its address, used when
//     Overpass can't be reached. Its address still carries the complex or
//     the business, which beat the road.
//
// Pure, so tests/placeLookup.test.mjs can check it without the network.
// ─────────────────────────────────────────────────────────────

// Areas that are a whole campus: a fine answer, but a building or a parking
// lot inside one is a better one.
const CAMPUS = (t) => ['hospital', 'university', 'college', 'school', 'clinic'].includes(t.amenity) || t.landuse === 'education' || t.healthcare === 'hospital'
const PARKING = (t) => t.amenity === 'parking' || t.building === 'parking' || t.parking != null && t.amenity == null && t.building == null
const RESIDENTIAL = (t) => t.landuse === 'residential' || t.place === 'neighbourhood' || ['apartments', 'residential', 'dormitory'].includes(t.building) && !!t.name
const ADMIN = (t) => t.boundary != null || t.admin_level != null || ['city', 'town', 'village', 'county', 'state', 'suburb', 'quarter', 'borough', 'hamlet'].includes(t.place)
const POI = (t) => !!t.name && (t.amenity || t.shop || t.office || t.leisure || t.tourism || t.healthcare || t.craft || t.club) && !CAMPUS(t) && !PARKING(t)

const R = 6371000
const toRad = (d) => (d * Math.PI) / 180
function meters(a, b) {
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

function parkingName(t, campus) {
  if (t.name) return t.name
  const owner = t.operator || t.owner || campus || ''
  return owner ? `${owner} parking` : 'Parking'
}

// elements: Overpass JSON `elements`. Areas (type 'area') are what the point
// is inside; everything else came from the "around" search and has `center`
// (or lat/lon for a node).
export function nameFromOverpass(elements, pt) {
  const inside = [], near = []
  for (const e of elements || []) {
    const t = e.tags || {}
    if (ADMIN(t)) continue
    if (e.type === 'area') inside.push(t)
    else {
      const c = e.center || (Number.isFinite(e.lat) ? { lat: e.lat, lon: e.lon } : null)
      if (!c) continue
      near.push({ t, d: meters(pt, { lat: c.lat, lng: c.lon }) })
    }
  }
  near.sort((a, b) => a.d - b.d)
  const campus = inside.find(t => CAMPUS(t) && t.name)?.name || ''

  // Inside something specific: a named building or business, then a parking
  // lot, then an apartment complex, then the campus itself.
  const building = inside.find(t => t.building && t.name && !RESIDENTIAL(t) && !PARKING(t))
  if (building) return building.name
  const poi = inside.find(POI)
  if (poi) return poi.name
  const lot = inside.find(PARKING) || near.find(n => PARKING(n.t) && n.d <= 30)?.t
  if (lot) return parkingName(lot, campus)
  const home = inside.find(RESIDENTIAL)
  if (home?.name) return home.name
  if (campus) return campus
  // Not inside anything named: a named place right there (the restaurant you
  // stopped at), then anything named a little further off.
  const close = near.find(n => (POI(n.t) || (n.t.building && n.t.name)) && n.d <= 40)
  if (close) return close.t.name
  return ''
}

// r: a Nominatim /reverse jsonv2 response (with addressdetails).
export function nameFromNominatim(r) {
  if (!r || r.error) return ''
  const a = r.address || {}
  const cat = r.category || r.class || ''
  const type = r.type || ''
  if (cat === 'amenity' && type === 'parking') {
    const owner = (r.extratags || {}).operator || a.residential || ''
    return r.name || (owner ? `${owner} parking` : a.road ? `Parking off ${shortRoad(a.road)}` : 'Parking')
  }
  // A named thing that isn't a road: a business, a building, a park.
  if (r.name && !['highway', 'place', 'boundary'].includes(cat)) return r.name
  for (const k of ['amenity', 'shop', 'office', 'leisure', 'tourism', 'healthcare', 'building', 'residential', 'hamlet', 'neighbourhood']) {
    if (a[k] && typeof a[k] === 'string' && !/^yes$/i.test(a[k])) return a[k]
  }
  if (a.house_number && a.road) return `${a.house_number} ${shortRoad(a.road)}`
  return a.road ? shortRoad(a.road) : ''
}

// "West Frontage Road Northwest" → "W Frontage Rd NW".
export function shortRoad(road) {
  const words = { North: 'N', South: 'S', East: 'E', West: 'W', Northwest: 'NW', Northeast: 'NE', Southwest: 'SW', Southeast: 'SE',
    Street: 'St', Avenue: 'Ave', Road: 'Rd', Drive: 'Dr', Boulevard: 'Blvd', Lane: 'Ln', Court: 'Ct', Place: 'Pl', Parkway: 'Pkwy', Highway: 'Hwy' }
  return String(road || '').split(' ').map(w => words[w] || w).join(' ')
}

// The Overpass query for one point: what it's inside, and named places and
// parking lots within a few dozen meters.
export function overpassQuery(lat, lng) {
  const p = `${lat.toFixed(6)},${lng.toFixed(6)}`
  return `[out:json][timeout:12];is_in(${p})->.a;area.a;out tags;(nwr(around:40,${p})[name][!highway];way(around:30,${p})[amenity=parking];);out tags center 25;`
}

// Is Nominatim's answer a real place (a business, a building, a campus, an
// apartment complex), or just a street / house number / nameless lot that
// Overpass might name better?
export function isStrongNominatim(r) {
  if (!r || r.error) return false
  const cat = r.category || r.class || '', type = r.type || ''
  if (cat === 'amenity' && type === 'parking') return !!(r.name || (r.extratags || {}).operator)
  if (r.name && !['highway', 'place', 'boundary'].includes(cat)) return true
  const a = r.address || {}
  return ['amenity', 'shop', 'office', 'leisure', 'tourism', 'healthcare', 'residential'].some(k => typeof a[k] === 'string' && a[k] && a[k] !== 'yes')
}
