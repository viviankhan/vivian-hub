// src/lib/emojis.js
// A broad, searchable emoji set for the Color & Icon picker — the Structured
// approach (real emoji, not just line glyphs). Each entry: [char, keywords].
// Grouped for browsing; keywords power search. Kept practical (a few hundred of
// the most task-relevant emoji) rather than the full Unicode list.

export const EMOJI_GROUPS = [
  { name:'Smileys & People', items:[
    ['😀','smile happy grin joy face'],['😃','smile happy joy face'],['😄','laugh happy smile joy'],
    ['😁','grin smile happy'],['😆','laugh haha funny'],['😊','blush smile happy content'],
    ['🙂','slight smile happy'],['😉','wink flirt'],['😍','love heart eyes crush'],
    ['🥰','love adore hearts happy'],['😘','kiss love'],['😌','relieved calm content'],
    ['😎','cool sunglasses'],['🤩','star struck wow excited'],['🥳','party celebrate birthday'],
    ['😴','sleep tired zzz nap bed'],['😪','sleepy tired'],['🤗','hug'],['🤔','think hmm'],
    ['😅','sweat nervous relief'],['😂','laugh cry funny lol'],['🙃','upside silly'],
    ['😇','angel innocent'],['🥱','yawn tired sleepy'],['😤','determined focus'],
    ['😭','cry sad sob'],['😩','tired stressed'],['😢','sad tear cry'],['😰','anxious stress worried'],
    ['🤒','sick fever ill thermometer'],['🤧','sneeze sick cold'],['🤢','sick nauseous'],
    ['🥵','hot heat sweat'],['🥶','cold freeze'],['😷','mask sick'],['🤕','hurt injured bandage'],
    ['💪','strong muscle gym workout flex'],['🙏','pray thanks please hope'],['👏','clap applause'],
    ['👍','thumbs up like good yes'],['👎','thumbs down no'],['✌️','peace victory'],['🤝','handshake deal'],
    ['👋','wave hi hello bye'],['🙌','celebrate hooray raise'],['👉','point'],['🧠','brain mind study focus'],
    ['👶','baby infant'],['🧒','child kid'],['👩','woman'],['👨','man'],['🧑','person'],
    ['👵','grandma old woman'],['👴','grandpa old man'],['👪','family'],['🤰','pregnant'],
    ['🧑‍⚕️','doctor nurse medical'],['🧑‍🏫','teacher class school'],['🧑‍💻','coder work laptop dev'],
    ['🧑‍🍳','chef cook kitchen'],['💃','dance dancing'],['🕺','dance man'],['🚶','walk walking'],
    ['🏃','run running jog exercise'],['🧘','yoga meditate calm relax'],
  ]},
  { name:'Clothing & Beauty', items:[
    ['👗','dress clothes outfit fashion wardrobe'],['👚','shirt blouse top clothes women'],
    ['👕','shirt tshirt clothes tee top'],['👖','jeans pants trousers clothes'],
    ['🩳','shorts clothes'],['👔','tie shirt formal work suit'],['🧥','coat jacket clothes winter'],
    ['🩱','swimsuit swim'],['👙','bikini swim beach'],['🥻','sari dress'],['🩲','underwear briefs'],
    ['🧦','socks clothes'],['👠','heels shoe shoes'],['👟','sneaker shoe shoes running trainers'],
    ['👞','shoe shoes formal'],['🥾','boot hiking shoe'],['🥿','flat shoe'],['👡','sandal shoe'],
    ['👒','hat sun'],['🧢','cap hat'],['🎩','tophat formal'],['👜','bag purse handbag'],
    ['👛','purse wallet'],['🎒','backpack bag school'],['👓','glasses'],['🕶️','sunglasses cool'],
    ['💍','ring jewelry engagement wedding'],['💄','lipstick makeup beauty'],['💅','nails manicure beauty'],
    ['💇','haircut hair salon'],['💈','barber haircut'],['🧴','lotion soap wash'],['🧼','soap wash clean'],
    ['🪥','toothbrush teeth brush'],['🧻','toilet paper'],['🚿','shower wash bath'],['🛁','bath bathtub'],
  ]},
  { name:'Activity & Sport', items:[
    ['⚽','soccer football ball'],['🏀','basketball ball'],['🏈','football nfl'],['⚾','baseball'],
    ['🎾','tennis ball'],['🏐','volleyball'],['🏉','rugby'],['🎱','pool billiards eight ball'],
    ['🏓','ping pong table tennis'],['🏸','badminton'],['🥊','boxing gloves fight'],['🥋','martial arts karate judo'],
    ['⛳','golf'],['🏌️','golf golfer'],['🎿','ski skiing'],['⛷️','ski skier'],['🏂','snowboard'],
    ['🏄','surf surfing'],['🏊','swim swimming'],['🚴','bike cycling ride'],['🚵','mountain bike'],
    ['🧗','climb climbing rock'],['🤸','gymnastics cartwheel'],['🏋️','gym weights lift workout'],
    ['🤾','handball'],['🏇','horse riding'],['🎯','target darts goal aim'],['🎳','bowling'],
    ['🎮','game gaming controller video'],['🎲','dice game board'],['♟️','chess strategy'],
    ['🧩','puzzle jigsaw'],['🎨','art paint palette draw'],['🎭','theater drama play'],['🎤','sing mic karaoke music'],
    ['🎧','headphones music podcast listen'],['🎸','guitar music band'],['🎹','piano keyboard music'],
    ['🥁','drums music'],['🎺','trumpet music'],['🎻','violin music'],['🏆','trophy win award'],
    ['🥇','gold medal first win'],['🏅','medal award'],['🎬','movie film clapper'],['🎫','ticket event'],
  ]},
  { name:'Food & Drink', items:[
    ['🍎','apple fruit healthy'],['🍌','banana fruit'],['🍓','strawberry fruit berry'],['🍇','grapes fruit'],
    ['🍊','orange fruit'],['🍉','watermelon fruit'],['🍒','cherry fruit'],['🥑','avocado'],
    ['🍅','tomato'],['🥦','broccoli veggie'],['🥕','carrot veggie'],['🌽','corn'],['🥗','salad healthy greens'],
    ['🍞','bread toast bakery'],['🥐','croissant bakery breakfast'],['🥯','bagel breakfast'],['🥞','pancakes breakfast'],
    ['🧇','waffle breakfast'],['🥚','egg breakfast'],['🍳','fried egg cooking breakfast'],['🧀','cheese'],
    ['🥓','bacon breakfast'],['🍔','burger hamburger fast food'],['🍟','fries fast food'],['🌭','hotdog'],
    ['🍕','pizza slice'],['🌮','taco mexican'],['🌯','burrito wrap'],['🥙','pita wrap'],['🥪','sandwich lunch'],
    ['🍜','ramen noodles soup'],['🍝','pasta spaghetti'],['🍣','sushi'],['🍱','bento lunch'],['🍚','rice'],
    ['🍲','stew soup pot'],['🍛','curry'],['🥘','paella pan'],['🍤','shrimp fried'],['🥟','dumpling'],
    ['🍦','ice cream dessert'],['🍰','cake dessert slice'],['🎂','birthday cake celebrate'],['🧁','cupcake dessert'],
    ['🍪','cookie dessert'],['🍩','donut dessert'],['🍫','chocolate candy'],['🍬','candy sweet'],['🍭','lollipop'],
    ['☕','coffee tea cup hot caffeine'],['🍵','tea green matcha'],['🧃','juice drink box'],['🥤','soda drink cup'],
    ['🧋','boba bubble tea'],['🍺','beer pint drink'],['🍷','wine drink'],['🍸','cocktail martini drink'],
    ['🍹','cocktail tropical drink'],['🥂','champagne toast celebrate'],['🥃','whiskey drink'],['💧','water drop hydrate'],
    ['🫗','pour drink water'],['🧊','ice cube cold'],
  ]},
  { name:'Travel & Places', items:[
    ['🚗','car drive commute'],['🚕','taxi cab'],['🚙','suv car'],['🚌','bus commute transit'],
    ['🚎','trolley bus'],['🏎️','race car fast'],['🚓','police car'],['🚑','ambulance emergency'],
    ['🚒','fire truck'],['🚐','van'],['🚚','truck delivery'],['🚛','truck lorry'],['🚜','tractor farm'],
    ['🛵','scooter moped'],['🏍️','motorcycle bike'],['🚲','bike bicycle cycling'],['🛴','scooter kick'],
    ['🚂','train steam'],['🚆','train rail'],['🚇','subway metro underground'],['🚊','tram'],['🚝','monorail'],
    ['✈️','plane flight travel fly'],['🛫','takeoff departure flight'],['🛬','landing arrival flight'],
    ['🚁','helicopter'],['🚀','rocket launch space'],['🛸','ufo'],['⛵','sailboat sailing'],['🚤','speedboat'],
    ['🛳️','cruise ship'],['⚓','anchor boat'],['⛽','gas fuel station'],['🚏','bus stop'],['🚦','traffic light'],
    ['🗺️','map directions'],['🧭','compass navigate'],['🌍','world globe earth'],['🗽','statue liberty landmark'],
    ['🏔️','mountain peak snow'],['⛰️','mountain'],['🏕️','camp tent camping'],['🏖️','beach sand ocean vacation'],
    ['🏝️','island tropical vacation'],['🏜️','desert'],['🌋','volcano'],['🏞️','park nature'],
    ['🏠','home house'],['🏡','home house garden'],['🏢','office building work'],['🏬','store mall shop'],
    ['🏫','school'],['🏥','hospital clinic'],['🏦','bank'],['🏨','hotel stay'],['⛪','church'],
    ['🏛️','museum government building'],['🏰','castle'],['⛺','tent camp'],['🌆','city sunset skyline'],
  ]},
  { name:'Objects & Work', items:[
    ['💼','work briefcase job business'],['💻','laptop computer work code'],['🖥️','desktop monitor computer'],
    ['⌨️','keyboard type'],['🖱️','mouse computer'],['🖨️','printer print'],['📱','phone mobile cell'],
    ['☎️','phone call'],['📞','phone call receiver'],['📷','camera photo'],['📸','camera flash photo'],
    ['🎥','video camera film'],['📺','tv television watch'],['📻','radio'],['🔋','battery charge'],['🔌','plug power'],
    ['💡','idea bulb light'],['🔦','flashlight'],['🕯️','candle'],['📔','notebook journal'],['📖','book read reading'],
    ['📚','books study library'],['📝','write note memo pencil'],['✏️','pencil write edit'],['🖊️','pen write'],
    ['📅','calendar date schedule'],['📆','calendar date'],['🗓️','calendar planner'],['📌','pin note important'],
    ['📎','paperclip attach'],['📁','folder files'],['📂','folder open files'],['🗂️','files organize'],
    ['📄','document paper page'],['📃','document page'],['📊','chart bar data stats'],['📈','chart up growth trend'],
    ['📉','chart down decline'],['📋','clipboard checklist tasks'],['✅','check done complete task'],
    ['☑️','check box done'],['✔️','check tick done'],['❌','x wrong no cancel'],['➕','plus add'],
    ['➖','minus remove'],['🔍','search find magnify'],['🔎','search find'],['🔒','lock secure private'],
    ['🔓','unlock open'],['🔑','key access'],['🗝️','key old'],['🔨','hammer fix tool'],['🛠️','tools fix repair'],
    ['🔧','wrench fix tool'],['🪛','screwdriver tool'],['🧰','toolbox tools'],['🧹','broom clean sweep chore'],
    ['🧺','laundry basket chore'],['🧴','lotion soap bottle'],['🛒','shopping cart groceries'],['🛍️','shopping bags'],
    ['🎁','gift present birthday'],['📦','package box delivery'],['✉️','email mail letter'],['📧','email mail'],
    ['📬','mailbox mail'],['💰','money bag cash savings'],['💵','money cash dollar'],['💳','card credit pay'],
    ['🪙','coin money'],['💎','diamond gem jewel'],['⏰','alarm clock wake'],['⏱️','stopwatch timer'],
    ['⌛','hourglass time wait'],['🕐','clock time'],['🔔','bell reminder alert notify'],['🔕','mute silent'],
    ['📢','announce megaphone'],['🔑','key'],['🗑️','trash bin delete'],['♻️','recycle green'],
  ]},
  { name:'Nature & Weather', items:[
    ['☀️','sun sunny morning day'],['🌤️','sun cloud partly'],['⛅','cloud sun partly'],['☁️','cloud overcast'],
    ['🌧️','rain wet weather'],['⛈️','storm thunder lightning'],['🌩️','lightning thunder'],['❄️','snow cold winter'],
    ['☃️','snowman winter'],['🌈','rainbow'],['🌙','moon night sleep'],['⭐','star favorite'],['🌟','star glow sparkle'],
    ['✨','sparkle glitter shine magic'],['⚡','lightning bolt energy fast'],['🔥','fire flame hot streak'],
    ['💥','boom explosion'],['🌊','wave ocean water sea'],['💦','splash water sweat'],['🌱','sprout plant grow'],
    ['🌿','herb leaf plant'],['☘️','clover luck'],['🍀','four leaf clover luck'],['🌵','cactus plant desert'],
    ['🌴','palm tree beach tropical'],['🌲','tree evergreen pine'],['🌳','tree'],['🌷','tulip flower'],
    ['🌸','blossom flower spring'],['🌺','hibiscus flower'],['🌻','sunflower'],['🌹','rose flower love'],
    ['💐','bouquet flowers'],['🍁','maple leaf autumn fall'],['🍂','leaves autumn fall'],['🐶','dog pet puppy'],
    ['🐱','cat pet kitten'],['🐭','mouse'],['🐰','rabbit bunny'],['🦊','fox'],['🐻','bear'],['🐼','panda'],
    ['🐨','koala'],['🐸','frog'],['🐢','turtle'],['🐍','snake'],['🐦','bird'],['🐤','chick baby bird'],
    ['🦋','butterfly'],['🐝','bee'],['🐞','ladybug'],['🐟','fish'],['🐠','tropical fish'],['🐬','dolphin'],
    ['🐳','whale'],['🐾','paw pet animal'],['🦴','bone dog'],
  ]},
  { name:'Symbols', items:[
    ['❤️','love heart red'],['🧡','heart orange'],['💛','heart yellow'],['💚','heart green'],['💙','heart blue'],
    ['💜','heart purple'],['🖤','heart black'],['🤍','heart white'],['💗','heart pink growing'],['💖','heart sparkle'],
    ['💘','heart arrow cupid'],['💕','hearts two love'],['❣️','heart exclamation'],['💔','broken heart'],
    ['🔴','red circle dot'],['🟠','orange circle'],['🟡','yellow circle'],['🟢','green circle'],['🔵','blue circle'],
    ['🟣','purple circle'],['⚫','black circle'],['⚪','white circle'],['🟤','brown circle'],
    ['🔺','triangle red up'],['🔻','triangle down'],['💯','hundred perfect score'],['✔️','check yes'],
    ['❗','exclamation important'],['❓','question'],['⁉️','exclamation question'],['💤','sleep zzz tired'],
    ['🚩','flag red mark'],['🏁','checkered flag finish'],['🎌','flags'],['♾️','infinity forever'],
    ['🔆','bright'],['🔅','dim'],['🎉','party confetti celebrate'],['🎊','confetti party'],['🎈','balloon party'],
    ['🎀','ribbon bow gift'],['🕊️','dove peace'],['☮️','peace'],['⚠️','warning caution'],['🔞','no 18'],
  ]},
]

// Flat lookup for search.
export const EMOJI_ALL = EMOJI_GROUPS.flatMap(g => g.items.map(([c, k]) => ({ c, k, group: g.name })))

// Search emoji by keyword (space-separated terms; all must match some keyword
// token). Returns an array of chars.
export function searchEmoji(term) {
  const q = (term || '').trim().toLowerCase()
  if (!q) return []
  const words = q.split(/\s+/)
  return EMOJI_ALL.filter(e => {
    const hay = e.k
    return words.every(w => hay.includes(w))
  }).map(e => e.c)
}
