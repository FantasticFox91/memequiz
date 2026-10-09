// Иконки и картинка превью ссылки (Open Graph) → apps/web/public. Результат коммитится,
// перезапускать только при смене дизайна или мемов на превью: pnpm content:brand
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const PUBLIC = 'apps/web/public';
const MEMES = join(PUBLIC, 'memes');

const ACCENT = '#2481cc';
const BG = '#17212b';

// --- иконка: облачко с «?» ---
const iconSvg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="${ACCENT}"/>
  <path d="M14 18a6 6 0 0 1 6-6h24a6 6 0 0 1 6 6v18a6 6 0 0 1-6 6H30l-9 8v-8h-1a6 6 0 0 1-6-6z" fill="#fff"/>
  <path d="M27 22.5a5 5 0 1 1 7.2 4.5c-1.4.7-2.2 1.6-2.2 3V31" fill="none" stroke="${ACCENT}" stroke-width="3.6" stroke-linecap="round"/>
  <circle cx="32" cy="36.5" r="2.2" fill="${ACCENT}"/>
</svg>`;

await writeFile(join(PUBLIC, 'favicon.svg'), iconSvg(64).trim() + '\n');
await sharp(Buffer.from(iconSvg(512)))
  .resize(32, 32)
  .png()
  .toFile(join(PUBLIC, 'favicon-32.png'));
// iOS «на экран Домой»: без прозрачности
await sharp(Buffer.from(iconSvg(512)))
  .resize(180, 180)
  .flatten({ background: ACCENT })
  .png()
  .toFile(join(PUBLIC, 'apple-touch-icon.png'));

// --- превью ссылки 1200×630: заголовок слева, коллаж мемов справа ---
const W = 1200;
const H = 630;

const textSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <radialGradient id="glow" cx="0.2" cy="0.3" r="0.8">
      <stop offset="0" stop-color="${ACCENT}" stop-opacity="0.45"/>
      <stop offset="1" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <g font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif" fill="#fff">
    <text x="72" y="250" font-size="96" font-weight="800">MemeQuiz</text>
    <text x="76" y="320" font-size="40" font-weight="600" fill="#cfe3f5">Викторина по мемам</text>
    <text x="76" y="400" font-size="30" fill="#8b9aa7">Угадай мем · продолжи фразу</text>
    <text x="76" y="442" font-size="30" fill="#8b9aa7">Лидерборд среди друзей</text>
  </g>
  <rect x="76" y="490" width="250" height="64" rx="32" fill="${ACCENT}"/>
  <text x="201" y="532" font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-size="28" font-weight="700" fill="#fff" text-anchor="middle">Пройти тест</text>
</svg>`;

// плитка мема: квадрат со скруглением, белая рамка, лёгкий поворот
async function tile(file, size, angle) {
  const radius = 24;
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}"/></svg>`,
  );
  const frame = Buffer.from(
    `<svg width="${size}" height="${size}"><rect x="3" y="3" width="${size - 6}" height="${size - 6}" rx="${radius - 2}" fill="none" stroke="#fff" stroke-width="6"/></svg>`,
  );
  const img = await sharp(join(MEMES, file))
    .resize(size, size, { fit: 'cover' })
    .composite([{ input: mask, blend: 'dest-in' }, { input: frame }])
    .png()
    .toBuffer();
  return sharp(img)
    .rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

const SIZE = 250;
const tiles = [
  { file: '7.webp', left: 640, top: 50, angle: -6 }, // Пепе
  { file: '6.webp', left: 910, top: 70, angle: 5 }, // упоротый лис
  { file: '4.webp', left: 650, top: 320, angle: 4 }, // лемур
  { file: '11.webp', left: 915, top: 335, angle: -5 }, // Гарольд
];

const composites = await Promise.all(
  tiles.map(async (t) => ({ input: await tile(t.file, SIZE, t.angle), left: t.left, top: t.top })),
);

await sharp(Buffer.from(textSvg))
  .composite(composites)
  // JPEG: превью в мессенджерах грузится быстрее, чем PNG того же вида
  .jpeg({ quality: 85, mozjpeg: true })
  .toFile(join(PUBLIC, 'og-image.jpg'));

console.log('favicon.svg, favicon-32.png, apple-touch-icon.png, og-image.jpg → ' + PUBLIC);
