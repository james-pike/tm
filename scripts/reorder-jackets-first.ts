import { createClient } from "@libsql/client";
import { config } from "dotenv";

config();

const db = createClient({
  url: process.env.TURSO_URL || process.env.VITE_TURSO_URL || "",
  authToken: process.env.TURSO_AUTH_TOKEN || process.env.VITE_TURSO_AUTH_TOKEN || undefined,
});

// Move the Jackets ahead of the Shirts (10,11) in the "All" view, keeping their
// current relative order. Jackets currently sit at sort_order 20-24.
const JACKET_ORDER: Record<string, number> = {
  "MN-7": 4,
  "MN-9": 5,
  "MN-10": 6,
  "MN-20": 7,
  "MN-19": 8,
};

console.log("Before:");
const before = await db.execute(
  "SELECT sku, category, sort_order FROM products WHERE vendor='modernniagara' AND category IN ('Jackets','Shirts') ORDER BY sort_order ASC"
);
for (const r of before.rows as any[]) console.log(`  ${String(r.sort_order).padStart(3)}  ${r.sku} ${r.category}`);

for (const [sku, order] of Object.entries(JACKET_ORDER)) {
  await db.execute({
    sql: "UPDATE products SET sort_order=? WHERE vendor='modernniagara' AND sku=?",
    args: [order, sku],
  });
}

console.log("\nAfter:");
const after = await db.execute(
  "SELECT sku, category, sort_order FROM products WHERE vendor='modernniagara' AND category IN ('Jackets','Shirts') ORDER BY sort_order ASC"
);
for (const r of after.rows as any[]) console.log(`  ${String(r.sort_order).padStart(3)}  ${r.sku} ${r.category}`);
