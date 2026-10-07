// Renders the app icon set into public/. Run with `npm run icons` after changing the mark.
import { mkdirSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const out = new URL('../public/', import.meta.url);
mkdirSync(new URL('icons/', out), { recursive: true });

const BG = '#0c0d0f';
const BLUE = '#3d8bff';

// A dial that opens at the bottom (track + lit arc) with an upward arrow.
const glyph = `
  <path d="M 149.93 362.07 A 150 150 0 1 1 362.07 362.07" fill="none" stroke="#2a2e35" stroke-width="38" stroke-linecap="round"/>
  <path d="M 149.93 362.07 A 150 150 0 1 1 391.95 192.61" fill="none" stroke="${BLUE}" stroke-width="38" stroke-linecap="round"/>
  <path d="M256 318V206M210 250l46-46 46 46" fill="none" stroke="#ffffff" stroke-width="36" stroke-linecap="round" stroke-linejoin="round"/>`;

// Rounded tile for favicons and "any" icons; full-bleed for maskable/apple (the OS applies its own mask).
const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="${BG}"/>${glyph}</svg>`;
// Maskable: keep the glyph inside the central 80% safe zone.
const fullBleed = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${BG}"/><g transform="translate(256 256) scale(0.82) translate(-256 -256)">${glyph}</g></svg>`;

function png(svg, size) {
  return new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
}

/** ICO container holding a single PNG image. */
function ico(pngData, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size >= 256 ? 0 : size, 0);
  entry.writeUInt8(size >= 256 ? 0 : size, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(pngData.length, 8);
  entry.writeUInt32LE(6 + 16, 12);
  return Buffer.concat([header, entry, pngData]);
}

writeFileSync(new URL('favicon.svg', out), rounded);
writeFileSync(new URL('favicon.ico', out), ico(png(rounded, 32), 32));
writeFileSync(new URL('apple-touch-icon.png', out), png(fullBleed, 180));
writeFileSync(new URL('icons/icon-96.png', out), png(rounded, 96));
writeFileSync(new URL('icons/icon-192.png', out), png(rounded, 192));
writeFileSync(new URL('icons/icon-512.png', out), png(rounded, 512));
writeFileSync(new URL('icons/icon-maskable-512.png', out), png(fullBleed, 512));
console.log('Icons written to public/');
