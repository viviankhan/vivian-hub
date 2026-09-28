import test from 'node:test';
import assert from 'node:assert/strict';

import { extractFileRefs, cleanMarkup } from '../src/wikitext.js';
import { rankByPrefer, parsePrefer } from '../src/rank.js';
import { extractPageImages, rankPageImages, largestFromSrcset } from '../src/html.js';
import { imageSources, fandomResized, wikimediaOriginal, looksLikeImageUrl } from '../src/urls.js';
import { wikiFromUrl } from '../src/wiki.js';
import { sniffImageType } from '../src/fetch.js';
import { KURAPIKA_WIKITEXT, GALLERY_WIKITEXT } from './fixtures.mjs';
import { PNG, JPEG } from './helpers.mjs';

test('tab labels tell the 2011, 1999 and manga infobox pictures apart', () => {
  const refs = extractFileRefs(KURAPIKA_WIKITEXT);
  const ctx = Object.fromEntries(refs.map((r) => [r.file, r.context]));
  assert.equal(ctx['Kurapika 2011 Design.png'], '2011 Anime');
  assert.equal(ctx['Kurapika 1999 Design.png'], '1999 Anime');
  assert.equal(ctx['Kurapika Manga.png'], 'Manga');
});

test('file links keep their caption and section, even with links inside the caption', () => {
  const ref = extractFileRefs(KURAPIKA_WIKITEXT).find((r) => r.file === 'Kurapika headshot.png');
  assert.equal(ref.caption, "Kurapika's scarlet eyes up close");
  assert.equal(ref.context, 'Appearance');
});

test('gallery lines give captions under nested section headings, with or without File:', () => {
  const refs = extractFileRefs(GALLERY_WIKITEXT);
  const byFile = Object.fromEntries(refs.map((r) => [r.file, r]));
  assert.equal(byFile['Kurapika 2011 full body.png'].caption, "Kurapika's full body design in the 2011 anime");
  assert.equal(byFile['Kurapika 2011 full body.png'].context, '2011 Anime › Full body');
  assert.equal(byFile['Kurapika turnaround 2011.png'].caption, 'Turnaround sheet (front, side, back)');
  assert.equal(byFile['Kurapika 1999 full body.png'].context, '1999 Anime');
  assert.equal(byFile['Kurapika manga color.png'].context, 'Manga');
});

test('template fields that name a file directly are found', () => {
  const refs = extractFileRefs('{{Infobox\n| image = Gon_2011.png\n| caption = Gon\n}}');
  assert.deepEqual(refs.map((r) => [r.file, r.caption]), [['Gon 2011.png', 'image']]);
});

test('cleanMarkup strips links, bold and templates', () => {
  assert.equal(cleanMarkup("'''Gon''' in [[Greed Island|GI]] {{ref}}<br/>arc"), 'Gon in GI arc');
});

test('prefer ranks by filename, caption and section; minus words push down', () => {
  const items = [
    { t: 'Kurapika headshot.png Appearance' },
    { t: 'Kurapika 1999 full body.png Full body in the 1999 anime' },
    { t: 'Kurapika 2011 full body.png 2011 Anime › Full body' },
  ];
  const ranked = rankByPrefer(items, '2011 full body -1999', (x) => x.t);
  assert.equal(ranked[0].t, items[2].t);
  assert.equal(ranked[2].t, items[1].t);
  assert.deepEqual(parsePrefer('"full body" -manga').phrases, ['full body']);
});

test('without prefer the original order stays', () => {
  const items = [{ t: 'b' }, { t: 'a' }];
  assert.deepEqual(rankByPrefer(items, '', (x) => x.t), items);
});

test('page images: og:image first, srcset largest, icons and tiny images skipped', () => {
  const html = `<html><head><title>Killua | Wiki</title>
    <meta property="og:image" content="https://cdn.example/killua-main.jpg?w=1200&amp;h=630">
    </head><body>
    <img src="/logo.png" alt="Site">
    <img src="/pixel.gif" width="1" height="1">
    <img src="/a-small.jpg" srcset="/a-small.jpg 300w, /a-big.jpg 1600w" alt="Killua boots closeup" width="300" height="400">
    <img data-src="https://cdn.example/lazy.webp" alt="Killua 2011 full body">
    </body></html>`;
  const { pageTitle, images } = extractPageImages(html, 'https://site.example/wiki/Killua');
  assert.equal(pageTitle, 'Killua | Wiki');
  assert.deepEqual(images.map((i) => i.url), [
    'https://cdn.example/killua-main.jpg?w=1200&h=630',
    'https://site.example/a-big.jpg',
    'https://cdn.example/lazy.webp',
  ]);
  assert.equal(rankPageImages(images, 'full body')[0].url, 'https://cdn.example/lazy.webp');
  assert.equal(largestFromSrcset('a.jpg 1x, b.jpg 2x'), 'b.jpg');
});

test('fandom thumbnails are swapped for the sharp 1568px version', () => {
  const thumb = 'https://static.wikia.nocookie.net/hunterxhunter/images/1/1a/Beans.png/revision/latest/scale-to-width-down/250?cb=2014';
  assert.deepEqual(imageSources(thumb), [
    'https://static.wikia.nocookie.net/hunterxhunter/images/1/1a/Beans.png/revision/latest/scale-to-width-down/1568?cb=2014',
    'https://static.wikia.nocookie.net/hunterxhunter/images/1/1a/Beans.png/revision/latest/scale-to-width-down/1000?cb=2014',
  ]);
  assert.equal(
    fandomResized('https://static.wikia.nocookie.net/x/images/1/1a/B.png/revision/latest/smart/width/200/height/200', 0),
    'https://static.wikia.nocookie.net/x/images/1/1a/B.png/revision/latest',
  );
  assert.equal(
    fandomResized('https://static.wikia.nocookie.net/x/images/1/1a/B.png', 1568),
    'https://static.wikia.nocookie.net/x/images/1/1a/B.png/revision/latest/scale-to-width-down/1568',
  );
});

test('wikimedia thumbnails upgrade to the original', () => {
  const thumb = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Cell.jpg/220px-Cell.jpg';
  assert.equal(wikimediaOriginal(thumb), 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Cell.jpg');
  assert.equal(imageSources(thumb)[0], 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Cell.jpg');
  const svg = imageSources('https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/D.svg/200px-D.svg.png');
  assert.equal(svg[0], 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/D.svg/1568px-D.svg.png');
});

test('wiki URLs map to their API', () => {
  assert.deepEqual(wikiFromUrl('https://hunterxhunter.fandom.com/wiki/Kurapika/Image_Gallery?x=1'), {
    apis: ['https://hunterxhunter.fandom.com/api.php'], origin: 'https://hunterxhunter.fandom.com', prefix: '', title: 'Kurapika/Image Gallery',
  });
  assert.equal(wikiFromUrl('https://hunterxhunter.fandom.com/es/wiki/Gon_Freecss').apis[0], 'https://hunterxhunter.fandom.com/es/api.php');
  assert.equal(wikiFromUrl('https://en.wikipedia.org/wiki/Dendritic_cell').apis[0], 'https://en.wikipedia.org/w/api.php');
  assert.equal(wikiFromUrl('https://myanimelist.net/character/28/Kurapika'), null);
  assert.ok(looksLikeImageUrl('https://static.wikia.nocookie.net/x/images/1/1a/B.png/revision/latest'));
});

test('image sniffing accepts only formats Claude can view', () => {
  assert.equal(sniffImageType(PNG), 'image/png');
  assert.equal(sniffImageType(JPEG), 'image/jpeg');
  assert.equal(sniffImageType(new TextEncoder().encode('<svg xmlns=')), null);
});
