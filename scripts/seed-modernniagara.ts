import { createClient } from "@libsql/client";
import { config } from "dotenv";

config({ path: new URL("../.env", import.meta.url).pathname });

const VENDOR = "modernniagara";
const NAVY = "#2c3e50";
const LIGHT_BLUE = "#7dd3fc";
const BLACK = "#1a1a18";
const SOLACE_BLUE = "#6b8bb0";

type Seed = {
  sku: string;
  name: string;
  category: string;
  sizes: string;
  colors: string[];
  price: number;
  details: string;
};

const seeds: Seed[] = [
  // Flame Resistant
  { sku: "MNFR-1", name: "FR Pants", category: "Flame Resistant", sizes: "S - 4XL", colors: [NAVY], price: 159.00, details: "Fire-resistant, #104204" },
  { sku: "MNFR-2", name: "FR Long Sleeve Button-Up Shirt", category: "Flame Resistant", sizes: "S - 4XL", colors: [LIGHT_BLUE], price: 124.99, details: "Fire-resistant, #FRS160" },
  { sku: "MNFR-3", name: "FR Pullover Hoodie", category: "Flame Resistant", sizes: "S - 4XL", colors: [NAVY], price: 214.99, details: "Fire-resistant, #104983" },
  { sku: "MNFR-4", name: "FR Full Zip Hoodie", category: "Flame Resistant", sizes: "S - 4XL", colors: [NAVY], price: 239.99, details: "Fire-resistant, #104982" },
  { sku: "MNFR-5", name: "FR Insulated Bib", category: "Flame Resistant", sizes: "S - 4XL", colors: [NAVY], price: 380.00, details: "Fire-resistant, #101626" },
  { sku: "MNFR-6", name: "FR Insulated Jacket", category: "Flame Resistant", sizes: "S - 4XL", colors: [NAVY], price: 290.00, details: "Fire-resistant, #101618" },
  // Regular MN apparel
  { sku: "MN-1",  name: "Pants",                       category: "Pants",     sizes: "S - 4XL",  colors: [NAVY], price: 69.99,  details: "#102291" },
  { sku: "MN-2",  name: "Long Sleeve Shirt",           category: "Shirts",    sizes: "S - 4XL",  colors: [NAVY], price: 59.99,  details: "#K126" },
  { sku: "MN-3",  name: "Short Sleeve T-Shirt",        category: "T-Shirts",  sizes: "S - 4XL / LT - 4XLT", colors: [NAVY], price: 13.50,  details: "#2000 / #2000T" },
  { sku: "MN-5",  name: "Ball Cap",                    category: "Caps",      sizes: "One Size", colors: [NAVY], price: 23.50,  details: "#i8502" },
  { sku: "MN-6",  name: "Toque",                       category: "Caps",      sizes: "One Size", colors: [NAVY], price: 33.99,  details: "#A18" },
  { sku: "MN-7",  name: "Winter Jacket",               category: "Jackets",   sizes: "S - 4XL",  colors: [NAVY], price: 198.49, details: "#106674" },
  { sku: "MN-8",  name: "Winter Bibs",                 category: "Work Wear", sizes: "S - 4XL",  colors: [NAVY], price: 189.99, details: "#106672" },
  { sku: "MN-9",  name: "Pullover Hoodie",             category: "Hoodies",   sizes: "S - 4XL",  colors: [NAVY], price: 74.99,  details: "#K121" },
  { sku: "MN-10", name: "Full Zip Hoodie",             category: "Hoodies",   sizes: "S - 4XL",  colors: [NAVY], price: 89.99,  details: "#K122" },
  // SWAG
  { sku: "MN-11", name: "Men's Speckle Print Polo",    category: "SWAG",      sizes: "S - 3XL",  colors: [SOLACE_BLUE, NAVY, BLACK], price: 0, details: "FootJoy, #16324" },
  { sku: "MN-12", name: "Women's Speckle Print Polo",  category: "SWAG",      sizes: "XS - 2XL", colors: [SOLACE_BLUE, BLACK],       price: 0, details: "FootJoy, #96324" },
  { sku: "MN-13", name: "Yeti Rambler Straw Mug",      category: "SWAG",      sizes: "25 oz / 35 oz / 42 oz", colors: [NAVY],     price: 0, details: "YETI Rambler® Straw Mug" },
  { sku: "MN-14", name: "Yeti Tundra Cooler",          category: "SWAG",      sizes: "35L / 45L", colors: [NAVY],     price: 0, details: "YETI Tundra® Hard Cooler" },
  { sku: "MN-15", name: "Men's UA Tech Polo",          category: "SWAG",      sizes: "S - 4XL",   colors: [NAVY, BLACK, "#ffffff", "#b8b8b8", "#6b3fa0", "#c0392b", "#1e40af"], price: 55.00, details: "#1370399" },
  { sku: "MN-16", name: "Women's UA Tech Polo",        category: "SWAG",      sizes: "XS - 2XL",  colors: [NAVY, BLACK, "#ffffff", "#b8b8b8", "#6b3fa0", "#c0392b", "#1e40af"], price: 55.00, details: "#1370431" },
  // Port Authority Active Soft Shell — Jackets
  // (MN-18 is the brown laptop backpack — keep it; soft shells use MN-19 / MN-20)
  { sku: "MN-20", name: "Men's Active Soft Shell Jacket",   category: "Jackets", sizes: "XS - 6XL", colors: [BLACK, "#6e6e6e", NAVY], price: 0, details: "Port Authority, #J7603" },
  { sku: "MN-19", name: "Ladies' Active Soft Shell Jacket", category: "Jackets", sizes: "XS - 4XL", colors: [BLACK, "#6e6e6e", NAVY], price: 0, details: "Port Authority, #L7603" },
  // SWAG — pen
  { sku: "MN-21", name: "Mardi Gras Magic Pen",             category: "SWAG",    sizes: "One Size", colors: ["#00b5e2"], price: 0, details: "Push-retractable ballpoint, #416" },
  { sku: "MN-22", name: "Tranzip Recycled Computer Tote - Black", category: "New Hire Kit", sizes: "One Size", colors: [BLACK], price: 0, details: "Padded laptop sleeve, Double drop handles, Detachable adjustable shoulder strap, Exterior water bottle pocket, Tranzip, #2020-27" },
  { sku: "MN-23", name: "Eco Spiral Notebook with Pen - Blue", category: "New Hire Kit", sizes: "One Size", colors: ["#1e40af"], price: 0, details: "60 ruled cream sheets, Matching elastic pen loop, Ballpoint pen included, 5\" × 7\", Bullet, #SM-3468" },
  { sku: "MN-24", name: "2 Buds Pro Wireless ANC Earbuds - White", category: "New Hire Kit", sizes: "One Size", colors: ["#ffffff"], price: 0, details: "Active noise cancellation, Wireless charging case, Charging cable included, Handstands, #70300" },
  { sku: "MN-25", name: "New Hire Kit", category: "New Hire Kit", sizes: "One Size", colors: [], price: 0, details: "Tranzip recycled computer tote, Eco spiral notebook with pen, 2 Buds Pro wireless ANC earbuds" },
];

async function main() {
  const url = process.env.TURSO_URL || process.env.VITE_TURSO_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN || process.env.VITE_TURSO_AUTH_TOKEN;
  if (!url) { console.error("Missing TURSO_URL"); process.exit(1); }
  const db = createClient({ url, authToken });

  const existing = await db.execute({
    sql: "SELECT sku FROM products WHERE vendor = ?",
    args: [VENDOR],
  });
  const existingSkus = new Set(existing.rows.map((r: any) => String(r.sku)));
  console.log(`Existing ${VENDOR} products in DB: ${existingSkus.size}`);

  const maxOrder = await db.execute("SELECT COALESCE(MAX(sort_order), -1) AS m FROM products");
  let nextOrder = Number((maxOrder.rows[0] as any).m) + 1;

  let inserted = 0;
  let skipped = 0;
  for (const s of seeds) {
    if (existingSkus.has(s.sku)) {
      console.log(`  skip ${s.sku} (already exists)`);
      skipped++;
      continue;
    }
    await db.execute({
      sql: `INSERT INTO products (sku, name, category, sizes, badge, colors, price, img, imgs, material, details, pdf, sort_order, vendor)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        s.sku, s.name, s.category, s.sizes, "",
        JSON.stringify(s.colors), s.price,
        "", JSON.stringify([]),
        "", s.details, null, nextOrder, VENDOR,
      ],
    });
    console.log(`  insert ${s.sku} — ${s.name} ($${s.price.toFixed(2)}) sort_order=${nextOrder}`);
    nextOrder++;
    inserted++;
  }
  console.log(`Done: ${inserted} inserted, ${skipped} skipped.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
