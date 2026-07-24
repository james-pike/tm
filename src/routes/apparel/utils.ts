// Utility functions that won't be overwritten by auto-generation

// White (#ffffff) is always rendered after every other swatch.
export function sortColorsWhiteLast(colors: readonly string[]): string[] {
  return [...colors].sort((a, b) => {
    const aw = a.toLowerCase() === "#ffffff" ? 1 : 0;
    const bw = b.toLowerCase() === "#ffffff" ? 1 : 0;
    return aw - bw;
  });
}

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL", "7XL"];
const TALL_ORDER = ["LT", "XLT", "2XLT", "3XLT", "4XLT", "5XLT"];

export function expandSizes(sizes: string): string[] {
  if (sizes === "One Size") return ["One Size"];
  const order = SIZE_ORDER;
  const tallOrder = TALL_ORDER;
  const expandRange = (range: string): string[] => {
    const m = range.trim().match(/^(\w+)\s*-\s*(\w+)$/);
    if (!m) return [range.trim()];
    const inReg = order.indexOf(m[1]) !== -1 && order.indexOf(m[2]) !== -1;
    const inTall = tallOrder.indexOf(m[1]) !== -1 && tallOrder.indexOf(m[2]) !== -1;
    const arr = inReg ? order : inTall ? tallOrder : null;
    if (!arr) return [range.trim()];
    return arr.slice(arr.indexOf(m[1]), arr.indexOf(m[2]) + 1);
  };
  return sizes.split("/").flatMap(expandRange);
}

// Card-facing counterpart to expandSizes: instead of every individual size, the
// shortest honest SUMMARY, split into one entry per fit.
//
// A product carrying both fits stores them in one string — either as two ranges
// ("S - 4XL / LT - 4XLT") or as an explicit list that mixes them
// ("S / M / L / XL / 2XL / 3XL / 2XLT / LT"). Rendered verbatim on a card that
// second form is a run-on that wraps to three lines and buries the fact that
// tall is even offered. Grouped, it's two legible lines:
//
//   S - 3XL
//   LT / 2XLT
//
// Contiguous runs collapse to a range and gaps stay visible, so a set that skips
// a size ("XS / S / M / L / XL / 2XL / 4XL / 5XL") reads "XS - 2XL / 4XL - 5XL"
// rather than claiming a 3XL that isn't stocked.
//
// Anything not built purely from the two known scales — "One Size",
// "28 - 46 waist", "Ladies XS - 3XL", "UK 5 - 13" — is passed straight through
// as a single entry.
export function sizeGroups(sizes: string): string[] {
  const reg: number[] = [];
  const tall: number[] = [];

  for (const raw of sizes.split("/")) {
    const part = raw.trim();
    if (!part) continue;
    const range = part.match(/^(\w+)\s*-\s*(\w+)$/);
    const [from, to] = range ? [range[1], range[2]] : [part, part];
    const scale = SIZE_ORDER.indexOf(from) !== -1 && SIZE_ORDER.indexOf(to) !== -1
      ? { order: SIZE_ORDER, into: reg }
      : TALL_ORDER.indexOf(from) !== -1 && TALL_ORDER.indexOf(to) !== -1
        ? { order: TALL_ORDER, into: tall }
        : null;
    // One unrecognised token and the whole string is something this doesn't
    // model — hand it back untouched rather than half-parsing it.
    if (!scale) return [sizes];
    const start = scale.order.indexOf(from);
    const end = scale.order.indexOf(to);
    for (let i = start; i <= end; i++) scale.into.push(i);
  }

  const condense = (idxs: number[], order: string[]): string => {
    const sorted = [...new Set(idxs)].sort((a, b) => a - b);
    const runs: number[][] = [];
    for (const i of sorted) {
      const run = runs[runs.length - 1];
      if (run && i === run[run.length - 1] + 1) run.push(i);
      else runs.push([i]);
    }
    return runs
      .map((r) => (r.length === 1 ? order[r[0]] : `${order[r[0]]} - ${order[r[r.length - 1]]}`))
      .join(" / ");
  };

  const groups: string[] = [];
  if (reg.length) groups.push(condense(reg, SIZE_ORDER));
  if (tall.length) groups.push(condense(tall, TALL_ORDER));
  return groups.length ? groups : [sizes];
}
