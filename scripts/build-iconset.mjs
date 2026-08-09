// scripts/build-iconset.mjs
// Author-time extractor: pulls a curated, filled subset of Material Design
// Icons (@iconify-json/mdi) into src/lib/iconset.js — the app's task icon set.
// Each SPEC item is [id, 'candidate mdi names…', 'search keywords']; the first
// candidate that exists in MDI wins. Run: node scripts/build-iconset.mjs
//
// An item can also supply a hand-drawn body instead of an MDI name, for shapes
// MDI doesn't have (e.g. RNA, a lab coat): pass { body: '<path …/>' } in place
// of the candidate string. Draw it on the 24×24 grid; fill/stroke with
// "currentColor" so it inherits the icon color like the MDI bodies do.
import fs from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const mdi = require('@iconify-json/mdi/icons.json')

// [groupName, [ [id, candidates, keywords], … ] ]
const SPEC = [
  ['Daily & Routine', [
    ['sun','white-balance-sunny weather-sunny','sun morning day sunny wake bright'],
    ['sunrise','weather-sunset-up weather-sunset','sunrise morning dawn wake early am rise'],
    ['moon','weather-night moon-waning-crescent','moon night sleep evening pm bedtime'],
    ['sunset','weather-sunset-down','sunset evening dusk night pm winddown'],
    ['alarm','alarm','alarm clock wake snooze'],
    ['bed','bed sleep','bed sleep nap rest bedtime relax'],
    ['coffee','coffee','coffee tea morning cup caffeine espresso latte breakfast brew'],
    ['mug','coffee-outline cup','mug tea cup hot cocoa drink'],
    ['droplet','water','water hydrate drink hydration rain drop shower'],
    ['shower','shower shower-head','shower wash bathe morning'],
    ['bath','bathtub bathtub-outline','bath bathtub soak relax wash'],
    ['toothbrush','toothbrush-paste toothbrush','toothbrush brush teeth dental morning night'],
    ['tooth','tooth tooth-outline','tooth teeth dentist dental floss checkup'],
    ['soap','hand-wash shower','soap wash hands hygiene clean sanitize'],
    ['broom','broom','clean cleaning tidy chore chores sweep laundry vacuum dishes'],
    ['sparkle','shimmer auto-fix star-four-points','clean fresh shine sparkle tidy magic'],
    ['capsule','pill','pill medicine meds vitamin supplement dose'],
    ['bell','bell bell-ring','reminder alert notify notification bell ring'],
  ]],
  ['Work & Study', [
    ['briefcase','briefcase','work job office career business interview client boss'],
    ['laptop','laptop','laptop computer work code dev email zoom'],
    ['monitor','monitor desktop-classic','desktop screen monitor pc setup display'],
    ['code','code-tags xml','code coding program dev develop software engineer'],
    ['book','book-variant book','read reading study book textbook novel library learn'],
    ['bookOpen','book-open-variant book-open-page-variant','read reading study review revise notes open'],
    ['pencil','pencil lead-pencil','write writing edit note homework essay draft sign journal'],
    ['clipboard','clipboard-text clipboard-list','tasks list checklist notes todo plan agenda'],
    ['calendar','calendar calendar-month','date plan schedule meeting event appointment booking deadline day'],
    ['calendarCheck','calendar-check','calendar check done appointment confirmed booked'],
    ['clock','clock-outline clock','time schedule timer deadline duration wait later hour'],
    ['timer','timer timer-outline','timer countdown cook focus pomodoro'],
    ['hourglass','timer-sand','hourglass time wait sand deadline'],
    ['gradcap','school','school class degree graduation lecture college university course exam student study'],
    ['flask','flask flask-outline','lab science chemistry experiment research biology'],
    ['chart','chart-bar chart-line','data report analytics stats metrics dashboard finance review numbers chart'],
    ['chartPie','chart-pie','pie chart breakdown analytics data'],
    ['presentation','presentation chart-box','presentation slides pitch meeting deck talk board'],
    ['idcard','card-account-details badge-account-horizontal','id card badge identity work employee pass'],
    ['folder','folder','folder files documents organize storage'],
    ['file','file file-outline','file document paper page report'],
    ['document','file-document file-document-outline','document report paper notes text file'],
    ['paperclip','paperclip','paperclip attach file clip'],
    ['pushpin','pin','pin note board remind important'],
    ['newspaper','newspaper newspaper-variant','news read article press media'],
    ['settings','cog cog-outline','settings gear preferences options configure setup'],
  ]],
  ['Science & Lab', [
    ['dna','dna','dna genetics gene helix biology double strand chromosome'],
    ['rna',{ body:'<path fill="currentColor" fill-rule="evenodd" d="M9.7 2.6c.5.4.6 1 .2 1.5-1.2 1.5-.6 2.6.9 3.9 1.7 1.5 2.6 3.2 1 5.4-1.1 1.5-.7 2.4.7 3.7.5.45.5 1.15.05 1.6-.45.44-1.15.4-1.6-.05-2-1.8-2.8-3.7-1-6 1.1-1.4.6-2.3-.8-3.5-1.8-1.6-3-3.6-1-6.2.4-.5 1.1-.6 1.55-.25Z"/><circle cx="14.4" cy="5" r="1.05" fill="currentColor"/><circle cx="9.4" cy="9.2" r="1.05" fill="currentColor"/><circle cx="14.4" cy="13.6" r="1.05" fill="currentColor"/><circle cx="9.4" cy="18" r="1.05" fill="currentColor"/>' },'rna genetics gene strand biology transcription nucleotide'],
    ['microscope','microscope','microscope lab science biology magnify slide research microbiology'],
    ['testtube','test-tube','test tube sample lab experiment chemistry science tube vial'],
    ['flaskRound','flask-round-bottom flask','flask round bottom lab chemistry experiment science reaction'],
    ['beaker','beaker beaker-outline','beaker lab chemistry measure science liquid solution'],
    ['pipette',{ body:'<path fill="currentColor" d="M12 2c-1.93 0-3.3 1.5-3.3 3.25 0 1.16.55 2.05 1.2 2.77l.55 9.05c.03.53.14 1.04.35 1.53l1.2 2.85 1.2-2.85c.21-.49.32-1 .35-1.53l.55-9.05c.65-.72 1.2-1.61 1.2-2.77C15.3 3.5 13.93 2 12 2Zm0 2.1c.66 0 1.1.5 1.1 1.15 0 .64-.44 1.15-1.1 1.15s-1.1-.51-1.1-1.15c0-.65.44-1.15 1.1-1.15Z"/>' },'pipette dropper lab sample liquid measure titrate micropipette'],
    ['cell',{ body:'<path fill="currentColor" fill-rule="evenodd" d="M12 2.75A9.25 9.25 0 1 0 21.25 12 9.25 9.25 0 0 0 12 2.75Zm0 2A7.25 7.25 0 1 1 4.75 12 7.25 7.25 0 0 1 12 4.75Z"/><circle cx="12.6" cy="12.8" r="2.8" fill="currentColor"/><circle cx="8" cy="9.2" r="1.1" fill="currentColor"/><circle cx="16" cy="16" r="1.25" fill="currentColor"/>' },'cell cells biology nucleus membrane microbiology organelle'],
    ['microbe','bacteria virus','microbe germ bacteria cell pathogen biology bug'],
    ['virus','virus virus-outline','virus germ pathogen infection covid biology'],
    ['atom','atom atom-variant','atom physics science nucleus electron molecule chemistry'],
    ['molecule','molecule molecule-co2','molecule chemistry compound bond structure science'],
    ['labcoat',{ body:'<path fill="currentColor" fill-rule="evenodd" d="M8.2 3 10.6 3 12 5 13.4 3 15.8 3C17 3 18 4 18 5.2V20c0 .6-.5 1-1 1H7c-.5 0-1-.4-1-1V5.2C6 4 7 3 8.2 3ZM11.6 5.8h.8V21h-.8ZM8 12h2v2.2H8Zm6 0h2v2.2h-2Z"/>' },'lab coat white coat scientist doctor uniform research jacket'],
    ['goggles','safety-goggles','goggles safety glasses eye protection lab round chemistry'],
    ['roundglasses','glasses','round glasses spectacles eyewear specs read vision'],
    ['radioactive','radioactive','radioactive radiation nuclear hazard science warning'],
  ]],
  ['Health', [
    ['cross','medical-bag hospital-box','doctor clinic hospital appointment health checkup nurse medical'],
    ['stethoscope','stethoscope','doctor checkup health physician exam appointment'],
    ['pulse','heart-pulse','fitness cardio pulse heart health vitals'],
    ['pillbottle','bottle-tonic-plus bottle-tonic','prescription pills bottle refill pharmacy meds medicine'],
    ['syringe','needle','vaccine shot injection needle flu jab blood'],
    ['bandage','bandage','bandage plaster injury first aid heal wound'],
    ['thermometer','thermometer','fever temperature sick thermometer health'],
    ['brain','brain','brain mind think focus mental memory study'],
    ['heart','heart','love date care health relationship wellbeing self like favorite'],
    ['mask','face-mask','mask face health protection sick covid'],
    ['wheelchair','wheelchair-accessibility wheelchair','wheelchair accessible disability mobility'],
    ['meditation','meditation','meditate meditation mindfulness calm breathe zen relax'],
    ['yoga','yoga','yoga stretch pilates flexibility pose zen calm'],
  ]],
  ['Fitness & Sport', [
    ['walk','walk','walk walking stroll steps commute dog pedestrian'],
    ['run','run','run running jog jogging sprint marathon exercise cardio'],
    ['dumbbell','dumbbell weight-lifter','gym weights lift strength workout exercise train fitness muscle'],
    ['bike','bike bicycle','cycle cycling ride bike biking spin'],
    ['swim','swim','swim swimming pool water laps'],
    ['hiking','hiking','hike hiking trail trek backpack outdoors climb'],
    ['ski','ski','ski skiing snow slope winter'],
    ['basketball','basketball','basketball hoops ball court'],
    ['soccer','soccer','soccer football ball pitch match'],
    ['tennis','tennis','tennis racket court serve'],
    ['golf','golf','golf putt course tee green club'],
    ['boxing','boxing-glove','boxing box fight gloves mma'],
    ['trophy','trophy','win goal achievement award prize compete won'],
    ['medal','medal','medal award win race place'],
    ['target','target','goal focus aim objective habit milestone target'],
  ]],
  ['Food & Drink', [
    ['utensils','silverware-fork-knife silverware','food eat meal cook cooking recipe kitchen dish prep dishes'],
    ['restaurant','food-fork-drink silverware-variant','restaurant dine dinner reservation lunch eat out'],
    ['apple','food-apple','apple fruit healthy snack eat'],
    ['pizza','pizza','pizza slice italian takeout'],
    ['burger','hamburger','burger hamburger fast food lunch'],
    ['taco','taco','taco mexican burrito lunch'],
    ['salad','bowl-mix food-variant','salad healthy bowl greens veggie diet'],
    ['bread','bread-slice baguette','bread loaf bakery toast carb'],
    ['egg','egg','egg breakfast eggs protein'],
    ['cake','cake-variant cake','cake birthday dessert bake sweet celebration'],
    ['cookie','cookie','cookie biscuit snack sweet dessert treat'],
    ['icecream','ice-cream','ice cream cone dessert gelato cold sweet'],
    ['coffee2','coffee-to-go','coffee togo takeaway drink'],
    ['beer','beer','beer pint pub bar drink alcohol lager ale'],
    ['wine','glass-wine','wine drink dinner bar cocktail'],
    ['cocktail','glass-cocktail','cocktail martini drink bar happy hour'],
    ['waterbottle','bottle-soda-classic bottle-water','water bottle hydrate refill gym'],
    ['cart','cart cart-outline','shopping groceries grocery errand store market buy shop cart'],
    ['bag','shopping bag-personal','shopping buy errand bag purchase order pack'],
  ]],
  ['Travel & Places', [
    ['car','car','car drive commute vehicle uber lyft taxi road trip parking'],
    ['bus','bus','bus commute transit ride stop shuttle public'],
    ['train','train','train rail commute station railway'],
    ['subway','subway-variant','subway metro underground tube transit'],
    ['plane','airplane','travel trip flight vacation fly airport plane holiday abroad'],
    ['scooter','scooter','scooter moped ride electric'],
    ['motorcycle','motorbike','motorcycle motorbike ride'],
    ['truck','truck','truck delivery haul cargo move shipping'],
    ['boat','sail-boat ferry','boat sail sailing water lake trip'],
    ['ship','ferry','ship cruise ocean sea travel port'],
    ['rocket','rocket rocket-launch','rocket launch space startup fast'],
    ['fuel','gas-station','fuel gas petrol station car fill pump'],
    ['map','map','map directions navigate route location trip'],
    ['compass','compass compass-outline','compass direction navigate explore adventure north'],
    ['globe','earth','globe world earth international travel global'],
    ['flag','flag','flag goal country milestone finish mark'],
    ['pin','map-marker','location place map address pin important reminder'],
    ['house','home','home house apartment rent mortgage move room'],
    ['building','office-building','building office city apartment work tower company'],
    ['store','store storefront','store shop market retail buy mall business'],
    ['hotel','bed-king office-building','hotel stay travel room booking lodging'],
    ['church','church','church chapel worship religion service faith'],
    ['tent','tent','tent camp camping outdoors festival trip'],
    ['beach','beach','beach sand ocean sea vacation summer'],
    ['mountain','image-filter-hdr','mountain hike peak nature climb outdoors summit'],
  ]],
  ['Home & Objects', [
    ['key','key-variant key','key unlock house access door'],
    ['lock','lock','lock secure private password safe locked'],
    ['unlock','lock-open lock-open-variant','unlock open access'],
    ['wallet','wallet','wallet money cash cards pay budget'],
    ['creditcard','credit-card credit-card-outline','credit card debit pay payment bank shopping'],
    ['box','package-variant-closed','box package storage move parcel'],
    ['package','package-variant','package delivery parcel shipping order box amazon mail'],
    ['gift','gift gift-outline','present gift birthday anniversary wrap holiday'],
    ['scissors','content-cut','scissors cut craft trim haircut hair'],
    ['hammer','hammer','hammer fix build tool diy nail repair'],
    ['wrench','wrench','fix repair tool maintenance setup install assemble handyman plumber'],
    ['brush','brush format-paint','paint brush decorate diy art wall'],
    ['ruler','ruler','ruler measure design draw straight'],
    ['battery','battery','battery charge power energy'],
    ['plug','power-plug','plug power charge electric outlet socket'],
    ['lamp','lamp desk-lamp','lamp light desk reading bright'],
    ['candle','candle','candle light relax wax scent'],
    ['trash','trash-can delete','clean chore garbage trash rubbish bins recycling delete'],
    ['recycle','recycle','recycle green environment bins'],
    ['door','door door-open','door entrance room open exit'],
    ['window','window-closed-variant window-closed','window room view clean open'],
    ['chair','seat sofa','chair seat furniture sit desk'],
    ['sprout','sprout','plant plants garden water grow gardening flower yard tree seedling'],
    ['tree','pine-tree tree','tree nature park forest outdoors'],
    ['flower','flower','flower bloom garden spring plant nature'],
    ['leaf','leaf','leaf nature plant eco green autumn fall'],
    ['paw','paw','pet dog cat animal walk vet feed'],
    ['dog','dog','dog pet puppy walk vet'],
    ['cat','cat','cat pet kitten feed litter'],
    ['bird','bird','bird pet feed tweet'],
    ['fish','fish','fish pet aquarium tank feed'],
    ['wifi','wifi','wifi internet router network connect broadband online'],
  ]],
  ['Tech & Media', [
    ['phone','phone cellphone','call phone contact ring dial telephone mobile'],
    ['mail','email email-outline','email message inbox mail letter send reply newsletter'],
    ['chat','chat message-text','talk message call social text chat meet friend hangout standup meeting'],
    ['tablet','tablet','tablet ipad device screen read'],
    ['keyboard','keyboard','keyboard type computer keys'],
    ['mouse','mouse','mouse computer click device'],
    ['printer','printer','printer print paper document office'],
    ['tv','television','tv television watch show stream movie screen netflix'],
    ['speaker','speaker','speaker sound audio music volume'],
    ['mic','microphone','mic microphone record podcast sing voice audio karaoke'],
    ['headphones','headphones','music podcast listen audio audiobook headphones'],
    ['camera','camera','photo photos picture shoot camera selfie album'],
    ['film','movie filmstrip','movie movies cinema watch film show'],
    ['music','music music-note','song music listen play band practice sing concert playlist'],
    ['guitar','guitar-acoustic','guitar music band strings practice'],
    ['piano','piano','piano keys music play keyboard'],
    ['controller','controller google-controller','game gaming play fun video console arcade'],
    ['dice','dice-5 dice-multiple','dice game board play roll chance'],
    ['puzzle','puzzle','puzzle jigsaw game solve hobby'],
    ['palette','palette','palette paint art color draw design creative'],
    ['ticket','ticket ticket-confirmation','event concert show festival ticket game theatre movie'],
    ['robot','robot','robot ai bot automation assistant'],
    ['database','database','database data storage server backend'],
  ]],
  ['Money & Symbols', [
    ['dollar','cash currency-usd','money finance budget budgeting pay bank salary save savings payment cash'],
    ['coins','cash-multiple','coins money change savings budget'],
    ['piggybank','piggy-bank piggy-bank-outline','piggy bank save savings money deposit'],
    ['receipt','receipt receipt-text','receipt bill expense purchase invoice payment'],
    ['calculator','calculator','calculator math budget numbers finance accounting tax'],
    ['bank','bank','bank finance money deposit'],
    ['handshake','handshake','handshake deal agreement meeting partner client'],
    ['percent','percent-outline percent','percent discount sale interest rate off'],
    ['star','star','important favorite star special priority'],
    ['flame','fire','streak priority hot urgent fire momentum'],
    ['bulb','lightbulb lightbulb-on','idea think plan brainstorm inspiration creative concept'],
    ['check','check-circle check','done complete task finish check tick verify'],
    ['search','magnify','search find look magnify seek'],
    ['shield','shield','shield protect secure safe guard privacy'],
    ['eye','eye','eye view watch see visible look'],
    ['thumbsup','thumb-up','thumbs up like approve good yes'],
    ['smiley','emoticon-happy-outline emoticon-happy','smile happy face mood good feeling'],
    ['party','party-popper','party celebrate confetti birthday fun event'],
    ['balloon','balloon','balloon party celebrate birthday fun'],
    ['megaphone','bullhorn','megaphone announce shout marketing promote'],
    ['list','format-list-bulleted','list tasks bullets todo items'],
    ['repeat','repeat','repeat recurring loop again cycle'],
    ['grid','view-grid','grid apps categories tiles'],
  ]],
  ['Weather', [
    ['cloud','weather-cloudy','cloud weather sky overcast forecast'],
    ['rain','weather-rainy','rain weather wet forecast shower storm'],
    ['snow','weather-snowy snowflake','snow winter cold weather freeze'],
    ['storm','weather-lightning','storm thunder lightning weather rain'],
    ['umbrella','umbrella','umbrella rain weather wet cover'],
    ['wind','weather-windy','wind breeze weather air windy'],
    ['rainbow','looks','rainbow weather colorful sky'],
  ]],
  ['Clothing & Beauty', [
    ['dress','hanger','dress clothes outfit fashion wardrobe wear hanger'],
    ['tshirt','tshirt-crew','tshirt tee shirt clothes casual top'],
    ['shirt','tshirt-v','shirt blouse button clothes top formal'],
    ['shoe','shoe-formal shoe-sneaker','shoe shoes formal dress'],
    ['sneaker','shoe-sneaker shoe-cleat','sneaker shoe shoes trainers running'],
    ['boot','shoe-heel','boot shoe hiking winter'],
    ['hat','hat-fedora','hat sun cap fedora'],
    ['cap','account-cowboy-hat','cap hat baseball cowboy'],
    ['sunglasses','sunglasses','sunglasses glasses cool shades'],
    ['glasses','glasses','glasses eyewear spectacles read'],
    ['ring','ring','ring jewelry engagement wedding'],
    ['lipstick','lipstick','lipstick makeup beauty cosmetics'],
    ['perfume','spray-bottle','perfume fragrance scent beauty spray'],
    ['backpack','bag-personal bag-carry-on','backpack bag school hike travel'],
    ['suitcase','bag-suitcase','suitcase luggage travel trip pack'],
    ['watch','watch','watch time wrist clock'],
    ['scarf','hanger','scarf clothes winter'],
    ['jacket','coat-rack','jacket coat clothes winter outerwear'],
    ['iron','iron','iron laundry press clothes'],
    ['washer','washing-machine','laundry washer wash clothes machine'],
  ]],
]

// Resolve each id to the first candidate that exists in MDI.
const ICONS = {}
const GROUPS = []
const missing = []
for (const [group, items] of SPEC) {
  const outItems = []
  for (const [id, cands, k] of items) {
    // Hand-drawn body (for shapes MDI lacks) — used as-is, no MDI lookup.
    if (cands && typeof cands === 'object' && cands.body) {
      ICONS[id] = { body: cands.body, k, group }
      outItems.push([id, k])
      continue
    }
    const name = cands.split(/\s+/).find(n => mdi.icons[n])
    if (!name) { missing.push(`${id} (tried: ${cands})`); continue }
    ICONS[id] = { body: mdi.icons[name].body, k, group }
    outItems.push([id, k])
  }
  GROUPS.push([group, outItems])
}

if (missing.length) {
  console.error('⚠️  Unresolved ids (no MDI candidate matched):\n  ' + missing.join('\n  '))
}

// Emit the module.
const iconsLines = Object.entries(ICONS).map(([id, v]) =>
  `  ${JSON.stringify(id)}: { body: ${JSON.stringify(v.body)}, k: ${JSON.stringify(v.k)}, group: ${JSON.stringify(v.group)} },`
).join('\n')
const groupsLines = GROUPS.map(([g, items]) =>
  `  [${JSON.stringify(g)}, [\n${items.map(([id, k]) => `    [${JSON.stringify(id)}, ${JSON.stringify(k)}],`).join('\n')}\n  ]],`
).join('\n')

const out = `// src/lib/iconset.js
// AUTO-GENERATED by scripts/build-iconset.mjs — do not edit by hand.
// A curated, filled subset of Material Design Icons (Apache-2.0), 24x24, drawn
// with fill="currentColor" so they read as solid monochrome (Structured-style).
export const ICONS = {
${iconsLines}
};

export const ICON_GROUPS = [
${groupsLines}
];

export const ICON_ALL = ICON_GROUPS.flatMap(([group, items]) => items.map(([id, k]) => ({ id, k, group })));
`

fs.writeFileSync(new URL('../src/lib/iconset.js', import.meta.url), out)
console.log(`✓ wrote src/lib/iconset.js — ${Object.keys(ICONS).length} icons, ${GROUPS.length} groups`)
