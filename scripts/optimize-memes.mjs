// Исходники мемов из content/memes-src → apps/web/public/memes/*.webp
// Длинная сторона до 800 px, качество снижается, пока файл не влезет в 200 КБ.
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { extname, join, parse } from 'node:path';
import sharp from 'sharp';

const SRC_DIR = 'content/memes-src';
const OUT_DIR = 'apps/web/public/memes';
const MAX_SIDE = 800;
const MAX_BYTES = 200 * 1024;
const TOTAL_BUDGET = 3 * 1024 * 1024;
const QUALITIES = [82, 75, 68, 60, 52, 45];
const INPUT_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);

const kb = (bytes) => `${(bytes / 1024).toFixed(0)} КБ`;

async function optimize(file) {
  const input = sharp(join(SRC_DIR, file)).rotate().resize(MAX_SIDE, MAX_SIDE, {
    fit: 'inside',
    withoutEnlargement: true,
  });
  let out;
  let quality;
  for (quality of QUALITIES) {
    out = await input.clone().webp({ quality, effort: 6 }).toBuffer();
    if (out.length <= MAX_BYTES) break;
  }
  const name = `${parse(file).name}.webp`;
  await writeFile(join(OUT_DIR, name), out);
  return { name, srcBytes: (await stat(join(SRC_DIR, file))).size, bytes: out.length, quality };
}

const files = (await readdir(SRC_DIR).catch(() => [])).filter((f) =>
  INPUT_EXT.has(extname(f).toLowerCase()),
);
if (files.length === 0) {
  console.error(`Нет картинок в ${SRC_DIR}`);
  process.exit(1);
}

await mkdir(OUT_DIR, { recursive: true });
const results = [];
for (const file of files.sort()) results.push(await optimize(file));

let total = 0;
for (const r of results) {
  total += r.bytes;
  const flag = r.bytes > MAX_BYTES ? '  ⚠ больше 200 КБ' : '';
  console.log(
    `${r.name.padEnd(28)} ${kb(r.srcBytes).padStart(8)} → ${kb(r.bytes).padStart(7)}  q${r.quality}${flag}`,
  );
}
console.log(`\nИтого: ${results.length} файлов, ${kb(total)}`);
if (total > TOTAL_BUDGET) console.warn(`⚠ Больше бюджета ${kb(TOTAL_BUDGET)} на викторину`);
