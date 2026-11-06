// Naming a spot from OpenStreetMap (src/lib/placeLookupPure.js). The Nominatim
// cases are the real answers for Vivian's check-ins on Nov 6, 2026; the
// Overpass ones are shaped like real is_in / around answers.
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const P = await import(resolve(REPO, 'src/lib/placeLookupPure.js'))

let pass = 0, fail = 0
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; console.log('  ok  ', name) }
  else { fail++; console.log('  FAIL', name, '\n        got ', g, '\n        want', w) }
}

console.log('\n— Nominatim (the fallback) —')
eq('home: the complex, not the road', P.nameFromNominatim({ category: 'building', type: 'apartments', name: '',
  address: { house_number: '2438', road: '18 1/2 Avenue Northwest', residential: 'Heritage Manor Apartments', city: 'Rochester' } }), 'Heritage Manor Apartments')
eq('a restaurant by name', P.nameFromNominatim({ category: 'amenity', type: 'fast_food', name: 'Five Guys',
  address: { amenity: 'Five Guys', house_number: '2800', road: '41st Street Northwest' } }), 'Five Guys')
eq('an unnamed lot: parking off its road', P.nameFromNominatim({ category: 'amenity', type: 'parking', name: '',
  address: { road: 'West Frontage Road Northwest', city: 'Rochester' } }), 'Parking off W Frontage Rd NW')
eq('a lot with an operator', P.nameFromNominatim({ category: 'amenity', type: 'parking', name: '', extratags: { operator: 'Mayo Clinic' },
  address: { road: '4th Street Southwest' } }), 'Mayo Clinic parking')
eq('a plain house: its short address', P.nameFromNominatim({ category: 'place', type: 'house', name: '',
  address: { house_number: '296', road: '3rd Street Southwest', city: 'Rochester' } }), '296 3rd St SW')
eq('a road alone', P.nameFromNominatim({ category: 'highway', type: 'tertiary', name: 'West Frontage Road Northwest',
  address: { road: 'West Frontage Road Northwest' } }), 'W Frontage Rd NW')
eq('nothing', P.nameFromNominatim({ error: 'Unable to geocode' }), '')

console.log('\n— Overpass (inside what?) —')
const pt = { lat: 44.0204, lng: -92.4671 }
const area = (tags) => ({ type: 'area', id: 1, tags })
const way = (tags, lat = 44.0204, lon = -92.4671) => ({ type: 'way', id: 2, center: { lat, lon }, tags })
const city = area({ name: 'Rochester', boundary: 'administrative', admin_level: '8' })
const mayo = area({ name: 'Mayo Clinic', amenity: 'hospital' })
eq('a named building on campus beats the campus', P.nameFromOverpass([city, mayo, area({ building: 'hospital', name: 'Guggenheim Building' })], pt), 'Guggenheim Building')
eq('a Mayo parking ramp', P.nameFromOverpass([city, mayo, area({ amenity: 'parking', parking: 'multi-storey', operator: 'Mayo Clinic' })], pt), 'Mayo Clinic parking')
eq('an unnamed lot on campus takes the campus name', P.nameFromOverpass([city, mayo, area({ amenity: 'parking' })], pt), 'Mayo Clinic parking')
eq('a named ramp keeps its name', P.nameFromOverpass([mayo, area({ amenity: 'parking', name: 'Damon Parking Ramp' })], pt), 'Damon Parking Ramp')
eq('an apartment complex', P.nameFromOverpass([city, area({ landuse: 'residential', name: 'Heritage Manor' })], pt), 'Heritage Manor')
eq('just the campus', P.nameFromOverpass([city, mayo], pt), 'Mayo Clinic')
eq('a lot next to you (not an area)', P.nameFromOverpass([city, way({ amenity: 'parking', operator: 'Mayo Clinic' }, 44.02045, -92.46712)], pt), 'Mayo Clinic parking')
eq('a restaurant next to you', P.nameFromOverpass([city, way({ amenity: 'restaurant', name: 'Five Guys' }, 44.0205, -92.4671)], pt), 'Five Guys')
eq('a restaurant down the street is not where you are', P.nameFromOverpass([city, way({ amenity: 'restaurant', name: 'Far Away Cafe' }, 44.0230, -92.4671)], pt), '')
eq('only the city: no name', P.nameFromOverpass([city], pt), '')

console.log('\n— is Nominatim enough? —')
eq('the college campus: yes', P.isStrongNominatim({ category: 'amenity', type: 'college', name: 'Mayo Clinic College of Medicine and Science', address: { road: '2nd Avenue Southwest' } }), true)
eq('Mayo College name from the 10:47 check-in', P.nameFromNominatim({ category: 'amenity', type: 'college', name: 'Mayo College', address: { amenity: 'Mayo College', road: '3rd Street Southwest' } }), 'Mayo College')
eq('the apartment complex: yes', P.isStrongNominatim({ category: 'building', type: 'apartments', name: '', address: { residential: 'Heritage Manor Apartments' } }), true)
eq('a bare house number: ask Overpass', P.isStrongNominatim({ category: 'place', type: 'house', name: '', address: { house_number: '296', road: '3rd Street Southwest' } }), false)
eq('a nameless lot: ask Overpass', P.isStrongNominatim({ category: 'amenity', type: 'parking', name: '', address: { road: 'W Frontage Rd' } }), false)
eq('a road: ask Overpass', P.isStrongNominatim({ category: 'highway', type: 'tertiary', name: 'West Frontage Road Northwest' }), false)

console.log('\n— roads —')
eq('short road', P.shortRoad('18 1/2 Avenue Northwest'), '18 1/2 Ave NW')
eq('query asks for areas and neighbours', /is_in\(44\.020400,-92\.467100\)/.test(P.overpassQuery(44.0204, -92.4671)), true)

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
