import { component$, useSignal, useComputed$, useContext, $, useVisibleTask$, Slot } from "@builder.io/qwik";
import { Link, useLocation, useNavigate } from "@builder.io/qwik-city";
import { LocaleContext, t } from "../../i18n";
import { allProducts, categoryLabel, colorName } from "../../routes/apparel/products";
import type { Product } from "../../routes/apparel/products";
import { sizeGroups, sortColorsWhiteLast } from "../../routes/apparel/utils";
import { LoginTypeContext, stickyTop } from "../../routes/layout";
import { ProductImage } from "../product-image/product-image";

// The two desktop view modes. The toggle shows the one you'll switch TO.
// Labels are the single source for the button text, aria-label and title.
const VIEW_MODES: { key: number | "list"; label: string; icon: string }[] = [
  { key: 3, label: "Gallery", icon: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>' },
  { key: "list", label: "Catalog", icon: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="4" height="4"/><line x1="10" y1="6" x2="21" y2="6"/><rect x="3" y="10" width="4" height="4"/><line x1="10" y1="12" x2="21" y2="12"/><rect x="3" y="16" width="4" height="4"/><line x1="10" y1="18" x2="21" y2="18"/></svg>' },
];


export const CLOTHING_CATEGORIES = ["All", "T-Shirts", "Sweaters", "Polos", "Hats"];

// Electrical portal: shows ONLY these SKUs (the small Electrical-division lineup).
// Add/replace the Electrical SKU codes here — order is preserved in the grid.
// MN-36 = Carhartt FR Rigby Pants (104204), MN-37 = Carhartt FR Full Zip Hoodie
// (104982) — renamed off the old MNFR- prefix to match the catalog's MN- numbering.
// The FR Dearborn LS Tee (100235) isn't in the catalog yet — add it to the DB,
// then drop its SKU in here.
// Display order: T-Shirts, Sweaters, Pants, Headwear (matches the sidebar).
export const ELECTRICAL_SKUS: string[] = ["MN-38", "MN-40", "MN-36", "MN-39"];
const ELECTRICAL_SKU_SET = new Set(ELECTRICAL_SKUS);

// Safety catalog: every MNFR-* item plus a small allowlist of standard SKUs,
// minus a deny list for FR items we don't carry yet.
const SAFETY_SKU_PREFIX = "MNFR-";
const SAFETY_EXTRA_SKUS = new Set(["MN-2", "MN-3", "MN-5", "MN-6"]);
const SAFETY_HIDDEN_SKUS = new Set(["MNFR-5", "MNFR-6"]); // FR Insulated Bib & Jacket
export const SAFETY_CATEGORIES = ["All", "Flame Resistant", "Shirts", "Hats"];
// Explicit display order for the Safety "All" view: FR shirt + hoodies,
// FR pants, then the standard-SKU allowlist (short-sleeve tee,
// long-sleeve tee, ball cap, toque).
export const SAFETY_SKU_ORDER = ["MNFR-2", "MNFR-3", "MNFR-4", "MNFR-1", "MN-3", "MN-2", "MN-5", "MN-6"];
export const isSafetyProduct = (sku: string) =>
  !SAFETY_HIDDEN_SKUS.has(sku) && (sku.startsWith(SAFETY_SKU_PREFIX) || SAFETY_EXTRA_SKUS.has(sku));

// Colors hidden from catalog-card swatches (still visible on product detail page).
const CARD_HIDDEN_COLORS = new Set(["#c0392b", "#1e40af", "#6b3fa0"]);
// SKUs exempt from CARD_HIDDEN_COLORS: products where a normally-decluttered
// accent colour (e.g. red) is a first-class option and must show on the card.
// MN-33 offers Black / Red / White, so its red swatch stays.
const CARD_SHOW_ALL_COLORS = new Set(["MN-33"]);
const EMPTY_COLOR_SET = new Set<string>();

export const CATEGORY_ICONS: Record<string, string> = {
  "All": '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
  "Work Wear": '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4M16 2v4M4 6h16v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6z"/><path d="M4 6l-2 4v2h4V8"/><path d="M20 6l2 4v2h-4V8"/></svg>',
  "Jackets": '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2l5 6v12a2 2 0 01-2 2h-3V12h-6v10H6a2 2 0 01-2-2V8l5-6"/><path d="M9 2a3 3 0 006 0"/><line x1="12" y1="12" x2="12" y2="22"/></svg>',
  "Shirts": '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/></svg>',
  "Sweaters": '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 3 4 6 2 9.5 5 12v9h14v-9l3-2.5L20 6l-4.5-3-1.3 1.7a3.4 3.4 0 0 1-4.4 0z"/><path d="M9 4.2c.9 1.2 4.1 1.2 5 0"/></svg>',
  "Footwear": '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h3v8l7 2.5c1.5.5 2 1.4 2 2.5v2H4V6z"/><path d="M4 18h16"/><path d="M9 12l3 1"/></svg>',
  "Polos": '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.38 3.46L16 2 12 5.5 8 2 3.62 3.46a2 2 0 00-1.34 1.93v15.12a2 2 0 001.34 1.93L8 24l4-3.5L16 24l4.38-1.46a2 2 0 001.34-1.93V5.39a2 2 0 00-1.34-1.93z"/></svg>',
  "Hats": '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a7 7 0 00-7 7c0 3 2 5 3 6h8c1-1 3-3 3-6a7 7 0 00-7-7z"/><path d="M5 15h14"/><path d="M6 18h12"/></svg>',
  "SWAG": '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/></svg>',
  "New Hire Kit": '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>',
  "Flame Resistant": '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z"/><path d="M9 12l2 2 4-4"/></svg>',
  "Pants": '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h12l1 20h-5l-2-11-2 11H5L6 2z"/><path d="M6 2h12"/></svg>',
  "Headwear": '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 18h16"/><path d="M4 18a8 8 0 0116 0"/><path d="M2 18h20"/></svg>',
};

// Longer category names shown ONLY in the desktop sidebar column; mobile/tablet
// tabs keep the short cat.* labels (see the --short/--full spans + CSS).
export const FULL_CAT_KEYS: Record<string, string> = {};

// Search matcher for name/sku/category, with a simple plural fallback so
// "boots" still hits "Safety Boot" (names are singular, and the footwear
// categories are remapped to "Footwear" in the clothing catalog).
function matchesQuery(p: Product, q: string): boolean {
  const hay = `${p.name} ${p.sku} ${p.category}`.toLowerCase();
  if (hay.includes(q)) return true;
  return q.length > 3 && q.endsWith("s") && hay.includes(q.slice(0, -1));
}

// Return the category of the FIRST product that matches the search, so its tab
// can be highlighted as active (matches the cm storefront). "All" if nothing
// matches or the query is empty.
function categoryForQuery(query: string, products: Product[]): string {
  const q = query.trim().toLowerCase();
  if (!q) return "All";
  const match = products.find((p) => matchesQuery(p, q));
  return match ? match.category : "All";
}

// ---- Filter-sidebar facets (desktop) ----
// The data has no explicit gender/fit field, so derive it from the name.
// Check "women"/"ladies" first: "women's" contains "men's" as a substring.
function genderOf(p: Product): string {
  const n = p.name.toLowerCase();
  if (/\bwomen['’]?s?\b|ladies/.test(n)) return "Women";
  if (/\bmen['’]?s?\b/.test(n)) return "Men";
  return "Unisex";
}
const GENDER_ORDER = ["Men", "Women", "Unisex"];
// Letter sizes in range order; products store ranges like "S - 4XL".
const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"];
function sizeSpanOf(p: Product): string[] {
  const parts = p.sizes.split("-").map((s) => s.trim().toUpperCase().replace(/^(LADIES|UK)\s+/, ""));
  const a = SIZE_ORDER.indexOf(parts[0]);
  const b = SIZE_ORDER.indexOf(parts[1] ?? parts[0]);
  if (a !== -1 && b !== -1) return SIZE_ORDER.slice(a, b + 1);
  // Footwear ranges are numeric ("6 - 10", "UK 5 - 13"): enumerate whole sizes.
  // Suffixed ranges like "28 - 46 waist" parse as NaN and stay excluded.
  const lo = Number(parts[0]);
  const hi = Number(parts[1] ?? parts[0]);
  if (Number.isInteger(lo) && Number.isInteger(hi) && lo <= hi) {
    return Array.from({ length: hi - lo + 1 }, (_, i) => String(lo + i));
  }
  return [];
}
// Sizes for facets/filtering. Falls back to a "One Size" chip when the size
// string doesn't parse into a range — so one-size categories (hats, accessories)
// still show a Size filter group rather than an empty sidebar.
function sizesOf(p: Product): string[] {
  const s = sizeSpanOf(p);
  if (s.length) return s;
  return p.sizes === "One Size" ? ["One Size"] : [];
}
// Brands carried, in sidebar display order. A brand must be listed here to show
// up as a filter (the facet list is BRAND_LIST ∩ brands-present).
const BRAND_LIST = [
  "ATC", "Canada Sportswear", "Blundstone", "Coal Harbour", "Columbia", "Core365", "Devon & Jones",
  "DML", "Flexfit", "Harriton", "New Balance", "Nike", "Roots", "The North Face", "Timberland",
  "Under Armour",
];
// Brand overrides for products whose brand isn't in the display name (identified
// from the product spec / style code). Everything else is matched by name
// against BRAND_LIST.
const BRAND_BY_SKU: Record<string, string> = {
  "TM-3": "Canada Sportswear", // Surfer Full-Zip hoodie #L00555 (CSW L-series)
  "TM-7": "Canada Sportswear", // Women's Lakeview Full-Zip hoodie #L00671 (CSW)
  "TM-8": "Canada Sportswear", // Lakeview Adult Full-Zip hoodie #L00670 (CSW)
};
function brandOf(p: Product): string | null {
  if (BRAND_BY_SKU[p.sku]) return BRAND_BY_SKU[p.sku];
  const n = p.name.toLowerCase();
  for (const b of BRAND_LIST) if (n.includes(b.toLowerCase())) return b;
  return null;
}
// Scroll the product grid up so it pins just below the sticky tab bar, so the
// first results aren't hidden under it. Used by the category tabs and by search
// (auto-position, mirroring the cm storefront).
function scrollProductsBelowBar() {
  const isDesktop = window.innerWidth > 1024;
  const headerH = stickyTop();
  if (isDesktop) {
    const grid = document.querySelector('.home-catalog .apparel-grid');
    // The grid must clear BOTH sticky bars: the site header and the category
    // tab bar pinned beneath it. Offsetting only past the site header tucked
    // the first product row behind the tab bar on every tab switch.
    // MEASURED, not hardcoded: these heights are set in CSS and have changed
    // more than once. A stale constant here doesn't fail loudly — it just
    // parks the grid a few px under the tab bar, which reads as the bar
    // getting shorter on every tab switch.
    // Pin the grid to the tab bar's REAL pinned bottom = its own resolved `top`
    // plus its height. The bar pins at var(--wt-header-pin) - 1px on the home
    // route (a 1px seam overlap with the header), which is 1px ABOVE stickyTop()
    // (the header's bottom edge). Reconstructing barsBottom from stickyTop()
    // overshot by that 1px, landing the scroll a hair short of the pin — so the
    // bar un-stuck a fraction on every tab click (the visible desktop shift).
    // Reading the bar's own top absorbs the seam no matter how it's set.
    const bar = document.querySelector('.home-catalog__header') as HTMLElement | null;
    const barPin = bar ? (parseFloat(getComputedStyle(bar).top) || headerH) : headerH;
    const barsBottom = barPin + (bar?.offsetHeight ?? 50);
    const gridTop = grid ? grid.getBoundingClientRect().top + window.scrollY - barsBottom : 0;
    const needsScrollUp = gridTop < window.scrollY;
    window.scrollTo({ top: gridTop, behavior: needsScrollUp ? 'instant' : 'smooth' });
  } else {
    const catalog = document.querySelector('.home-catalog');
    const catalogTop = catalog ? catalog.getBoundingClientRect().top + window.scrollY : 0;
    // No extra offset — land exactly at the catalog's pinned top so there's no
    // few-px downward shift versus the initial (unscrolled) position.
    const stickyPos = catalogTop - headerH;
    window.scrollTo({ top: stickyPos, behavior: 'instant' });
  }
}

// Cards above the fold on a phone (2 columns): fetched eagerly so the first
// screen isn't waiting on the lazy loader. Everything after this loads as it
// scrolls into view — the "All" tab is 80+ products, and eager images meant
// 80+ requests and megabytes of photos on the first paint.
const EAGER_CARDS = 4;

const ProductCard = component$<{ item: Product; sku: string; index: number }>(({ item, sku, index }) => {
  const locale = useContext(LocaleContext);
  const loginType = useContext(LoginTypeContext);
  const isTech = loginType.value === "tech";
  const eager = index < EAGER_CARDS;

  // Fit-to-one-line: keep the title at its full size, but scale it down just
  // enough to avoid wrapping to a second line. If it still can't fit even at the
  // floor, fall back to wrapping rather than clipping.
  const nameRef = useSignal<HTMLElement>();
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => {
    const el = nameRef.value;
    if (!el) return;
    const fit = () => {
      el.style.fontSize = "";
      el.style.whiteSpace = "nowrap";
      el.style.overflow = "hidden";
      const base = parseFloat(getComputedStyle(el).fontSize);
      let px = base;
      const min = base * 0.62;
      let guard = 0;
      while (el.scrollWidth > el.clientWidth + 0.5 && px > min && guard++ < 40) {
        px -= 0.5;
        el.style.fontSize = `${px}px`;
      }
      if (el.scrollWidth > el.clientWidth + 0.5) {
        el.style.whiteSpace = "";
        el.style.overflow = "";
        el.style.fontSize = "";
      }
    };
    // Measure only after the grid has laid out and web fonts have loaded —
    // measuring too early reports no overflow and the title stays wrapped.
    const run = () => requestAnimationFrame(() => requestAnimationFrame(fit));
    run();
    if ((document as any).fonts?.ready) (document as any).fonts.ready.then(run);
    window.addEventListener("resize", run);
    cleanup(() => window.removeEventListener("resize", run));
  });

  // Effective hidden-colour set for THIS product — empty when the SKU is exempt
  // (so all its colours render), otherwise the global declutter set.
  const hiddenColors = CARD_SHOW_ALL_COLORS.has(sku) ? EMPTY_COLOR_SET : CARD_HIDDEN_COLORS;

  const allColors = item.colors || [];
  const shownColors = allColors.filter((c) => !hiddenColors.has(c));
  const visibleColors = sortColorsWhiteLast(shownColors.length ? shownColors : allColors);
  const singleColorName =
    visibleColors.length === 1
      ? (visibleColors[0].startsWith("#") ? colorName(visibleColors[0], locale.value) : visibleColors[0])
      : null;
  // The product name is authored in English, so strip the trailing "- Colour"
  // using the ENGLISH label — singleColorName may be localized (e.g. French),
  // which wouldn't match the English suffix and left the colour on the title.
  const singleColorEn =
    visibleColors.length === 1
      ? (visibleColors[0].startsWith("#") ? colorName(visibleColors[0], "en") : visibleColors[0])
      : null;
  // Title: drop the model code, the gender prefix, and — when there's a single
  // colour — the trailing "- Colour" (it's shown beside the swatch instead).
  let displayName = item.name.replace(/#\S+/g, "").replace(/^(men|women|ladies|unisex)['’]?s?\s+/i, "");
  if (singleColorEn) {
    displayName = displayName.replace(new RegExp(`\\s*[-–]\\s*${singleColorEn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i"), "");
  }
  displayName = displayName.trim();

  return (
    <Link href={`/${sku}/`} class={`product-card product-card-link ${sku === "CAR-21" ? "product-card--cover" : ""}`}>
      <div class="product-card__image">
        <ProductImage
          src={item.img}
          alt={item.name}
          width={440}
          height={440}
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : "auto"}
        />
      </div>
      <div class="product-card__info">
        <div class="product-card__name-row">
          <div class="product-card__name" ref={nameRef}>
            {(() => {
              const g = genderOf(item);
              // Desktop-only gender prefix on the title (CSS hides it below 1025
              // and hides the sizes-row gender span above it). Mobile/tablet keep
              // the gender in the sizes row exactly as before.
              return g === "Men" || g === "Women" ? (
                <span class="product-card__name-gender">{t(g === "Men" ? "gender.mens" : "gender.womens", locale.value)} </span>
              ) : null;
            })()}
            <span class="product-card__name-text">{displayName}</span>
            <span class="product-card__name-code">{(item.name.match(/#\S+/) || [''])[0]}</span>
          </div>
          <div class="product-card__price-group">
            {!isTech && (() => {
              const p = Number(item.price) || 0;
              const dollars = Math.floor(p);
              const cents = Math.round((p - dollars) * 100).toString().padStart(2, "0");
              return (
                <div class="product-card__price">
                  ${dollars}
                  {cents !== "00" && (
                    <span class="product-card__price-cents">.{cents}</span>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
        {item.name === "New Hire Kit" ? (
          // The bundle: no colour/size, so use that gray text area to list the
          // kit's contents (same size/colour as the sizes text).
          <div class="product-card__color-size-row">
            <span class="product-card__sizes product-card__kit-items">
              {item.details.split(",").map((it, i) => (
                <span key={i}>{it.trim()}</span>
              ))}
            </span>
          </div>
        ) : (
          <div class="product-card__color-size-row">
            {(() => {
              const all = item.colors || [];
              const shown = all.filter((c) => !hiddenColors.has(c));
              // If every colour got hidden (e.g. a single-colour product whose one
              // colour is in the declutter list, like the Royal-blue notebook),
              // fall back to the product's own colours so its swatch still shows.
              const visible = sortColorsWhiteLast(shown.length ? shown : all);
              // Cap the swatches at 4; beyond that a "+N" chip stands in for the
              // rest, so a product with many colours doesn't spill a long row of
              // dots across the card.
              const MAX_DOTS = 4;
              const dots = visible.slice(0, MAX_DOTS);
              const extra = visible.length - dots.length;
              return visible.length > 0 ? (
                <div class="product-card__colors">
                  {dots.map((c) => (
                    <span
                      key={c}
                      class="product-card__color-dot"
                      style={{ background: c }}
                      aria-hidden="true"
                    />
                  ))}
                  {extra > 0 && (
                    <span class="product-card__color-more" aria-label={`+${extra} more colours`}>+{extra}</span>
                  )}
                  {singleColorName && <span class="product-card__color-name">{singleColorName}</span>}
                </div>
              ) : <span />;
            })()}
            {(() => {
              const g = genderOf(item);
              return g === "Men" || g === "Women" ? <span class="product-card__gender">{t(g === "Men" ? "gender.mens" : "gender.womens", locale.value)}</span> : null;
            })()}
            {/* Fits shown beside each other on one line — regular plus any extra
                variant (Tall/Short) the SKU carries. The " / " separator between
                lines comes from CSS (.product-card__sizes-line + …::before). */}
            <span class="product-card__sizes">
              {(item.sizes === "One Size" ? [t("modal.onesize", locale.value)] : sizeGroups(item.sizes)).map((g) => (
                <span key={g} class="product-card__sizes-line">{g}</span>
              ))}
            </span>
            {/* Colour names as text. Hidden in every mode but desktop Catalog,
                where the wide horizontal card leaves the bottom-right corner
                empty and swatches would be lost against the small thumbnail. */}
            {(() => {
              const all = item.colors || [];
              const shown = all.filter((c) => !hiddenColors.has(c));
              const visible = sortColorsWhiteLast(shown.length ? shown : all);
              if (!visible.length) return null;
              // List up to 4 colour names; if there are more, a ", +N" indicator
              // stands in for the rest rather than a truncated run-on list.
              const MAX_NAMES = 4;
              const names = visible
                .slice(0, MAX_NAMES)
                .map((c) => (c.startsWith("#") ? colorName(c, locale.value) : c));
              const extra = visible.length - MAX_NAMES;
              return (
                <span class="product-card__colors-text">
                  {names.join(", ")}{extra > 0 ? `, +${extra}` : ""}
                </span>
              );
            })()}
          </div>
        )}
      </div>
    </Link>
  );
});

export const ProductCatalog = component$<{ class?: string }>(({ "class": cls }) => {
  const locale = useContext(LocaleContext);
  const loginType = useContext(LoginTypeContext);
  const loc = useLocation();
  const nav = useNavigate();
  // On a product route (/<sku>/) the shared shell shows the routed product
  // detail (<Slot/>) in the main column instead of the grid. The catalog is "/";
  // any deeper path under this (shop) layout is a product page. The sidebar +
  // header stay mounted, so there is no shift between the catalog and PDP.
  const isPdp = useComputed$(() => loc.url.pathname.replace(/\/+$/, "") !== "");
  const isTech = useComputed$(() => loginType.value === "tech");
  const isSafety = useComputed$(() => loginType.value === "safety");
  const isElectrical = useComputed$(() => loginType.value === "electrical");
  const isSingleCat = useComputed$(() => isTech.value);
  const activeCat = useSignal("All");
  const searchQuery = useSignal("");
  // Mobile tab strip: true once scrolled to the end (flips the chevron cue).
  const tabsAtEnd = useSignal(false);
  // Center the active category tab in the scrollable strip. The double rAF
  // waits out the render that applies the .active class after a signal change.
  const centerActiveTab = $(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      document
        .querySelector(".home-catalog__tabs .apparel-titlebar__tab.active")
        ?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }));
  });
  const searchOpen = useSignal(false); // tablet: search field opens over the tab bar
  const tabletCols = useSignal<number | "list">(3);
  // Desktop grid density: false = default (5 per row), true = Catalog view (8 per
  // row). Toggled from the sidebar; ignored on mobile/tablet.
  const denseGrid = useSignal(false);
  // Persist the density choice (shared with the PDP sidebar's toggle) so it
  // survives navigation between the catalog and the product pages.
  const densityLoaded = useSignal(false);
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track }) => {
    const v = track(() => denseGrid.value);
    if (!densityLoaded.value) {
      densityLoaded.value = true;
      try { const s = localStorage.getItem("ce_grid_density"); if (s) denseGrid.value = s === "catalog"; } catch { /* ignore */ }
      return;
    }
    try { localStorage.setItem("ce_grid_density", v ? "catalog" : "standard"); } catch { /* ignore */ }
  });

  const HASH_TO_CAT: Record<string, string> = isSingleCat.value
    ? {}
    : isSafety.value
      ? { "shirts": "Shirts", "hats": "Hats", "fr": "Flame Resistant" }
      // Derive from the tab list so EVERY clothing category (Polos, Sweaters, …)
      // is reachable by hash — the old hardcoded map omitted Polos/Sweaters, so
      // the breadcrumb crumb (#polos) found no match and fell back to All. Keyed
      // exactly the way the crumb builds its hash: lower-case, spaces → hyphens.
      : Object.fromEntries(
          CLOTHING_CATEGORIES
            .filter((c) => c !== "All")
            .map((c) => [c.toLowerCase().replace(/\s+/g, "-"), c])
        );

  const baseProducts = useComputed$(() => {
    if (isElectrical.value) {
      // Electrical membership is DB-driven (products.portals includes
      // "electrical"), falling back to the legacy hardcoded ELECTRICAL_SKUS so
      // nothing breaks until every row is backfilled. Order: legacy SKUs keep
      // their curated ELECTRICAL_SKUS order first; DB-only additions follow in
      // sort_order (their order in allProducts).
      const inElectrical = (p: (typeof allProducts)[number]) =>
        (p as { portals?: string[] }).portals?.includes("electrical") ||
        ELECTRICAL_SKU_SET.has(p.sku);
      const rank = (sku: string) => {
        const i = ELECTRICAL_SKUS.indexOf(sku);
        return i === -1 ? ELECTRICAL_SKUS.length : i;
      };
      return allProducts
        .filter(inElectrical)
        .slice()
        .sort((a, b) => rank(a.sku) - rank(b.sku));
    }
    if (isTech.value) return allProducts.filter((p) => p.category === "Work Wear");
    if (isSafety.value) {
      const rank = (sku: string) => {
        const i = SAFETY_SKU_ORDER.indexOf(sku);
        return i === -1 ? SAFETY_SKU_ORDER.length : i;
      };
      return allProducts
        .filter((p) => isSafetyProduct(p.sku))
        .slice()
        .sort((a, b) => rank(a.sku) - rank(b.sku));
    }
    // Clothing catalog: group the footwear products (safety boots + shoes) under
    // the "Footwear" tab so they show when it's selected.
    const isFootwear = (c: string) => c === "Safety Boots" || c === "Safety Shoes" || c === "Footwear";
    return allProducts
      // Exclude FR items and the Electrical-only SKUs from the full (Service) catalog.
      .filter((p) => p.category !== "Flame Resistant" && !ELECTRICAL_SKU_SET.has(p.sku))
      .map((p) => (isFootwear(p.category) ? { ...p, category: "Footwear" } : p));
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => {
    const applyHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (hash && HASH_TO_CAT[hash]) {
        activeCat.value = HASH_TO_CAT[hash];
        history.replaceState(null, "", window.location.pathname);
        centerActiveTab();
      }
    };
    const onSelectCategory = (e: Event) => {
      const cat = (e as CustomEvent).detail;
      if (cat) {
        activeCat.value = cat;
        searchQuery.value = "";
        centerActiveTab();
      }
    };
    // The phone search input lives in the site header (layout.tsx); it relays
    // keystrokes here via this event. Mirrors the desktop input: live filter +
    // highlight the tab of the first matching result.
    const onExternalSearch = (e: Event) => {
      const q = ((e as CustomEvent).detail ?? "") as string;
      searchQuery.value = q;
      activeCat.value = categoryForQuery(q, baseProducts.value);
      // Reposition the catalog under the tabs on every keystroke so results stay
      // at the right scroll height while search is active. Safe now that the
      // header is pinned to the visual viewport during search.
      if (q.trim()) scrollProductsBelowBar();
    };
    // Opening the search (header icon) scrolls the catalog up so the sticky tab
    // bar pins under the header and products sit right below the search bar —
    // important on the home/hero route where search may be opened from the
    // hero cover before the catalog has scrolled into its sticky position.
    const onSearchOpen = () => {
      // Only needed when search is opened from ABOVE the catalog (e.g. the hero
      // cover): scroll down so the sticky tab bar pins under the header. If the
      // catalog is already scrolled into its sticky position, do nothing —
      // re-scrolling while the keyboard opens leaves a gap above the tabs.
      const catalog = document.querySelector(".home-catalog") as HTMLElement | null;
      if (!catalog) return;
      const headerH = window.innerWidth < 601 ? 64 : window.innerWidth <= 1024 ? 67 : 66;
      const stickyPos = catalog.getBoundingClientRect().top + window.scrollY - headerH;
      // Only scroll for a MEANINGFUL gap (the hero case). The hardcoded headerH
      // drifts a few px from the catalog's real pinned top, so the old +2 fudge
      // and 1px threshold nudged the page ~5px on every open on /apparel/, where
      // the strip is already pinned. An 8px threshold absorbs that drift; the
      // genuine hero reposition is far larger and still fires.
      if (window.scrollY < stickyPos - 8) {
        requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo({ top: stickyPos, behavior: "instant" })));
      }
    };
    // Header search Enter: the committed query's tab may be off-screen in the
    // scrollable strip — center it now (live keystrokes deliberately don't).
    const onSearchCommit = () => { centerActiveTab(); };
    // A search relayed from another route (e.g. the header search on a product
    // page) arrives as ?q=. Apply it once on mount, then strip it from the URL
    // so a later refresh doesn't re-pin the filter.
    const applyQuery = () => {
      const q = new URLSearchParams(window.location.search).get("q");
      if (q) {
        searchQuery.value = q;
        activeCat.value = categoryForQuery(q, baseProducts.value);
        history.replaceState(null, "", window.location.pathname);
        centerActiveTab();
        scrollProductsBelowBar();
      }
    };
    applyHash();
    applyQuery();
    window.addEventListener("hashchange", applyHash);
    window.addEventListener("select-category", onSelectCategory);
    window.addEventListener("apparel-search", onExternalSearch);
    window.addEventListener("apparel-search-commit", onSearchCommit);
    window.addEventListener("apparel-search-open", onSearchOpen);
    cleanup(() => {
      window.removeEventListener("hashchange", applyHash);
      window.removeEventListener("select-category", onSelectCategory);
      window.removeEventListener("apparel-search", onExternalSearch);
      window.removeEventListener("apparel-search-commit", onSearchCommit);
      window.removeEventListener("apparel-search-open", onSearchOpen);
    });
  });

  const doSearch = $((query: string) => {
    if (query.trim()) {
      activeCat.value = categoryForQuery(query, baseProducts.value);
      searchQuery.value = query.trim();
      scrollProductsBelowBar();
      // Committed search: bring the highlighted category's tab into view.
      centerActiveTab();
    } else {
      searchQuery.value = "";
    }
  });

  // "New Hire Kit" is always shown even before any products are tagged into it.
  const ALWAYS_SHOW = new Set(["All", "New Hire Kit"]);

  const visibleCategories = useComputed$(() => {
    if (isTech.value) return ["Work Wear"];
    // Electrical: show every category its products actually span (not limited to
    // the standard clothing tabs).
    if (isElectrical.value) {
      const order = ["Shirts", "Sweaters", "Pants", "Headwear", "Work Wear", "Jackets", "Polos", "Hats", "SWAG", "Flame Resistant"];
      const present = new Set(baseProducts.value.map((p) => p.category));
      const cats = order.filter((c) => present.has(c));
      for (const c of present) if (!cats.includes(c)) cats.push(c);
      return ["All", ...cats];
    }
    // Safety still hides empty categories; the clothing catalog shows its full
    // curated tab list regardless of current stock.
    if (isSafety.value) {
      const present = new Set(baseProducts.value.map((p) => p.category));
      return SAFETY_CATEGORIES.filter((c) => ALWAYS_SHOW.has(c) || present.has(c));
    }
    return CLOTHING_CATEGORIES;
  });

  // SKU count per category (from the unfiltered base set) for the sidebar
  // count pills; "All" is the total.
  const categoryCounts = useComputed$(() => {
    const counts: Record<string, number> = { All: baseProducts.value.length };
    for (const p of baseProducts.value) counts[p.category] = (counts[p.category] ?? 0) + 1;
    return counts;
  });

  // Select a category from the desktop sidebar nav (no tab-strip centering — the
  // vertical list is always fully visible). Mirrors the horizontal tab onClick.
  const selectCat = $(async (cat: string) => {
    if (isSingleCat.value) return;
    window.dispatchEvent(new CustomEvent("apparel-search-clear"));
    searchOpen.value = false;
    searchQuery.value = "";
    if (isPdp.value) {
      // On a product page the grid isn't shown. Go to the catalog filtered to
      // this category — ProductCatalog stays mounted (shared shell), so setting
      // activeCat here carries the selection over to the grid.
      activeCat.value = cat;
      await nav("/");
      return;
    }
    if (activeCat.value === cat) { activeCat.value = "All"; scrollProductsBelowBar(); return; }
    activeCat.value = cat;
    scrollProductsBelowBar();
  });


  // Sidebar filters, tagged with the category they were set for — switching
  // category makes them stale (ignored) without needing a reset hook.
  const filters = useSignal<{ cat: string; genders: string[]; sizes: string[]; brands: string[] }>(
    { cat: "All", genders: [], sizes: [], brands: [] },
  );
  const effFilters = useComputed$(() =>
    filters.value.cat === activeCat.value
      ? filters.value
      : { cat: activeCat.value, genders: [], sizes: [], brands: [] },
  );
  // Facet options offered by the sidebar, from the selected category's
  // products (pre-filter, so picking one option doesn't hide its siblings).
  const facetOptions = useComputed$(() => {
    const inCat = activeCat.value === "All"
      ? baseProducts.value
      : baseProducts.value.filter((p) => p.category === activeCat.value);
    const genders = new Set(inCat.map(genderOf));
    const sizes = new Set(inCat.flatMap((p) => sizesOf(p)));
    const brands = new Set(inCat.map(brandOf).filter(Boolean) as string[]);
    // Letter sizes first (in range order), then numeric shoe sizes ascending.
    const shoeSizes = [...sizes]
      .filter((s) => !SIZE_ORDER.includes(s))
      .sort((x, y) => Number(x) - Number(y));
    // Headwear (Hats) and the Office/New Hire Kit have no gendered fit, so the
    // Fit facet is suppressed for those categories.
    const NO_FIT_CATS = new Set(["Hats", "New Hire Kit"]);
    return {
      genders: NO_FIT_CATS.has(activeCat.value) ? [] : GENDER_ORDER.filter((g) => genders.has(g)),
      sizes: [...SIZE_ORDER.filter((s) => sizes.has(s)), ...shoeSizes],
      brands: BRAND_LIST.filter((b) => brands.has(b)),
    };
  });

  const filtered = useComputed$(() => {
    const products = baseProducts.value;
    const f = effFilters.value;
    const applyFacets = (list: Product[]) => {
      let out = list;
      if (f.genders.length) out = out.filter((p) => f.genders.includes(genderOf(p)));
      if (f.sizes.length) out = out.filter((p) => sizesOf(p).some((s) => f.sizes.includes(s)));
      if (f.brands.length) out = out.filter((p) => f.brands.includes(brandOf(p) || ""));
      return out;
    };

    if (searchQuery.value) {
      const q = searchQuery.value.toLowerCase();
      return applyFacets(products.filter((p) => matchesQuery(p, q)));
    }

    if (activeCat.value !== "All") {
      return applyFacets(products.filter((p) => p.category === activeCat.value));
    }

    return applyFacets(products);
  });

  return (
    <section class={`home-catalog ${isElectrical.value ? "home-catalog--electrical" : ""} ${cls || ""}`}>
      <div class="home-catalog__inner">
        <div class={`home-catalog__header ${tabsAtEnd.value ? "home-catalog__header--tabs-end" : ""}`}>
          <h2 class="home-catalog__title">{t("nav.apparel", locale.value)}</h2>
          {/* Desktop view mode: Catalog (tall photo-led cards) vs Gallery (short
              horizontal rows, thumbnail left). Two modes, so a toggle — the
              button shows the mode it will switch to. */}
          <button
            class="home-catalog__viewmode"
            aria-label={`Show ${(tabletCols.value === "list" ? VIEW_MODES[0] : VIEW_MODES[1]).label.toLowerCase()} view`}
            title={`${(tabletCols.value === "list" ? VIEW_MODES[0] : VIEW_MODES[1]).label} view`}
            onClick$={() => {
              tabletCols.value = tabletCols.value === "list" ? 3 : "list";
              // The card heights change between modes, so the old scroll offset
              // lands mid-product — re-pin the grid to the top of the list.
              requestAnimationFrame(() => requestAnimationFrame(() => scrollProductsBelowBar()));
            }}
          >
            <span class="home-catalog__viewmode-icon" dangerouslySetInnerHTML={(tabletCols.value === "list" ? VIEW_MODES[0] : VIEW_MODES[1]).icon} />
            <span class="home-catalog__viewmode-label">{tabletCols.value === "list" ? t("viewmode.gallery", locale.value) : t("viewmode.catalog", locale.value)}</span>
          </button>
          <div class="home-catalog__sidebar-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            <input
              type="text"
              class="apparel-titlebar__search-input"
              placeholder=""
              aria-label="Search apparel"
              value={searchQuery.value}
              onInput$={(_, el) => { searchQuery.value = el.value; activeCat.value = categoryForQuery(el.value, baseProducts.value); }}
              onKeyDown$={(e) => { if (e.key === "Enter") doSearch(searchQuery.value); }}
              onBlur$={() => doSearch(searchQuery.value)}
            />
          </div>
          <div
            class="home-catalog__tabs"
            onScroll$={(_, el) => {
              tabsAtEnd.value = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
            }}
          >
            {visibleCategories.value.map((cat) => (
              <button
                key={cat}
                class={`apparel-titlebar__tab ${isSingleCat.value || activeCat.value === cat ? "active" : ""}`}
                onClick$={(_, el) => {
                  if (isSingleCat.value) return;
                  // Center the tapped tab in the scrollable strip so an
                  // edge tap reveals the neighboring categories (no-op when
                  // the strip doesn't overflow, e.g. desktop).
                  el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
                  // Changing category clears + exits the search (header + tab bar).
                  window.dispatchEvent(new CustomEvent("apparel-search-clear"));
                  searchOpen.value = false;
                  if (activeCat.value === cat) { activeCat.value = "All"; searchQuery.value = ""; scrollProductsBelowBar(); return; }
                  activeCat.value = cat;
                  searchQuery.value = "";
                  scrollProductsBelowBar();
                }}
              >
                <span class="apparel-titlebar__tab-icon" dangerouslySetInnerHTML={CATEGORY_ICONS[cat]} />
                {cat === "All" ? t("apparel.all", locale.value) : (
                  <>
                    <span class="apparel-titlebar__tab-short">{categoryLabel(cat, locale.value)}</span>
                    {/* Tablet-only label: shorter for "New Hire Kit" (Office Kit)
                        so it fits the tablet tab row; same as short elsewhere. */}
                    <span class="apparel-titlebar__tab-tablet">{categoryLabel(cat, locale.value)}</span>
                    <span class="apparel-titlebar__tab-full">{FULL_CAT_KEYS[cat] ? t(FULL_CAT_KEYS[cat] as any, locale.value) : categoryLabel(cat, locale.value)}</span>
                  </>
                )}
              </button>
            ))}
          </div>
          <div class="home-catalog__right">
            <div class="apparel-titlebar__search home-catalog__search-desktop">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <input
                type="text"
                class="apparel-titlebar__search-input"
                placeholder=""
                aria-label="Search apparel"
                value={searchQuery.value}
                onInput$={(_, el) => { searchQuery.value = el.value; activeCat.value = categoryForQuery(el.value, baseProducts.value); }}
                onKeyDown$={(e) => { if (e.key === "Enter") doSearch(searchQuery.value); }}
                onBlur$={() => doSearch(searchQuery.value)}
              />
            </div>
            {/* Tablet column-count toggle. The mobile/tablet search input now
                lives in the site header (see layout.tsx) so it no longer
                crowds the category tab strip. */}
            {/* Tablet view toggle: 3-per-row ↔ list (catalog) only — no 2-per-row.
                The icon shown is the view you'll switch TO next. */}
            <button
              class="apparel-titlebar__action apparel-titlebar__action--tablet-cols"
              aria-label={tabletCols.value === 3 ? "Show list view" : "Show 3 per row"}
              onClick$={() => {
                tabletCols.value = tabletCols.value === 3 ? "list" : 3;
                requestAnimationFrame(() => requestAnimationFrame(() => scrollProductsBelowBar()));
              }}
            >
              {tabletCols.value === 3 ? (
                // next: list view — rows with a thumbnail + detail lines
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="4" height="4"/><line x1="10" y1="6" x2="21" y2="6"/><rect x="3" y="10" width="4" height="4"/><line x1="10" y1="12" x2="21" y2="12"/><rect x="3" y="16" width="4" height="4"/><line x1="10" y1="18" x2="21" y2="18"/></svg>
              ) : (
                // next: 3 per row
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="5" height="18"/><rect x="9.5" y="3" width="5" height="18"/><rect x="16" y="3" width="5" height="18"/></svg>
              )}
            </button>
            {/* Tablet: search icon opens a field over the tab bar (cm-style),
                so search no longer needs a slot in the site header. */}
            <button class="apparel-titlebar__action apparel-titlebar__action--tabbar-search" aria-label="Search" onClick$={() => (searchOpen.value = true)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            </button>
          </div>
          {searchOpen.value && (
            <div class="home-catalog__tabbar-search">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <input
                type="text"
                class="apparel-titlebar__search-input"
                placeholder=""
                aria-label="Search apparel"
                value={searchQuery.value}
                onInput$={(_, el) => { searchQuery.value = el.value; activeCat.value = categoryForQuery(el.value, baseProducts.value); }}
                onKeyDown$={(e) => { if (e.key === "Enter") doSearch(searchQuery.value); if (e.key === "Escape") { searchQuery.value = ""; searchOpen.value = false; } }}
              />
              <button class="home-catalog__tabbar-search-close" aria-label="Close search" onClick$={() => { doSearch(searchQuery.value); searchOpen.value = false; }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
              </button>
            </div>
          )}
          {/* Mobile/tablet: the white stroke cut across the sign at the tab
              bar's bottom edge, matching the one under the header bar. Both of
              this element's pseudos are taken by the scroll cue, so the stroke
              needs its own node. */}
          <span class="home-catalog__seam" aria-hidden="true" />
        </div>
        <aside class="home-catalog__filters" aria-label="Filter products">
          {/* Desktop category nav — the collection titles moved out of the
              horizontal tab strip into a vertical sidebar list (sm-style), each
              with a SKU count pill. The tab strip stays for mobile/tablet. */}
          {!isSingleCat.value && (
            <nav class="home-catalog__catnav" aria-label="Collections">
              <div class="home-catalog__catnav-head">
                <div class="home-catalog__catnav-title">{isElectrical.value ? t("login.portal.electrical", locale.value) : t("filter.collections", locale.value)}</div>
                {/* Grid-density toggle, inline on the right of the Collections
                    label — icon-only (Standard 5-up / Catalog 8-up). Hidden for
                    the Electrical shop — too few products to need it. */}
                {!isElectrical.value && (
                <div class="home-catalog__density home-catalog__density--inline" role="group" aria-label="Grid density">
                  <button
                    type="button"
                    class={`home-catalog__density-btn ${!denseGrid.value ? "active" : ""}`}
                    aria-pressed={!denseGrid.value}
                    aria-label={t("viewmode.standard", locale.value)}
                    onClick$={() => { denseGrid.value = false; }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                  </button>
                  <button
                    type="button"
                    class={`home-catalog__density-btn ${denseGrid.value ? "active" : ""}`}
                    aria-pressed={denseGrid.value}
                    aria-label={t("viewmode.catalog", locale.value)}
                    onClick$={() => { denseGrid.value = true; }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="4" height="4"/><rect x="10" y="3" width="4" height="4"/><rect x="17" y="3" width="4" height="4"/><rect x="3" y="10" width="4" height="4"/><rect x="10" y="10" width="4" height="4"/><rect x="17" y="10" width="4" height="4"/><rect x="3" y="17" width="4" height="4"/><rect x="10" y="17" width="4" height="4"/><rect x="17" y="17" width="4" height="4"/></svg>
                  </button>
                </div>
                )}
              </div>
              {visibleCategories.value.map((cat) => (
                <button
                  key={cat}
                  class={`home-catalog__catnav-item ${activeCat.value === cat ? "active" : ""}`}
                  onClick$={() => selectCat(cat)}
                >
                  <span class="home-catalog__catnav-icon" dangerouslySetInnerHTML={CATEGORY_ICONS[cat]} />
                  <span class="home-catalog__catnav-label">
                    {cat === "All"
                      ? t("apparel.all", locale.value)
                      : (FULL_CAT_KEYS[cat] ? t(FULL_CAT_KEYS[cat] as any, locale.value) : categoryLabel(cat, locale.value))}
                  </span>
                  <span class="home-catalog__catnav-count">{categoryCounts.value[cat] ?? 0}</span>
                </button>
              ))}
            </nav>
          )}
          {!isPdp.value && !isElectrical.value && facetOptions.value.genders.length >= 1 && (
            <div class="home-catalog__filter-group">
              <div class="home-catalog__filter-title">{t("filter.fit", locale.value)}</div>
              {facetOptions.value.genders.map((g) => (
                <button
                  key={g}
                  class={`home-catalog__filter-opt ${effFilters.value.genders.includes(g) ? "active" : ""}`}
                  onClick$={() => {
                    const f = effFilters.value;
                    filters.value = {
                      ...f,
                      genders: f.genders.includes(g) ? f.genders.filter((x) => x !== g) : [...f.genders, g],
                    };
                    scrollProductsBelowBar();
                  }}
                >
                  <span class="home-catalog__filter-check" />
                  {t(`fit.${g.toLowerCase()}` as any, locale.value)}
                </button>
              ))}
            </div>
          )}
          {!isPdp.value && facetOptions.value.brands.length >= 1 && (
            <div class="home-catalog__filter-group">
              <div class="home-catalog__filter-title">{t("filter.brand", locale.value)}</div>
              {facetOptions.value.brands.map((b) => (
                <button
                  key={b}
                  class={`home-catalog__filter-opt ${effFilters.value.brands.includes(b) ? "active" : ""}`}
                  onClick$={() => {
                    const f = effFilters.value;
                    filters.value = {
                      ...f,
                      brands: f.brands.includes(b) ? f.brands.filter((x) => x !== b) : [...f.brands, b],
                    };
                    scrollProductsBelowBar();
                  }}
                >
                  <span class="home-catalog__filter-check" />
                  {b}
                </button>
              ))}
            </div>
          )}
          {!isPdp.value && (effFilters.value.genders.length > 0 || effFilters.value.sizes.length > 0 || effFilters.value.brands.length > 0) && (
            <button
              class="home-catalog__filter-clear"
              onClick$={() => {
                filters.value = { cat: activeCat.value, genders: [], sizes: [], brands: [] };
                scrollProductsBelowBar();
              }}
            >
              {t("filter.clear", locale.value)}
            </button>
          )}
        </aside>
        {isPdp.value ? (
          <div class="home-catalog__pdp-main"><Slot /></div>
        ) : (
          <div class={`apparel-grid ${denseGrid.value ? "apparel-grid--dense" : ""} ${tabletCols.value === "list" ? "apparel-grid--list" : `apparel-grid--cols-${tabletCols.value}`}`}>
            {filtered.value.map((item, i) => (
              <ProductCard key={item.sku} item={item} sku={item.sku} index={i} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
});
