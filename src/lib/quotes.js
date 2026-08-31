// src/lib/quotes.js
// ─────────────────────────────────────────────────────────────
// A small anthology the guide can draw from instead of speaking in its own
// voice — real lines from philosophers and contemplatives, chosen to promote
// resilience, the sense of being understood, and encouragement without
// pressure. Toggleable in Settings. Each quote is tagged so it can be matched
// to how the day is going (a heavy hour leans on comfort and resilience; a good
// one leans on savouring and presence).
//
// Tags: struggle · understood · resilience · hope · gentle · presence · savour
// ─────────────────────────────────────────────────────────────
export const QUOTES = [
  { t: 'You have power over your mind — not outside events. Realize this, and you will find strength.', a: 'Marcus Aurelius', tags: ['resilience'] },
  { t: 'Very little is needed to make a happy life; it is all within yourself, in your way of thinking.', a: 'Marcus Aurelius', tags: ['gentle', 'savour'] },
  { t: 'We suffer more often in imagination than in reality.', a: 'Seneca', tags: ['struggle', 'understood'] },
  { t: 'It is not that we have a short time to live, but that we waste a lot of it.', a: 'Seneca', tags: ['gentle', 'presence'] },
  { t: "It's not what happens to you, but how you react to it that matters.", a: 'Epictetus', tags: ['resilience'] },
  { t: 'When we are no longer able to change a situation, we are challenged to change ourselves.', a: 'Viktor Frankl', tags: ['resilience', 'acceptance'] },
  { t: "Everything can be taken from a person but one thing: the freedom to choose one's attitude in any given circumstance.", a: 'Viktor Frankl', tags: ['resilience', 'understood'] },
  { t: 'In the midst of winter, I found there was, within me, an invincible summer.', a: 'Albert Camus', tags: ['resilience', 'hope'] },
  { t: 'Life is not a problem to be solved, but a reality to be experienced.', a: 'Søren Kierkegaard', tags: ['presence', 'acceptance'] },
  { t: 'Anxiety is the dizziness of freedom.', a: 'Søren Kierkegaard', tags: ['struggle', 'understood'] },
  { t: 'Nature does not hurry, yet everything is accomplished.', a: 'Lao Tzu', tags: ['gentle', 'presence'] },
  { t: 'When I let go of what I am, I become what I might be.', a: 'Lao Tzu', tags: ['acceptance', 'hope'] },
  { t: 'The journey of a thousand miles begins with a single step.', a: 'Lao Tzu', tags: ['hope', 'gentle'] },
  { t: 'The wound is the place where the Light enters you.', a: 'Rumi', tags: ['struggle', 'understood', 'hope'] },
  { t: 'Yesterday I was clever, so I wanted to change the world. Today I am wise, so I am changing myself.', a: 'Rumi', tags: ['gentle', 'acceptance'] },
  { t: 'Feelings come and go like clouds in a windy sky. Conscious breathing is my anchor.', a: 'Thich Nhat Hanh', tags: ['presence', 'gentle'] },
  { t: 'No mud, no lotus.', a: 'Thich Nhat Hanh', tags: ['struggle', 'hope'] },
  { t: 'You are the sky. Everything else — it is just the weather.', a: 'Pema Chödrön', tags: ['resilience', 'presence'] },
  { t: 'I am not what happened to me. I am what I choose to become.', a: 'Carl Jung', tags: ['resilience'] },
  { t: 'The privilege of a lifetime is to become who you truly are.', a: 'Carl Jung', tags: ['gentle', 'hope'] },
  { t: 'It does not matter how slowly you go, so long as you do not stop.', a: 'Confucius', tags: ['gentle', 'hope'] },
  { t: 'Our greatest glory is not in never falling, but in rising every time we fall.', a: 'Confucius', tags: ['resilience'] },
  { t: 'You are under no obligation to be the same person you were five minutes ago.', a: 'Alan Watts', tags: ['gentle', 'acceptance'] },
  { t: 'Muddy water is best cleared by leaving it alone.', a: 'Alan Watts', tags: ['gentle', 'presence'] },
  { t: 'What lies behind us and what lies before us are tiny matters compared to what lies within us.', a: 'Ralph Waldo Emerson', tags: ['resilience'] },
  { t: 'Not until we are lost do we begin to understand ourselves.', a: 'Henry David Thoreau', tags: ['struggle', 'understood'] },
  { t: 'Attention is the rarest and purest form of generosity.', a: 'Simone Weil', tags: ['presence', 'understood'] },
  { t: 'The greatest weapon against stress is our ability to choose one thought over another.', a: 'William James', tags: ['struggle', 'resilience'] },
  { t: 'Knowing yourself is the beginning of all wisdom.', a: 'Aristotle', tags: ['gentle', 'presence'] },
  { t: 'He who has a why to live can bear almost any how.', a: 'Friedrich Nietzsche', tags: ['resilience', 'hope'] },
]

// Choose a quote to fit the moment. `mood` is 1–5 (or null); `struggling` marks a
// hard-feeling condition active; `easeful` marks a good one. `n` rotates the pick
// so the guide doesn't repeat itself on consecutive taps.
export function pickQuote({ mood = null, struggling = false, easeful = false, n = 0 } = {}) {
  let prefer
  if (struggling || (mood != null && mood <= 2)) prefer = ['struggle', 'understood', 'resilience', 'hope']
  else if (easeful || (mood != null && mood >= 4)) prefer = ['savour', 'gentle', 'presence', 'hope']
  else prefer = ['gentle', 'presence', 'resilience', 'acceptance']
  const pool = QUOTES.filter(q => q.tags.some(t => prefer.includes(t)))
  const list = pool.length ? pool : QUOTES
  return list[((n % list.length) + list.length) % list.length]
}
