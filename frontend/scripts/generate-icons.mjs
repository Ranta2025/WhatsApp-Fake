// Genera iconos PNG para PWA desde el logo SVG de la app
// Se ejecuta con: node scripts/generate-icons.mjs
import { writeFileSync, mkdirSync } from 'fs';
import { Resvg } from '@resvg/resvg-js';

// Función para crear un SVG del logo en cualquier tamaño
function createLogoSVG(size) {
    const rx = Math.round(size * 0.22);
    const fontSize1 = Math.round(size * 0.625);
    const fontSize2 = Math.round(size * 0.34);
    const y1 = Math.round(size * 0.75);
    const x1 = Math.round(size * 0.156);
    const x2 = Math.round(size * 0.594);
    const y2 = Math.round(size * 0.47);
    
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#13b584"/>
      <stop offset="100%" style="stop-color:#08aecb"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${rx}" fill="url(#bg)"/>
  <text x="${x1}" y="${y1}" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="${fontSize1}" fill="white">T</text>
  <text x="${x2}" y="${y2}" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${fontSize2}" fill="#d1faea">2</text>
</svg>`;
}

// Generar SVGs en múltiples tamaños para el manifest
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const outDir = 'public/icons';

try { mkdirSync(outDir, { recursive: true }); } catch {}

for (const size of sizes) {
    const svg = createLogoSVG(size);
    writeFileSync(`${outDir}/icon-${size}x${size}.svg`, svg);
    console.log(`Generated icon-${size}x${size}.svg`);
}

// También generar un maskable icon (con padding extra para Android)
function createMaskableSVG(size) {
    const padding = Math.round(size * 0.1);
    const innerSize = size - padding * 2;
    const rx = Math.round(innerSize * 0.22);
    const fontSize1 = Math.round(innerSize * 0.625);
    const fontSize2 = Math.round(innerSize * 0.34);
    const y1 = padding + Math.round(innerSize * 0.75);
    const x1 = padding + Math.round(innerSize * 0.156);
    const x2 = padding + Math.round(innerSize * 0.594);
    const y2 = padding + Math.round(innerSize * 0.47);
    
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#13b584"/>
      <stop offset="100%" style="stop-color:#08aecb"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="#08aecb"/>
  <rect x="${padding}" y="${padding}" width="${innerSize}" height="${innerSize}" rx="${rx}" fill="url(#bg)"/>
  <text x="${x1}" y="${y1}" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="${fontSize1}" fill="white">T</text>
  <text x="${x2}" y="${y2}" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${fontSize2}" fill="#d1faea">2</text>
</svg>`;
}

writeFileSync(`${outDir}/maskable-512x512.svg`, createMaskableSVG(512));
console.log('Generated maskable-512x512.svg');

// Rasterize SVG to PNG (static assets checked into git)
const BG = '#0a1015';

function toPng(svg, size) {
    return new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
}

// Logo centered within ~80% of the canvas over a full-bleed opaque background
function createFullBleedSVG(size, scale) {
    const inner = Math.round(size * scale);
    const offset = Math.round((size - inner) / 2);
    const logo = createLogoSVG(inner).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" fill="${BG}"/>
  <svg x="${offset}" y="${offset}" width="${inner}" height="${inner}" viewBox="0 0 ${inner} ${inner}">${logo}</svg>
</svg>`;
}

const pngs = [
    ['icon-192.png', createLogoSVG(192), 192],
    ['icon-512.png', createLogoSVG(512), 512],
    ['maskable-512.png', createFullBleedSVG(512, 0.8), 512],
    ['apple-touch-icon-180.png', createFullBleedSVG(180, 0.9), 180],
];

for (const [name, svg, size] of pngs) {
    writeFileSync(`${outDir}/${name}`, toPng(svg, size));
    console.log(`Generated ${name}`);
}

console.log('\nDone! Icons generated in public/icons/');
