// A small copy of how the Hunter x Hunter fandom wiki lays out a character.

import { imageResponse, jsonResponse, status } from './helpers.mjs';

export const KURAPIKA_WIKITEXT = `{{Character Infobox
|name = Kurapika
|image = <tabber>
2011 Anime=[[File:Kurapika 2011 Design.png|250px]]
|-|1999 Anime=[[File:Kurapika 1999 Design.png|250px]]
|-|Manga=[[File:Kurapika Manga.png|250px]]
</tabber>
|kanji = クラピカ
}}
'''Kurapika''' is one of the main protagonists.
== Appearance ==
[[File:Kurapika headshot.png|thumb|left|Kurapika's [[Scarlet Eyes|scarlet eyes]] up close]]
Kurapika is a slender young man.
== Trivia ==
[[File:Wiki-icon.png|20px]]
`;

export const GALLERY_WIKITEXT = `== 2011 Anime ==
=== Full body ===
<gallery>
File:Kurapika 2011 full body.png|Kurapika's full body design in the [[2011 anime]]
Kurapika turnaround 2011.png|Turnaround sheet (front, side, back)|link=Kurapika
</gallery>
== 1999 Anime ==
<gallery>
Kurapika 1999 full body.png|Full body in the 1999 anime
</gallery>
== Manga ==
<gallery>
Kurapika manga color.png|Colored manga page
</gallery>
`;

const SIZES = {
  'Kurapika 2011 Design.png': [600, 900],
  'Kurapika 1999 Design.png': [600, 900],
  'Kurapika Manga.png': [500, 800],
  'Kurapika headshot.png': [300, 300],
  'Wiki-icon.png': [20, 20],
  'Kurapika 2011 full body.png': [1200, 3000],
  'Kurapika turnaround 2011.png': [2400, 1200],
  'Kurapika 1999 full body.png': [800, 1600],
  'Kurapika manga color.png': [1000, 1500],
  'Kurapika infobox extra.png': [400, 400],
};

export function fandomFile(name, suffix = '') {
  return `https://static.wikia.nocookie.net/hunterxhunter/images/a/ab/${name.replace(/ /g, '_')}/revision/latest${suffix}?cb=20240101`;
}

export function fandomApi(url) {
  const p = url.searchParams;
  if (p.get('action') === 'parse') {
    const page = p.get('page');
    if (page === 'Kurapika') {
      return jsonResponse({ parse: { title: 'Kurapika', wikitext: KURAPIKA_WIKITEXT, images: ['Kurapika_2011_Design.png', 'Kurapika_infobox_extra.png', 'Wiki-icon.png'] } });
    }
    if (page === 'Kurapika/Image Gallery') {
      return jsonResponse({ parse: { title: 'Kurapika/Image Gallery', wikitext: GALLERY_WIKITEXT, images: [] } });
    }
    return jsonResponse({ error: { code: 'missingtitle', info: "The page you specified doesn't exist." } });
  }
  if (p.get('action') === 'query' && p.get('prop') === 'imageinfo') {
    const pages = p.get('titles').split('|').map((t) => {
      const name = t.replace(/^File:/, '');
      const dims = SIZES[name];
      if (!dims) return { title: t, missing: true };
      const [width, height] = dims;
      return {
        title: t,
        imageinfo: [{
          url: fandomFile(name),
          thumburl: width > 1568 ? fandomFile(name, '/scale-to-width-down/1568') : fandomFile(name),
          width, height, mime: 'image/png',
        }],
      };
    });
    return jsonResponse({ query: { pages } });
  }
  if (p.get('action') === 'query') {
    const pages = p.get('titles').split('|').map((t) =>
      t === 'Kurapika/Image Gallery' ? { pageid: 7, title: t } : { title: t, missing: true });
    return jsonResponse({ query: { pages } });
  }
  return status(400);
}

// Routes for the whole fake fandom: the API works, the web pages are 403 like the real thing.
export const fandomRoutes = [
  [/^https:\/\/hunterxhunter\.fandom\.com\/api\.php/, fandomApi],
  [/^https:\/\/hunterxhunter\.fandom\.com\/wiki\//, () => status(403)],
  [/^https:\/\/static\.wikia\.nocookie\.net\//, () => imageResponse()],
];
