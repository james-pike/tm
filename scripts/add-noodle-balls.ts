import { createClient } from "@libsql/client";
import { config } from "dotenv";

config();

const db = createClient({
  url: process.env.TURSO_URL || process.env.VITE_TURSO_URL || "",
  authToken: process.env.TURSO_AUTH_TOKEN || process.env.VITE_TURSO_AUTH_TOKEN || undefined,
});

const product = {
  vendor: "modernniagara",
  sku: "MN-30",
  name: "Noodle Easy Distance Golf Balls (12) - White",
  category: "SWAG",
  sizes: "Pack of 12",
  badge: "",
  colors: JSON.stringify(["#ffffff"]),
  price: 34,
  img: "/noodle.jpeg",
  imgs: JSON.stringify(["/noodle.jpeg"]),
  material: "",
  details: [
    "Anti-sheer cover for added durability",
    "Explosive core with max compression for spring-like energy transfer at impact",
    "Cross-linked material construction",
    "Made to go and made to last",
  ].join(", "),
  pdf: null as string | null,
  sort_order: 54,
};

async function main() {
  await db.execute({
    sql: `INSERT INTO products (vendor, sku, name, category, sizes, badge, colors, price, img, imgs, material, details, pdf, sort_order)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      product.vendor,
      product.sku,
      product.name,
      product.category,
      product.sizes,
      product.badge,
      product.colors,
      product.price,
      product.img,
      product.imgs,
      product.material,
      product.details,
      product.pdf,
      product.sort_order,
    ],
  });

  const check = await db.execute({
    sql: "SELECT id, sku, name, category, price, img, imgs, sort_order FROM products WHERE sku = ? AND vendor = ?",
    args: [product.sku, product.vendor],
  });
  console.log("Inserted:");
  console.log(JSON.stringify(check.rows, null, 2));
}

main();
