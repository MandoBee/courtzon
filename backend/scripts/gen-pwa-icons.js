// One-off: rasterize the brand favicon.svg into PWA PNG icons (192 + 512).
// Run from project root: node backend/scripts/gen-pwa-icons.js
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const svg = readFileSync(resolve(root, 'frontend/public/favicon.svg'));
const out = (n) => resolve(root, `frontend/public/icon-${n}.png`);

for (const size of [192, 512]) {
  await sharp(svg, { density: 384 })
    .resize(size, size, { fit: 'contain', background: { r: 5, g: 150, b: 105, alpha: 1 } })
    .flatten({ background: { r: 5, g: 150, b: 105 } })
    .png()
    .toFile(out(size));
  console.log('wrote', out(size));
}
