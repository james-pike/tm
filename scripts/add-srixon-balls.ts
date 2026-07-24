import { createClient } from "@libsql/client";
import { config } from "dotenv";

config();

const db = createClient({
  url: process.env.TURSO_URL || process.env.VITE_TURSO_URL || "",
  authToken: process.env.TURSO_AUTH_TOKEN || process.env.VITE_TURSO_AUTH_TOKEN || undefined,
});

const product = {
  vendor: "modernniagara",
  sku: "MN-27",
  name: "Srixon Q-Star Tour Golf Balls (6) - White",
  category: "SWAG",
  sizes: "Pack of 6",
  badge: "",
  colors: JSON.stringify(["#ffffff"]),
  price: 60,
  img: "/ball1.webp",
  imgs: JSON.stringify(["/ball1.webp", "/ball2.png", "/ball3.webp"]),
  material: "",
  details: [
    "Low compression tuned for moderate swing speeds",
    "Tour-level distance and greenside spin",
    "Soft feel with urethane cover",
    "3-piece construction",
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
