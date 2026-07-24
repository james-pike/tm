/**
 * Image optimizer. Runs in prebuild (see package.json), so images added for new
 * products get optimized on the next deploy without anyone remembering to.
 *
 * Why in place, rather than emitting to a separate directory: the `img` paths in
 * products.ts come from the Turso DB (fetch-products.ts regenerates the file on
 * every build), so the filenames are not ours to change. We keep the name and the
 * format, and write a .webp sibling next to it — the components ask for the webp
 * first and fall back to the original (see product-image.tsx).
 *
 * Idempotent: a manifest records the hash of each file we produced, so a rebuild
 * skips anything already optimized. Without that, every build would re-encode an
 * already-lossy JPEG and the quality would compound downwards.
 */
import { createHash } from "crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { join, extname } from "path";
import sharp from "sharp";

const MANIFEST = "public/.image-manifest.json";

// Product shots are displayed at most 440 CSS px (the catalog card and the PDP
// panel), so 880 covers a 2x screen. Everything else — hero art, category cards,
// logos — can run full-bleed on a desktop monitor, so it gets a wider cap.
const RULES: { dir: string; maxWidth: number }[] = [
  { dir: "public/wt", maxWidth: 880 },
  { dir: "public/sku", maxWidth: 880 },
  { dir: "public", maxWidth: 1600 },
];

const IMAGE_RE = /\.(jpe?g|png)$/i;
// The sign texture is inlined into the CSS as a data URI; leave the source file
// alone. Favicons are tiny and format-sensitive.
const SKIP = /favicon|iron-grunge/i;

type Manifest = Record<string, string>;
const manifest: Manifest = existsSync(MANIFEST)
  ? JSON.parse(readFileSync(MANIFEST, "utf8"))
  : {};

const hash = (buf: Buffer) => createHash("sha1").update(buf).digest("hex").slice(0, 16);
const KB = (n: number) => `${Math.round(n / 1024)} KB`;

async function optimize(path: string, maxWidth: number) {
  const before = readFileSync(path);
  // Already ours? Then the bytes on disk match what we last wrote.
  if (manifest[path] === hash(before)) return { skipped: true, before: before.length, after: before.length };

  const meta = await sharp(before).metadata();
  const resize = () => sharp(before).resize({ width: maxWidth, withoutEnlargement: true });

  const optimized =
    meta.format === "png"
      ? await resize().png({ compressionLevel: 9, palette: true, quality: 80 }).toBuffer()
      : await resize().jpeg({ quality: 80, mozjpeg: true, progressive: true }).toBuffer();

  // Never write a bigger file than we started with.
  const out = optimized.length < before.length ? optimized : before;
  writeFileSync(path, out);
  manifest[path] = hash(out);

  const webpPath = path.replace(IMAGE_RE, ".webp");
  const webp = await resize().webp({ quality: 80 }).toBuffer();
  writeFileSync(webpPath, webp);

  return { skipped: false, before: before.length, after: out.length, webp: webp.length };
}

async function main() {
  const seen = new Set<string>();
  let totalBefore = 0, totalAfter = 0, totalWebp = 0, done = 0, skipped = 0;

  for (const { dir, maxWidth } of RULES) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (seen.has(path) || !statSync(path).isFile()) continue;
      if (!IMAGE_RE.test(name) || SKIP.test(name)) continue;
      seen.add(path);

      const r = await optimize(path, maxWidth);
      totalBefore += r.before;
      totalAfter += r.after;
      totalWebp += r.webp ?? 0;
      if (r.skipped) skipped++;
      else {
        done++;
        if (r.before - r.after > 500 * 1024) {
          console.log(`  ${KB(r.before)} -> ${KB(r.after)} (webp ${KB(r.webp!)})  ${path}`);
        }
      }
    }
  }

  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  console.log(
    `images: ${done} optimized, ${skipped} already done — ` +
      `${KB(totalBefore)} -> ${KB(totalAfter)} in place, ${KB(totalWebp)} as webp`,
  );
}

main().catch((e) => {
  console.error("image optimize failed:", e);
  process.exit(1);
});
