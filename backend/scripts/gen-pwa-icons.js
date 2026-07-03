// Rasterize the brand favicon.svg into all required PNG/ICO icons.
// Run from project root: node backend/scripts/gen-pwa-icons.js
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const FILL = { r: 5, g: 150, b: 105 }; // #059669
const ALPHA_BG = { ...FILL, alpha: 1 };

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const publicDir = resolve(root, 'frontend', 'public');

// Source favicon.svg (complex green bolt) — also favicon-light for light theme
const faviconSvg = readFileSync(resolve(publicDir, 'favicon.svg'));
const faviconLightSvg = readFileSync(resolve(publicDir, 'images', 'favicon-light.svg'));

async function rasterize(svgBuf, size, filename, bg = ALPHA_BG) {
  const dest = resolve(publicDir, filename);
  await sharp(svgBuf, { density: size * 2 })
    .resize(size, size, { fit: 'contain', background: bg })
    .flatten({ background: FILL })
    .png()
    .toFile(dest);
  console.log('wrote', dest);
}

// PWA icons — from root favicon.svg
await rasterize(faviconSvg, 192, 'icon-192.png');
await rasterize(faviconSvg, 512, 'icon-512.png');

// Apple Touch Icon (180x180 for iOS) — also from root favicon.svg
await rasterize(faviconSvg, 180, 'apple-touch-icon.png');

// Favicon PNG fallbacks for older browsers
await rasterize(faviconLightSvg, 32, 'favicon-32x32.png');
await rasterize(faviconLightSvg, 16, 'favicon-16x16.png');

console.log('All icons generated.');
