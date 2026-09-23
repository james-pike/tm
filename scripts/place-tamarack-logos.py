#!/usr/bin/env python3
"""Brand Tamarack product blanks with the Tamarack logo.

Reads the placements saved in the sm SKU manager (src/data/placements.json,
keyed "<code>::tamarack") and composites public/logos/tamarack.png onto each
blank exactly the way the app previews it (logo-overlay.tsx: the logo is
object-contained inside the normalized [x,y,w,h] box, then rotated). Output is
flattened onto white and written to tm/public/skus, plus a .webp sibling.

Re-run after re-cropping / re-placing logos in sm:
    python3 scripts/place-tamarack-logos.py
"""
import json
from PIL import Image

SM = "/home/jvm/sm"
TM = "/home/jvm/tm"
LOGO_LIGHT = f"{SM}/public/logos/tamarack.png"        # white wordmark (dark garments)
LOGO_DARK = f"{SM}/public/logos/tamarack-black.png"   # dark wordmark (light garments)

# (code, source blank in sm/public/skus, output file in tm/public/skus)
# Output names match the `img`/`imgs` paths already stored on the DB rows.
TASKS = [
    ("L00545", "L00545-black.png",         "L00545-tamarack.png"),
    ("L00545", "L00545-athleticgrey.png",  "L00545-athleticgrey-tamarack.png"),
    ("L00545", "L00545-charcoal.png",      "L00545-charcoal-tamarack.png"),
    ("88194",  "88194-black.jpg",          "88194-black-tamarack.jpg"),
    ("88193",  "88193-black.jpg",          "88193-black-tamarack.jpg"),
    ("78193",  "78193-black.png",          "78193-black-tamarack.png"),
    ("78194",  "78194-black.png",          "78194-black-tamarack.png"),
    ("106673", "106673-black.png",         "106673-black-tamarack.png"),
    # Added Sep 2026: new Tamarack lineup SKUs (crop-aware — see apply_crop).
    ("S445",   "S445-black.png",           "S445-black-tamarack.png"),
    ("S445",   "S445-kellygreen.png",      "S445-kellygreen-tamarack.png"),
    ("106674", "106674-black.png",          "106674-black-tamarack.png"),
    ("8800",   "8800-black.png",            "8800-black-tamarack.png"),
    ("8800",   "8800-kellygreen.png",       "8800-kellygreen-tamarack.png"),
    ("105751", "105751-black.jpg",          "105751-black-tamarack.png"),
    ("105751", "105751-tarmac.jpg",         "105751-tarmac-tamarack.png"),
    ("6328JG", "6328JG-safetygreen.jpg",    "6328JG-safetygreen-tamarack.png"),
]

placements = json.load(open(f"{SM}/src/data/placements.json"))
P = placements.get("placements", placements)
# Which {code}::{colorslug} combos use the DARK logo (light/grey garments).
dark_raw = json.load(open(f"{SM}/src/data/dark-logo.json"))
DARK = {k.lower() for k, v in dark_raw.items() if v}
# Non-destructive per-image crops (keyed by source public path). Applied AFTER
# compositing the logo on the FULL image, matching sm's WYSIWYG crop preview
# (see scripts/bake-finaldrive.py apply_crop).
CROPS = json.load(open(f"{SM}/src/data/crops.json"))
logo_light = Image.open(LOGO_LIGHT).convert("RGBA")
logo_dark = Image.open(LOGO_DARK).convert("RGBA")


def apply_crop(im, rect):
    if not rect:
        return im
    W, H = im.size
    x = min(max(rect["x"], 0.0), 1.0); y = min(max(rect["y"], 0.0), 1.0)
    w = min(max(rect["w"], 0.02), 1.0 - x); h = min(max(rect["h"], 0.02), 1.0 - y)
    L, T = round(x * W), round(y * H); R, B = round((x + w) * W), round((y + h) * H)
    return im.crop((L, T, R, B)) if R - L > 1 and B - T > 1 else im

for code, src, out in TASKS:
    key = f"{code}::tamarack"
    if key not in P:
        print(f"  ! no placement for {key}; skipping {out}")
        continue
    pl = P[key]
    # colour slug = source filename after "<code>-", minus extension ("black" if none)
    stem = src.rsplit(".", 1)[0]
    slug = stem[len(code) + 1:] if stem.lower().startswith(code.lower() + "-") else "black"
    logo = logo_dark if f"{code}::{slug}".lower() in DARK else logo_light
    base = Image.open(f"{SM}/public/skus/{src}").convert("RGBA")
    W, H = base.size
    bx, by = pl["x"] * W, pl["y"] * H
    bw, bh = pl["w"] * W, pl["h"] * H
    # object-contain the logo inside the box (preserve aspect, center)
    scale = min(bw / logo.width, bh / logo.height)
    lg = logo.resize((max(1, round(logo.width * scale)), max(1, round(logo.height * scale))), Image.LANCZOS)
    rot = pl.get("rotation", 0) or 0
    if rot:
        lg = lg.rotate(-rot, expand=True, resample=Image.BICUBIC)
    px = round(bx + (bw - lg.width) / 2)
    py = round(by + (bh - lg.height) / 2)
    base.alpha_composite(lg, (px, py))
    # apply the saved non-destructive crop (if any) to the composited full image
    base = apply_crop(base, CROPS.get(f"/skus/{src}"))
    # flatten onto white (removes transparent-blank fuzz; needed for JPEG too)
    flat = Image.new("RGBA", base.size, (255, 255, 255, 255))
    flat.alpha_composite(base)
    rgb = flat.convert("RGB")
    outp = f"{TM}/public/skus/{out}"
    if out.lower().endswith((".jpg", ".jpeg")):
        rgb.save(outp, "JPEG", quality=92)
    else:
        rgb.save(outp, "PNG")
    rgb.save(outp.rsplit(".", 1)[0] + ".webp", "WEBP", quality=82)
    print(f"  branded {out}  (logo {lg.width}x{lg.height} @ {px},{py} on {W}x{H})")

print("done")
