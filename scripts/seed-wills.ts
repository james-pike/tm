import { createClient } from "@libsql/client";
import { config } from "dotenv";
import { readFileSync } from "fs";

config({ path: new URL("../.env", import.meta.url).pathname });

const VENDOR = "wills";

type Rec = {
  vendor: string;
  sku: string;
  name: string;
  category: string;
  sizes: string;
  badge: string;
  colors: string[];
  price: number;
  img: string;
  imgs: string[];
  material: string;
  details: string;
  pdf: string | null;
};

const recs: Rec[] = JSON.parse(
  readFileSync(new URL("./wills-products.json", import.meta.url).pathname, "utf8")
);

async function main() {
  const url = process.env.TURSO_URL || process.env.VITE_TURSO_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN || process.env.VITE_TURSO_AUTH_TOKEN;
  if (!url) {
    console.error("Missing TURSO_URL");
    process.exit(1);
  }
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
  for (const r of recs) {
    if (existingSkus.has(r.sku)) {
      console.log(`  skip ${r.sku} (already exists)`);
      skipped++;
      continue;
    }
    await db.execute({
      sql: `INSERT INTO products (sku, name, category, sizes, badge, colors, price, img, imgs, material, details, pdf, sort_order, vendor)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        r.sku,
        r.name,
        r.category,
        r.sizes,
        r.badge ?? "",
        JSON.stringify(r.colors ?? []),
        r.price,
        r.img ?? "",
        JSON.stringify(r.imgs ?? []),
        r.material ?? "",
        r.details ?? "",
        r.pdf ?? null,
        nextOrder,
        VENDOR,
      ],
    });
    console.log(`  insert ${r.sku} — ${r.name} ($${r.price}) [${r.category}] sort_order=${nextOrder}`);
    nextOrder++;
    inserted++;
  }
  console.log(`Done: ${inserted} inserted, ${skipped} skipped.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
