import { createClient } from "@libsql/client";
import { config } from "dotenv";

config({ path: new URL("../.env", import.meta.url).pathname });

const VENDOR = "modernniagara";

type Update = {
  sku: string;
  category?: string;
  material?: string;
  details?: string;
  img?: string;
  imgs?: string[];
  colors?: string[];
  sizes?: string;
  sort_order?: number;
  delete?: boolean;
};

const updates: Update[] = [
  {
    sku: "MN-2",
    material: "100% cotton jersey, 6.75 oz heavyweight",
    details: "Loose fit with dropped shoulders, rib-knit crewneck, side-seam construction, left-chest pocket with Carhartt patch, tagless neck label, #K126",
    img: "/sku/sleeve.png",
    imgs: ["/sku/sleeve.png"],
  },
  {
    sku: "MN-5",
    material: "Poly/spandex blend with performance mesh back",
    details: "Mid-profile structured trucker cap, shapeable pre-curved visor, UV protection, moisture wicking, 110 Technology® sweatband, adjustable plastic snapback, grey under visor, #i8502",
    img: "/swag/cap.png",
    imgs: ["/swag/cap.png"],
  },
  {
    sku: "MN-6",
    material: "100% acrylic rib knit",
    details: "Stretchy thick knit, fold-up cuff with Carhartt patch, one-size-fits-most, #A18",
    img: "/sku/toque.png",
    imgs: ["/sku/toque.png"],
  },
  {
    sku: "MN-7",
    material: "12 oz 100% ringspun cotton duck shell, quilted nylon lining, Arctic-weight polyester insulation",
    details: "Two-way brass zip, pleated bi-swing back, internal rib-knit storm cuffs, four exterior pockets, two interior pockets, triple-stitched seams, #106674",
    img: "/sku/mwinterjacket.png",
    imgs: ["/sku/mwinterjacket.png", "/sku/winterjacket.png"],
  },
  {
    sku: "MN-9",
    material: "10.5 oz midweight 50% cotton / 50% polyester blend",
    details: "Three-piece hood with drawcord, rib-knit cuffs and waist, front handwarmer pocket, triple-stitched seams, Carhartt patch, #K121",
    img: "/sku/pullover.png",
    imgs: ["/sku/pullover.png"],
  },
  {
    sku: "MN-10",
    material: "10.5 oz midweight 50% cotton / 50% polyester blend",
    details: "Three-piece hood with drawcord, full-length brass zipper, rib-knit cuffs and waist, two front handwarmer pockets, Carhartt patch on pocket, loose fit, #K122",
    img: "/sku/mfullzip.png",
    imgs: ["/sku/mfullzip.png", "/sku/fullziphoodie.png"],
  },
  {
    sku: "MN-3",
    material: "6 oz/yd² 100% US cotton, 18 singles",
    details: "Classic fit, rib collar, taped neck and shoulders, tear-away label, no optical brighteners for consistent dye adherence, OEKO-TEX and FLA certified, #2000",
    img: "/sku/tshirt.png",
    imgs: ["/sku/tshirt.png"],
  },
  {
    sku: "MNFR-1",
    material: "9 oz 98% cotton / 2% spandex canvas with Rugged Flex stretch",
    details: "Flame-resistant, NFPA 70E and UL classified to NFPA 2112, relaxed fit, straight leg, phone and utility pockets, OEKO-TEX Standard 100, #104204",
    img: "/sku/FRpants.png",
    imgs: ["/sku/FRpants.png"],
  },
  {
    sku: "MNFR-2",
    material: "7 oz 88% cotton / 12% high-tenacity nylon FR twill",
    details: "Button-up long sleeve, button-down collar, two chest pockets with flaps, flame-resistant melamine buttons, triple-stitched seams, NFPA 2112 / UL classified, meets NFPA 70E, #FRS160",
    img: "/sku/FRsleeve.png",
    imgs: ["/sku/FRsleeve.png"],
  },
  {
    sku: "MNFR-3",
    material: "10.5 oz 40% cotton / 35% modacrylic / 15% viscose / 8% aramid / 2% antistat FR fleece",
    details: "Pullover hood with adjustable drawcord, flame-resistant (NFPA 2112 / ASTM F1506), Force sweat-wicking, FastDry, odor-fighting, handwarmer pocket, #104983",
    img: "/sku/FRpullover.png",
    imgs: ["/sku/FRpullover.png"],
  },
  {
    sku: "MNFR-4",
    material: "10.5 oz 40% cotton / 35% modacrylic / 15% viscose / 8% aramid / 2% antistat FR fleece",
    details: "Full-zip hood with adjustable drawcord, Vislon zip with Nomex tape, flame-resistant (meets NFPA 70E, ASTM F1506, UL classified to NFPA 2112), Force sweat-wicking, FastDry, #104982",
    img: "/sku/FRfullzip.png",
    imgs: ["/sku/FRfullzip.png"],
  },
  {
    sku: "MN-11",
    material: "ProDry® performance polyester",
    details: "Moisture-wicking, anti-microbial, double-stitched seams, extended back shirt tail, easy-care fabric, FootJoy, #16324",
    img: "/sku/footjoy.png",
    imgs: ["/sku/footjoy.png"],
  },
  {
    sku: "MN-12",
    material: "ProDry® performance polyester",
    details: "Moisture-wicking, anti-microbial, double-stitched seams, lock-stitched hem, extended back shirt tail, machine washable, FootJoy, #96324",
    img: "/sku/footjoy-ladies.png",
    imgs: ["/sku/footjoy-ladies.png"],
  },
  {
    sku: "MN-8",
    img: "/sku/106672_NVY_MF21_b_V4.png",
    imgs: ["/sku/106672_NVY_MF21_b_V4.png", "/sku/bib.png"],
  },
  {
    sku: "MN-1",
    img: "/sku/pants.png",
    imgs: ["/sku/pants.png"],
  },
  {
    sku: "MN-15",
    material: "5.3 oz/yd² (US), 8.8 oz/L yd (CA), 100% polyester",
    details: "Moisture-management properties, Anti-odor technology, Textured fabric that's soft, light and breathable, Self-fabric collar, Three-button placket, #1370399",
    img: "/sku/uapolo.png",
    imgs: ["/sku/uapolo.png"],
  },
  {
    sku: "MN-16",
    material: "5.3 oz/yd² (US), 8.8 oz/L yd (CA), 100% polyester",
    details: "Moisture-management properties, Anti-odor technology, Textured fabric that's soft, light and breathable, Self-fabric collar, Three-button placket, #1370431",
    img: "/sku/ua-womens.jpg",
    imgs: ["/sku/ua-womens.jpg"],
  },
  // Re-categorize for the construction sidebar (Jackets / Shirts / Polos / Hats / SWAG)
  { sku: "MN-3",  category: "Shirts"  }, // Short Sleeve T-Shirt
  { sku: "MN-4",  category: "Shirts"  }, // Short Sleeve T-Shirt — Tall
  { sku: "MN-5",  category: "Hats"    }, // Ball Cap
  { sku: "MN-6",  category: "Hats"    }, // Toque
  { sku: "MN-9",  category: "Jackets" }, // Pullover Hoodie
  { sku: "MN-10", category: "Jackets" }, // Full Zip Hoodie
  { sku: "MN-15", category: "SWAG" },    // Men's UA Tech Polo (moved from Polos)
  { sku: "MN-16", category: "SWAG" },    // Women's UA Tech Polo (moved from Polos)
  // Polo color order: Black, Navy, Solace Blue
  { sku: "MN-11", colors: ["#1a1a18", "#2c3e50", "#6b8bb0"] },
  { sku: "MN-12", colors: ["#1a1a18", "#6b8bb0"] },
  // Yeti mug
  {
    sku: "MN-13",
    material: "18/8 stainless steel, double-wall vacuum insulation, DuraCoat™ color finish",
    details: "Comfort grip handle, cupholder-compatible base, Straw Lid with molded-in stopper, dishwasher safe, YETI Rambler®",
    img: "/sku/yeti.png",
    imgs: ["/sku/yeti.png"],
  },
  // Yeti cooler
  {
    sku: "MN-14",
    material: "Rotomolded polyethylene with PermaFrost™ pressure-injected polyurethane foam insulation",
    details: "T-Rex™ lid latches, NeverFail™ hinge system, Vortex™ drain, bearfoot non-slip feet, integrated tie-down slots, YETI Tundra®",
    img: "/swag/Tundra.png",
    imgs: ["/swag/Tundra.png"],
    sizes: "35L / 45L",
  },
  // Insulated 18-can two-compartment cooler — image attached + reclassified as SWAG
  {
    sku: "MN-17",
    category: "SWAG",
    img: "/sku/cooler.png",
    imgs: ["/sku/cooler.png"],
    colors: ["#1a1a18"],
  },
  // Merge MN-4 (Tall) into MN-3 as a size variant
  {
    sku: "MN-3",
    sizes: "S - 4XL / LT - 4XLT",
    details: "Classic fit, rib collar, taped neck and shoulders, tear-away label, no optical brighteners for consistent dye adherence, OEKO-TEX and FLA certified, #2000 / #2000T",
  },
  { sku: "MN-4", delete: true },
  // Display order: Shirts → Polos (all, SWAG) → Jackets/Hoodies → Pants & Bib → Hats → Yeti SWAG
  { sku: "MN-3",  sort_order: 10 }, // Short Sleeve T-Shirt (Shirts)
  { sku: "MN-2",  sort_order: 11 }, // Long Sleeve Shirt (Shirts)
  { sku: "MN-15", sort_order: 12 }, // Men's UA Tech Polo (SWAG — surfaced near shirts)
  { sku: "MN-16", sort_order: 13 }, // Women's UA Tech Polo (SWAG — surfaced near shirts)
  { sku: "MN-11", sort_order: 14 }, // Mens Speckle Print Polo (SWAG — grouped with polos)
  { sku: "MN-12", sort_order: 15 }, // Womens Speckle Print Polo (SWAG — grouped with polos)
  { sku: "MN-7",  sort_order: 20 }, // Winter Jacket (Jackets)
  { sku: "MN-9",  sort_order: 21 }, // Pullover Hoodie (Jackets)
  { sku: "MN-10", sort_order: 22 }, // Full Zip Hoodie (Jackets)
  { sku: "MN-1",  sort_order: 30 }, // Pants
  { sku: "MN-8",  sort_order: 31 }, // Winter Bibs
  { sku: "MN-5",  sort_order: 40 }, // Ball Cap (Hats)
  { sku: "MN-6",  sort_order: 41 }, // Toque (Hats)
  { sku: "MN-13", sort_order: 50 }, // Yeti Mug (SWAG)
  { sku: "MN-14", sort_order: 51 }, // Yeti Cooler (SWAG)
  { sku: "MN-17", sort_order: 52 }, // Insulated 18-Can Cooler (SWAG)
  // MN-18 (25L Laptop Backpack) — restore SWAG data clobbered by an earlier
  // soft-shell update that hit this SKU by mistake.
  {
    sku: "MN-18",
    category: "SWAG",
    material: "",
    details: "#B0000536",
    img: "/sku/backpack.png",
    imgs: ["/sku/backpack.png"],
    sort_order: 53,
  },
  // Port Authority Active Soft Shell — material, details, images, sort_order
  {
    sku: "MN-20",
    material: "100% polyester woven soft shell bonded to 100% polyester microfleece",
    details: "Center front reverse coil zipper, chin guard, princess seams, two front zippered pockets, interior pocket, open cuffs and hem, anti-pill microfleece interior, Port Authority, #J7603",
    img: "/sku/mens-jacket.webp",
    imgs: ["/sku/mens-jacket.webp"],
    sizes: "XS - 6XL",
    sort_order: 23,
  },
  {
    sku: "MN-19",
    material: "100% polyester woven soft shell bonded to 100% polyester microfleece",
    details: "Center front reverse coil zipper, chin guard, princess seams, two front zippered pockets, interior pocket, open cuffs and hem, anti-pill microfleece interior, Port Authority, #L7603",
    img: "/sku/women-jacket.jpg",
    imgs: ["/sku/women-jacket.jpg"],
    sort_order: 24,
  },
  // Mardi Gras Magic Pen — SWAG
  {
    sku: "MN-21",
    material: "Plastic, push-retractable ballpoint, ultra-smooth cartridge, rubber grip",
    details: "Glossy black barrel with vivid neon trim, blue ink, 5 2/5\" L × 2/5\" Dia, #416",
    img: "/sku/pen-bg.png",
    imgs: ["/sku/pen-bg.png"],
    sort_order: 54,
  },
];

async function main() {
  const url = process.env.TURSO_URL || process.env.VITE_TURSO_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN || process.env.VITE_TURSO_AUTH_TOKEN;
  if (!url) { console.error("Missing TURSO_URL"); process.exit(1); }
  const db = createClient({ url, authToken });

  let updated = 0;
  let missing = 0;
  for (const u of updates) {
    const row = await db.execute({
      sql: "SELECT sku FROM products WHERE vendor = ? AND sku = ?",
      args: [VENDOR, u.sku],
    });
    if (row.rows.length === 0) {
      console.log(`  missing ${u.sku} (no row in DB)`);
      missing++;
      continue;
    }

    if (u.delete) {
      await db.execute({
        sql: "DELETE FROM products WHERE vendor = ? AND sku = ?",
        args: [VENDOR, u.sku],
      });
      console.log(`  delete ${u.sku}`);
      updated++;
      continue;
    }

    const sets: string[] = [];
    const args: any[] = [];
    if (u.category !== undefined) { sets.push("category = ?"); args.push(u.category); }
    if (u.material !== undefined) { sets.push("material = ?"); args.push(u.material); }
    if (u.details !== undefined)  { sets.push("details = ?");  args.push(u.details); }
    if (u.img !== undefined)      { sets.push("img = ?");      args.push(u.img); }
    if (u.imgs !== undefined)     { sets.push("imgs = ?");     args.push(JSON.stringify(u.imgs)); }
    if (u.colors !== undefined)   { sets.push("colors = ?");   args.push(JSON.stringify(u.colors)); }
    if (u.sizes !== undefined)    { sets.push("sizes = ?");    args.push(u.sizes); }
    if (u.sort_order !== undefined) { sets.push("sort_order = ?"); args.push(u.sort_order); }
    if (sets.length === 0) continue;

    args.push(VENDOR, u.sku);
    await db.execute({
      sql: `UPDATE products SET ${sets.join(", ")} WHERE vendor = ? AND sku = ?`,
      args,
    });
    console.log(`  update ${u.sku}: ${sets.map((s) => s.split(" = ")[0]).join(", ")}`);
    updated++;
  }
  console.log(`Done: ${updated} updated, ${missing} missing.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
