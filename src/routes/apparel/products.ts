// AUTO-GENERATED — do not edit manually. Updated from database at build time.
import { t } from "../../i18n";
import type { Locale } from "../../i18n";

export const allProducts = [
  {
    "sku": "TM-1",
    "name": "ATC Everyday Cotton Tee",
    "category": "T-Shirts",
    "sizes": "S - 6XL",
    "badge": "",
    "colors": [
      "#1a1a18",
      "#b6e021"
    ],
    "price": 4,
    "img": "/skus/ATC1000.webp",
    "imgs": [
      "/skus/ATC1000.webp",
      "/skus/ATC1000-sg.jpg"
    ],
    "material": "100% cotton",
    "details": "Compacted yarns to minimize shrinkage, Taped neck and shoulders, Tear away label for private branding, Double needle cover stitch at collar/sleeve/hem, 1x1 rib knit collar, Classic fit, OEKO-TEX® STANDARD 100 certified, #ATC1000"
  },
  {
    "sku": "TM-2",
    "name": "ATC Everyday Cotton Long Sleeve Tee",
    "category": "T-Shirts",
    "sizes": "S - 4XL",
    "badge": "",
    "colors": [
      "#1a1a18",
      "#b6e021"
    ],
    "price": 6.8,
    "img": "",
    "imgs": [],
    "material": "100% cotton",
    "details": "100% cotton, 185 gsm, Compacted yarns to minimize shrinkage, Taped neck and shoulders, Tear away label for private branding, 1x1 rib knit collar, Rib knit cuffs, Double needle cover stitch at sleeve & bottom hem, Classic fit, OEKO-TEX® STANDARD 100 certified, #ATC1015"
  },
  {
    "sku": "TM-3",
    "name": "Surfer Full-Zip Hooded Sweatshirt - Black",
    "category": "Sweaters",
    "sizes": "XS - 4XL",
    "badge": "",
    "colors": [
      "#1a1a18"
    ],
    "price": 18.5,
    "img": "",
    "imgs": [],
    "material": "280 gsm, 8.3 oz/yd² (14 oz/lin. yd), 70% ring-spun combed cotton / 30% polyester fleece (heathers 60/40)",
    "details": "100% ring-spun combed cotton face for a superior print surface, Self-fabric lined hood with drawcord, Rib-knit cuff and hem, Kangaroo pocket, YKK zipper, Tear-away label, #L00555"
  },
  {
    "sku": "TM-4",
    "name": "ATC Pro Team Short Sleeve Tee",
    "category": "T-Shirts",
    "sizes": "XS - 4XL",
    "badge": "",
    "colors": [
      "#1a1a18",
      "#a5e82c"
    ],
    "price": 6,
    "img": "",
    "imgs": [],
    "material": "100% performance polyester interlock",
    "details": "100% performance polyester interlock with wicking technology, No Bleed Fabric (NBF) cationic dye process for easy printing, Side seamed, Breathable, Tagless, Classic fit, #S350"
  },
  {
    "sku": "TM-5",
    "name": "ATC Pro Team Short Sleeve Ladies' Tee",
    "category": "T-Shirts",
    "sizes": "XS - 4XL",
    "badge": "",
    "colors": [
      "#1a1a18",
      "#a5e82c"
    ],
    "price": 6,
    "img": "",
    "imgs": [],
    "material": "100% performance polyester interlock",
    "details": "128 gsm, 100% performance polyester interlock with wicking technology, No Bleed Fabric (NBF) cationic dye process for easy printing, Side seamed, Contoured fit, Breathable, Tagless, Classic fit, #L350"
  },
  {
    "sku": "TM-6",
    "name": "ATC Everyday Cotton Ladies' Tee",
    "category": "T-Shirts",
    "sizes": "XS - 4XL",
    "badge": "",
    "colors": [
      "#1a1a18",
      "#a5e82c"
    ],
    "price": 4,
    "img": "",
    "imgs": [],
    "material": "100% cotton",
    "details": "100% cotton, 185 gsm, Compacted yarns to minimize shrinkage, Taped neck and shoulders, Tear away label for private branding, Double needle cover stitch at collar/sleeve/hem, 1x1 rib knit collar, Side seamed, Contoured fit, Classic fit, OEKO-TEX® STANDARD 100 certified, #ATC1000L"
  },
  {
    "sku": "TM-7",
    "name": "Lakeview Ladies' Full-Zip Hooded Sweatshirt",
    "category": "Sweaters",
    "sizes": "XS - 2XL",
    "badge": "",
    "colors": [],
    "price": 32.5,
    "img": "",
    "imgs": [],
    "material": "80% cotton / 20% recycled polyester fleece, 330 gsm",
    "details": "330 gsm, 9.7 oz/yd², 80% cotton / 20% recycled polyester fleece, 3-ply fleece, 100% cotton face for superior print surface, Double layer hood lined with jersey, Contrast chevron tape at neck seam, Adjustable contrast flat draw cord, Double layer ribbed cuff and hem with spandex, YKK metal center front zipper, DTG printer friendly, #L00671"
  }
];

export type Product = typeof allProducts[0];

export const categories = ["All", ...Array.from(new Set(allProducts.map((p) => p.category)))];

export const badgeMap: Record<string, string> = { New: "badge.new", Popular: "badge.popular" };
export function badgeClass(badge: string) {
  return badge === "New" ? "product-card__badge product-card__badge--new" : "product-card__badge product-card__badge--popular";
}

const colorNames: Record<string, Record<string, string>> = {
  "#00703c": { en: "Green", fr: "Vert" },
  "#1a1a18": { en: "Black", fr: "Noir" },
  "#a5e82c": { en: "Lime Shock", fr: "Lime éclatant" },
  "#ffffff": { en: "White", fr: "Blanc" },
  "#2c3e50": { en: "Navy", fr: "Marine" },
  "#6e6e6e": { en: "Grey", fr: "Gris" },
  "#ff6600": { en: "Safety Orange", fr: "Orange sécurité" },
  "#94a3b8": { en: "Silver", fr: "Argent" },
  "#4a4a4a": { en: "Charcoal", fr: "Charbon" },
  "#6b8bb0": { en: "Solace Blue", fr: "Bleu Solace" },
  "#7dd3fc": { en: "Light Blue", fr: "Bleu clair" },
  "#b8b8b8": { en: "Grey Heather", fr: "Gris chiné" },
  "#6b3fa0": { en: "Purple", fr: "Violet" },
  "#c0392b": { en: "Red", fr: "Rouge" },
  "#1e40af": { en: "Royal", fr: "Bleu royal" },
  "#8a5d3b": { en: "Carhartt Brown", fr: "Brun Carhartt" },
  "#00b5e2": { en: "Sky Blue", fr: "Bleu ciel" },
  "#0047ab": { en: "Cobalt", fr: "Cobalt" },
  "#0f52ba": { en: "Sapphire", fr: "Saphir" },
  "#1b2a41": { en: "Navy", fr: "Marine" },
  "#1e4d2b": { en: "Forest Green", fr: "Vert forêt" },
  "#1f6f6f": { en: "Teal", fr: "Sarcelle" },
  "#2b2b2b": { en: "Charcoal", fr: "Charbon" },
  "#2c5aa0": { en: "Royal Blue", fr: "Bleu royal" },
  "#333333": { en: "Charcoal", fr: "Charbon" },
  "#33425b": { en: "Slate Blue", fr: "Bleu ardoise" },
  "#383838": { en: "Charcoal", fr: "Charbon" },
  "#3a3a3a": { en: "Charcoal", fr: "Charbon" },
  "#3a5bbf": { en: "Royal Blue", fr: "Bleu royal" },
  "#3a8fb7": { en: "Blue", fr: "Bleu" },
  "#3d4a63": { en: "Slate Blue", fr: "Bleu ardoise" },
  "#3f3f3f": { en: "Charcoal", fr: "Charbon" },
  "#4a2545": { en: "Plum", fr: "Prune" },
  "#4b5320": { en: "Olive", fr: "Olive" },
  "#4f6b45": { en: "Sage Green", fr: "Vert sauge" },
  "#585858": { en: "Grey", fr: "Gris" },
  "#5a2733": { en: "Maroon", fr: "Bordeaux" },
  "#5a5a5a": { en: "Grey", fr: "Gris" },
  "#5a6248": { en: "Olive", fr: "Olive" },
  "#5b6d7e": { en: "Slate", fr: "Ardoise" },
  "#5b7fa6": { en: "Steel Blue", fr: "Bleu acier" },
  "#5c1a2b": { en: "Maroon", fr: "Bordeaux" },
  "#5e2233": { en: "Maroon", fr: "Bordeaux" },
  "#6a6d70": { en: "Grey", fr: "Gris" },
  "#6b1f2a": { en: "Maroon", fr: "Bordeaux" },
  "#6b3f2a": { en: "Brown", fr: "Brun" },
  "#6b6a4a": { en: "Olive", fr: "Olive" },
  "#6b6f74": { en: "Grey", fr: "Gris" },
  "#6d2b3f": { en: "Maroon", fr: "Bordeaux" },
  "#6e7377": { en: "Grey", fr: "Gris" },
  "#6e8ca0": { en: "Steel Blue", fr: "Bleu acier" },
  "#7a3540": { en: "Maroon", fr: "Bordeaux" },
  "#7a7a7a": { en: "Grey", fr: "Gris" },
  "#7a8fa6": { en: "Steel Blue", fr: "Bleu acier" },
  "#7ba4d0": { en: "Light Blue", fr: "Bleu clair" },
  "#7c7a5e": { en: "Olive", fr: "Olive" },
  "#8a8a8a": { en: "Grey", fr: "Gris" },
  "#8c1d2c": { en: "Cardinal", fr: "Cardinal" },
  "#9b9b9b": { en: "Grey", fr: "Gris" },
  "#a0a0a0": { en: "Grey", fr: "Gris" },
  "#a6a6a6": { en: "Grey", fr: "Gris" },
  "#a8c4d8": { en: "Light Blue", fr: "Bleu clair" },
  "#a9682f": { en: "Brown", fr: "Brun" },
  "#b0b0b0": { en: "Grey", fr: "Gris" },
  "#b6e021": { en: "Safety Green", fr: "Vert sécurité" },
  "#b8ad97": { en: "Khaki", fr: "Kaki" },
  "#b98b8b": { en: "Rose", fr: "Rose" },
  "#bf5700": { en: "Burnt Orange", fr: "Orange brûlé" },
  "#c2a878": { en: "Tan", fr: "Beige" },
  "#c2c2c2": { en: "Light Grey", fr: "Gris clair" },
  "#c3a984": { en: "Tan", fr: "Beige" },
  "#c65b52": { en: "Coral", fr: "Corail" },
  "#c9b79c": { en: "Tan", fr: "Beige" },
  "#c9ccc9": { en: "Light Grey", fr: "Gris clair" },
  "#e3c9c9": { en: "Pink", fr: "Rose" },
  "#e8863b": { en: "Orange", fr: "Orange" },
  "#f2efe6": { en: "Natural", fr: "Naturel" },
  "#ff6a13": { en: "Orange", fr: "Orange" },
};
export function colorName(hex: string, locale: Locale): string {
  return colorNames[hex]?.[locale] || hex;
}

export function categoryLabel(cat: string, locale: Locale): string {
  if (cat === "All") return t("apparel.all", locale);
  const key = `cat.${cat}` as any;
  return t(key, locale);
}

export function expandSizes(sizes: string): string[] {
  if (sizes === "One Size") return ["One Size"];
  const order = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL"];
  const match = sizes.match(/^(\w+)\s*-\s*(\w+)$/);
  if (!match) return [sizes];
  const start = order.indexOf(match[1]);
  const end = order.indexOf(match[2]);
  if (start === -1 || end === -1) return [sizes];
  return order.slice(start, end + 1);
}
