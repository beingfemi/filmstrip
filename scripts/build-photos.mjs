#!/usr/bin/env node
/**
 * Reads every image in photos-src/, pulls its EXIF, writes web-sized copies
 * into img/, and emits data/photos.json — the manifest the site renders from.
 *
 * Run it after adding or removing photos:  npm run photos
 */
import { readdir, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join, extname, basename } from 'node:path';
import sharp from 'sharp';
import exifr from 'exifr';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'photos-src');
const OUT = join(ROOT, 'img');
const WIDTHS = [640, 1200, 2000];
const MAX_WIDTH = 2400; // beyond this the file size stops buying visible detail
const QUALITY = 78;
const EXTS = new Set(['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.webp', '.heic']);

/** 0.00625 -> "1/160", 8 -> "8" */
function shutter(seconds) {
  if (!seconds) return null;
  if (seconds >= 1) return `${Number(seconds.toFixed(1))}`;
  return `1/${Math.round(1 / seconds)}`;
}

/** Prefer the model, but keep the make when the model doesn't already say it. */
function cameraName(make, model) {
  if (!model) return make || null;
  if (!make) return model;
  const first = make.split(/[\s,]/)[0];
  return model.toLowerCase().includes(first.toLowerCase()) ? model : `${first} ${model}`;
}

function buildCaption(e) {
  const bits = [];
  if (e.camera) bits.push(e.camera);
  if (e.aperture) bits.push(`ƒ${e.aperture}`);
  if (e.shutter) bits.push(`${e.shutter} sec`);
  if (e.focal) bits.push(`${e.focal}mm`);
  if (e.iso) bits.push(`ISO ${e.iso}`);
  return bits.join(', ');
}

const escapeHtml = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Same caption, but with the shutter fraction and ISO given their own styling. */
function captionHtml(photo) {
  if (photo.sidecarCaption) return escapeHtml(photo.sidecarCaption);
  const e = photo.exif;
  const bits = [];
  if (e.camera) bits.push(escapeHtml(e.camera));
  if (e.aperture) bits.push(`\u0192${escapeHtml(e.aperture)}`);
  if (e.shutter) {
    bits.push(
      e.shutter.includes('/')
        ? `<span class="frac">${escapeHtml(e.shutter)}</span> sec`
        : `${escapeHtml(e.shutter)} sec`
    );
  }
  if (e.focal) bits.push(`${escapeHtml(e.focal)}mm`);
  if (e.iso) bits.push(`<span class="caps">ISO</span> ${escapeHtml(e.iso)}`);
  return bits.join(', ');
}

function paneHtml(photo) {
  const sizes = `(max-width: 46rem) 100vw, calc(85vh * ${photo.ratio})`;
  const caption = captionHtml(photo);
  return `  <figure class="pane pane--photo" style="--ratio:${photo.ratio}">
    <button class="frame" type="button" style="background-image:url(${photo.lqip})" aria-label="View ${escapeHtml(photo.alt)} larger">
      <img src="${photo.src}" srcset="${photo.srcset}" sizes="${sizes}"
           width="${photo.width}" height="${photo.height}" alt="${escapeHtml(photo.alt)}"
           loading="lazy" decoding="async">
    </div>
    <figcaption class="caption">${caption}</figcaption>
  </figure>`;
}

/** Fills the {{PLACEHOLDER}} slots in src/template.html. */
async function renderPage(photos) {
  const config = JSON.parse(await readFile(join(ROOT, 'site.config.json'), 'utf8'));
  const template = await readFile(join(ROOT, 'src', 'template.html'), 'utf8');

  const wordmark = config.wordmarkLink
    ? `${escapeHtml(config.wordmark ?? '')}<a href="${escapeHtml(config.wordmarkLink.href)}">${escapeHtml(config.wordmarkLink.label)}</a>`
    : escapeHtml(config.title);

  const intro = (config.intro ?? []).map((p) => `<p>${escapeHtml(p)}</p>`).join('\n      ');

  const links = (config.links ?? []).length
    ? `<p>Also on ${config.links
        .map((l) => `<a href="${escapeHtml(l.href)}">${escapeHtml(l.label)}</a>`)
        .join(' and ')}.</p>`
    : '';

  const ogImage = photos.length
    ? `<meta property="og:image" content="${photos[0].src}">`
    : '';

  const count = photos.length === 1 ? '1 photograph.' : `${photos.length} photographs.`;

  const html = template
    .replaceAll('{{TITLE}}', escapeHtml(config.title ?? 'Filmstrip'))
    .replaceAll('{{DESCRIPTION}}', escapeHtml(config.description ?? ''))
    .replaceAll('{{WORDMARK}}', wordmark)
    .replaceAll('{{INTRO}}', intro)
    .replaceAll('{{LINKS}}', links)
    .replaceAll('{{OG_IMAGE}}', ogImage)
    .replaceAll('{{PHOTOS}}', photos.map(paneHtml).join('\n\n'))
    .replaceAll('{{COUNT}}', escapeHtml(count))
    .replaceAll('{{FOOTER}}', escapeHtml(config.footer ?? ''));

  await writeFile(join(ROOT, 'index.html'), html);
}

async function readExif(file) {
  let raw = {};
  try {
    raw = (await exifr.parse(file, { tiff: true, exif: true, ifd0: true })) || {};
  } catch {
    /* not every file carries EXIF — that's fine */
  }
  return {
    camera: cameraName(raw.Make, raw.Model),
    lens: raw.LensModel || null,
    aperture: raw.FNumber ? Number(raw.FNumber.toFixed(1)).toString().replace(/\.0$/, '') : null,
    shutter: shutter(raw.ExposureTime),
    focal: raw.FocalLength ? Number(raw.FocalLength).toFixed(1) : null,
    iso: raw.ISO || null,
    taken: (raw.DateTimeOriginal || raw.CreateDate || null)?.toISOString?.() ?? null,
  };
}

/** Optional per-photo overrides: photos-src/my-shot.json next to my-shot.jpg */
async function readSidecar(dir, slug) {
  try {
    return JSON.parse(await readFile(join(dir, `${slug}.json`), 'utf8'));
  } catch {
    return {};
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const files = (await readdir(SRC))
    .filter((f) => EXTS.has(extname(f).toLowerCase()))
    .sort();

  if (!files.length) {
    console.log('No photos in photos-src/. Add some, or run `npm run demo` for a starter set.');
    return;
  }

  // Clear out old renditions so deleted photos don't linger in img/.
  for (const stale of await readdir(OUT).catch(() => [])) {
    if (stale !== '.gitkeep') await rm(join(OUT, stale));
  }

  const photos = [];
  for (const file of files) {
    const slug = basename(file, extname(file)).replace(/[^a-z0-9-_]/gi, '-').toLowerCase();
    const path = join(SRC, file);
    const image = sharp(path, { failOn: 'none' }).rotate(); // rotate() honours EXIF orientation
    const meta = await image.metadata();

    // metadata() reports pre-rotation dimensions; swap them for 90°/270° orientations.
    const turned = meta.orientation >= 5 && meta.orientation <= 8;
    const width = turned ? meta.height : meta.width;
    const height = turned ? meta.width : meta.height;

    // Always include a rendition at the photo's own width (capped), so a source
    // that is smaller than the top rung still gets a full-detail copy instead of
    // being upscaled from the rung below it.
    const targets = [...new Set(WIDTHS.filter((w) => w < width).concat(Math.min(width, MAX_WIDTH)))]
      .sort((a, b) => a - b);

    const sizes = [];
    for (const w of targets) {
      const name = `${slug}-${w}.jpg`;
      await image
        .clone()
        .resize({ width: w })
        .jpeg({ quality: QUALITY, mozjpeg: true })
        .toFile(join(OUT, name));
      sizes.push({ w, src: `img/${name}` });
    }
    // Tiny inline placeholder so panes have colour before the real file lands.
    const lqip = await image.clone().resize({ width: 16 }).blur(1).jpeg({ quality: 40 }).toBuffer();

    const exif = await readExif(path);
    const sidecar = await readSidecar(SRC, basename(file, extname(file)));

    photos.push({
      slug,
      width,
      height,
      ratio: Number((width / height).toFixed(4)),
      src: sizes[sizes.length - 1].src,
      srcset: sizes.map((s) => `${s.src} ${s.w}w`).join(', '),
      lqip: `data:image/jpeg;base64,${lqip.toString('base64')}`,
      caption: sidecar.caption ?? buildCaption(exif),
      sidecarCaption: sidecar.caption ?? null,
      credit: sidecar.credit ?? null,
      alt: sidecar.alt ?? sidecar.title ?? 'Photograph',
      taken: exif.taken,
      exif,
    });
    console.log(`  ${slug}  ${width}×${height}  ${photos.at(-1).caption || '(no exif)'}`);
  }

  // Newest first when we know the date; otherwise keep filename order.
  photos.sort((a, b) => (b.taken || '').localeCompare(a.taken || ''));

  await writeFile(
    join(ROOT, 'data', 'photos.json'),
    JSON.stringify({ generated: new Date().toISOString(), photos }, null, 2) + '\n'
  );
  await renderPage(photos);
  console.log(`\nWrote data/photos.json and index.html — ${photos.length} photos.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
