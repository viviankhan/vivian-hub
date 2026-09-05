// Which failures are allowed to sign someone out?
//
// This exists because a first cut treated Supabase's "auth session missing"
// (an HTTP 400) as the server rejecting the sign-in, and signed the user out
// on a state that was recoverable. Getting this wrong is invisible in
// development and infuriating on a phone, so the rules are pinned here.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const REPO = fileURLToPath(new URL('..', import.meta.url))

// isSessionRejected is deliberately not exported — it's an internal decision,
// not API. Lift it out of the source so the test checks the shipped code
// rather than a copy that could drift from it.
const src = readFileSync(REPO + 'src/lib/auth.js', 'utf8')
const start = src.indexOf('function isSessionRejected')
const end = src.indexOf('\n}', start) + 2
if (start < 0) { console.error('could not find isSessionRejected in src/lib/auth.js'); process.exit(1) }
const isSessionRejected = new Function(
  'isNetworkError',
  src.slice(start, end) + '\nreturn isSessionRejected',
)(e => {
  const m = String((e && e.message) || e || '')
  return (e && (e.name === 'TypeError' || e.status === 0)) || /failed to fetch|network/i.test(m)
})

let pass = 0, fail = 0
const eq = (name, got, want) => {
  if (got === want) { pass++; console.log('  ok  ', name) }
  else { fail++; console.log('  FAIL', name, `\n        got ${got}, want ${want}`) }
}
const err = (message, extra = {}) => Object.assign(new Error(message), extra)

console.log('\n— must NOT sign the user out —')
// The regression. Supabase throws this from refreshSession() whenever there is
// nothing to refresh; it is a 400, but it means "this device has no tokens",
// not "the server refused you".
eq('auth session missing (the bug)',
   isSessionRejected(err('Auth session missing!', { name: 'AuthSessionMissingError', status: 400 })), false)
eq('a bare 400 with no explanation', isSessionRejected(err('Bad Request', { status: 400 })), false)
eq('a dropped connection', isSessionRejected(err('TypeError: Failed to fetch', { name: 'TypeError' })), false)
eq('a request that timed out', isSessionRejected(err('network timeout', { status: 0 })), false)
eq('the server having a bad day', isSessionRejected(err('Internal Server Error', { status: 500 })), false)
eq('rate limiting', isSessionRejected(err('Too Many Requests', { status: 429 })), false)
eq('nothing at all', isSessionRejected(null), false)

console.log('\n— must sign the user out —')
// Only a token the server actively refuses ends a sign-in.
eq('invalid refresh token',
   isSessionRejected(err('Invalid Refresh Token: Refresh Token Not Found', { status: 400 })), true)
eq('a refresh token already spent',
   isSessionRejected(err('Invalid Refresh Token: Already Used', { status: 400 })), true)
eq('the account is gone', isSessionRejected(err('User from sub claim in JWT does not exist', { status: 403 })), true)
eq('an expired JWT', isSessionRejected(err('JWT expired', { status: 401 })), true)
eq('a flat 401', isSessionRejected(err('Unauthorized', { status: 401 })), true)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
