#!/usr/bin/env node
/**
 * Pulls a starter set of CC0 / public-domain photographs from Openverse into
 * photos-src/, with a credit sidecar for each one.
 *
 * Only here so the site has something to show before you add your own work:
 *   npm run demo && npm run photos
 * Once your photos are in, clear photos-src/ and re-run `npm run photos`.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const SRC = join(new URL('..', import.meta.url).pathname, 'photos-src');
const API = 'https://api.openverse.org/v1/images/';
const UA = 'filmstrip/1.0 (personal photo site)';
const TERMS = [
  'mountain landscape',
  'coastline sea long exposure',
  'forest fog',
  'city street night',
  'desert dunes',
  'lake reflection',
  'bird wildlife',
  'architecture minimal',
  'portrait natural light',
  'snow winter trees',
];
const WANT = 14;
const PER_TERM = 2; // keeps the starter set varied rather than 14 shots of the same thing

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// A few upstream titles arrive wrapped in markup.
const clean = (s) => String(s ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

async function search(term) {
  const params = new URLSearchParams({
    q: term,
    license: 'cc0,pdm',
    size: 'large',
    mature: 'false',
    page_size: '20',
  });
  const res = await fetch(`${API}?${params}`, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Openverse search failed: ${res.status}`);
  return (await res.json()).results ?? [];
}

function usable(hit) {
  if (!hit.url) return null;
  if ((hit.width ?? 0) < 1600) return null; // note: this is the original's width, not the file we get
  // Openverse indexes scanned paintings and prints alongside photographs.
  const title = clean(hit.title);
  if (/^File:/i.test(title)) return null;
  if (/painting|oil on|engraving|lithograph|watercolou?r|etching|woodcut/i.test(title)) return null;
  return {
    title: clean(hit.title) || 'Untitled',
    url: hit.url,
    source: hit.foreign_landing_url || hit.url,
    license: (hit.license || 'cc0').toUpperCase(),
    author: clean(hit.creator) || 'Unknown',
  };
}

async function main() {
  await mkdir(SRC, { recursive: true });
  const picked = [];
  const seen = new Set();

  for (const term of TERMS) {
    if (picked.length >= WANT) break;
    let results = [];
    try {
      results = await search(term);
    } catch (err) {
      console.warn(`  skipping "${term}": ${err.message}`);
      continue;
    }
    let fromTerm = 0;
    for (const hit of results) {
      if (picked.length >= WANT || fromTerm >= PER_TERM) break;
      const found = usable(hit);
      if (!found || seen.has(found.url)) continue;
      seen.add(found.url);
      picked.push(found);
      fromTerm++;
    }
    await sleep(300);
  }

  if (!picked.length) {
    console.error('Found no freely-licensed matches — try again later, or add your own photos.');
    process.exit(1);
  }

  let i = 1;
  for (const hit of picked) {
    const slug = String(i).padStart(3, '0');
    let body = null;
    try {
      const res = await fetch(hit.url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(25000) });
      if (res.ok) body = Buffer.from(await res.arrayBuffer());
      else console.warn(`  failed ${hit.title}: ${res.status}`);
    } catch (err) {
      console.warn(`  failed ${hit.title}: ${err.message}`);
    }
    if (!body) continue; // keep the numbering contiguous by not advancing i

    await writeFile(join(SRC, `${slug}.jpg`), body);
    await writeFile(
      join(SRC, `${slug}.json`),
      JSON.stringify(
        {
          alt: hit.title,
          caption: `${hit.author} · ${hit.license} · demo photo`,
          credit: { author: hit.author, license: hit.license, source: hit.source },
        },
        null,
        2
      ) + '\n'
    );
    console.log(`  ${slug}.jpg  ${hit.title}  (${hit.license})`);
    i++;
  }
  console.log(`\nFetched ${i - 1} demo photos. Now run: npm run photos`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
