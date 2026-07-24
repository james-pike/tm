import { createClient } from "@libsql/client";
import { config } from "dotenv";

config();

const db = createClient({
  url: process.env.TURSO_URL || process.env.VITE_TURSO_URL || "",
  authToken: process.env.TURSO_AUTH_TOKEN || process.env.VITE_TURSO_AUTH_TOKEN || undefined,
});

const SKU = "MN-20"; // Men's Soft Shell Jacket, Port Authority #J7603
const NEW_IMG = "/j7603model.webp";
const OLD_IMG = "/sku/mens-jacket.webp";

// Show current state
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

// New image first, the current one second. Preserve any further images already present.
const current = JSON.parse((before.rows[0] as any).imgs || "[]") as string[];
const rest = current.filter((p) => p !== NEW_IMG); // keep order, drop dupes of the new one
const newImgs = [NEW_IMG, ...rest];
// Make sure the old primary is in there
if (!newImgs.includes(OLD_IMG)) newImgs.splice(1, 0, OLD_IMG);

await db.execute({
  sql: "UPDATE products SET img=?, imgs=? WHERE vendor='modernniagara' AND sku=?",
  args: [NEW_IMG, JSON.stringify(newImgs), SKU],
});

const after = await db.execute({
  sql: "SELECT sku, name, img, imgs FROM products WHERE vendor='modernniagara' AND sku=?",
  args: [SKU],
});
console.log("After:");
for (const r of after.rows as any[]) console.log(`  ${r.sku} img=${r.img} imgs=${r.imgs}`);
