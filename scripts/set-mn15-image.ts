import { createClient } from "@libsql/client";
import { config } from "dotenv";

config();

const db = createClient({
  url: process.env.TURSO_URL || process.env.VITE_TURSO_URL || "",
  authToken: process.env.TURSO_AUTH_TOKEN || process.env.VITE_TURSO_AUTH_TOKEN || undefined,
});

const SKU = "MN-15"; // Men's UA Tech Polo, #1370399
const NEW_IMG = "/uapolomodel.webp"; // sole image
const ORDER = ["/uapolomodel.webp"];

const before = await db.execute({
  sql: "SELECT sku, name, img, imgs FROM products WHERE vendor='modernniagara' AND sku=?",
  args: [SKU],
});
console.log("Before:");
for (const r of before.rows as any[]) console.log(`  ${r.sku} img=${r.img} imgs=${r.imgs}`);

if (before.rows.length !== 1) {
  console.error(`ABORT: expected exactly 1 row for ${SKU}, found ${before.rows.length}.`);
  process.exit(1);
}

await db.execute({
  sql: "UPDATE products SET img=?, imgs=? WHERE vendor='modernniagara' AND sku=?",
  args: [NEW_IMG, JSON.stringify(ORDER), SKU],
});

const after = await db.execute({
  sql: "SELECT sku, name, img, imgs FROM products WHERE vendor='modernniagara' AND sku=?",
  args: [SKU],
});
console.log("After:");
for (const r of after.rows as any[]) console.log(`  ${r.sku} img=${r.img} imgs=${r.imgs}`);
