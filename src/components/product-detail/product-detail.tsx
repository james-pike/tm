import { component$, useSignal, useComputed$, useTask$, useVisibleTask$, $, useContext, type QRL } from "@builder.io/qwik";
import { Carousel } from "@qwik-ui/headless";
import { Link } from "@builder.io/qwik-city";
import { LocaleContext, t } from "../../i18n";
import { allProducts, colorName, categoryLabel } from "../../routes/apparel/products";
import { expandSizes, sizeGroups, sortColorsWhiteLast, cardTitle, productGender } from "../../routes/apparel/utils";
import { LoginTypeContext } from "../../routes/layout";
import { ProductImage } from "../product-image/product-image";
import { allowedSkus, currentSeason, isPortal, remainingAllowance } from "../../lib/portals";

// Tall sizes are rendered on their own row, separate from the regular sizes.
const TALL_SIZES = new Set(["ST", "MT", "LT", "XLT", "2XLT", "3XLT", "4XLT", "5XLT"]);

// Base (fit-less) size tokens, largest last, for parsing fit variants.
const SIZE_BASES = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL"];

/** Split a size token into its base and fit: "LT" → {base:"L",fit:"Tall"},
 *  "2XL" → {base:"2XL",fit:"Regular"}. */
function parseFitToken(tok: string): { base: string; fit: "Regular" | "Tall" | "Short" } {
  if (SIZE_BASES.includes(tok)) return { base: tok, fit: "Regular" };
  if (tok.endsWith("T")) {
    const base = tok.slice(0, -1);
    if (SIZE_BASES.includes(base)) return { base, fit: "Tall" };
  }
  if (tok.endsWith("S")) {
    const base = tok.slice(0, -1);
    if (SIZE_BASES.includes(base)) return { base, fit: "Short" };
  }
  return { base: tok, fit: "Regular" };
}

/**
 * Derive fit-variant size groups from a slash-separated sizes string, e.g.
 * "S - 4XL / LT - 2XLT" → { Regular: [S…4XL], Tall: [L…2XL] }. Each "/" group
 * must be a fit-suffixed range; anything else yields null so those never become
 * variants. Returns null unless at least two real fit groups are found — so a
 * product's sizes are NEVER clumped into one button when they span fits.
 */
function variantMapFromSizes(sizes: string): Record<string, string[]> | null {
  if (!sizes || !sizes.includes("/")) return null;
  const map: Record<string, string[]> = {};
  for (const group of sizes.split("/").map((s) => s.trim()).filter(Boolean)) {
    const m = group.match(/^(\S+)\s*-\s*(\S+)$/);
    if (!m) return null;
    const a = parseFitToken(m[1]);
    const b = parseFitToken(m[2]);
    const list = expandSizes(`${a.base} - ${b.base}`);
    if (list.length === 0 || (list.length === 1 && list[0].includes(" "))) return null;
    map[a.fit] = list;
  }
  return Object.keys(map).length >= 2 ? map : null;
}

/** Fit-variant size map for a product, derived from its sizes string (module-
 *  scoped so it's usable inside Qwik $ / useComputed$ / useTask$ boundaries). */
function getVariantMap(
  p: { sku: string; sizes: string } | null | undefined,
): Record<string, string[]> | null {
  if (!p) return null;
  return variantMapFromSizes(p.sizes);
}

interface ProductDetailPanelProps {
  /** SKU to render (from the route param, or the in-frame catalog overlay). */
  sku: string;
  /** In-frame overlay mode: when set, renders a close button instead of the
      breadcrumb, and related items switch the panel in place instead of navigating. */
  onClose$?: QRL<() => void>;
  onSelectSku$?: QRL<(sku: string) => void>;
}

/**
 * The product-detail view — image carousel, size/colour/variant pickers, add-to-
 * cart and the related-items carousel. Rendered both as the /apparel/[sku]/ route
 * (full page) and as the catalog's in-frame overlay panel; the two never diverge
 * because they share this one component. `sku` comes from a prop rather than the
 * route so the same logic drives both.
 */
export const ProductDetailPanel = component$<ProductDetailPanelProps>((props) => {
  const locale = useContext(LocaleContext);
  const loginType = useContext(LoginTypeContext);
  const hidePrice = loginType.value === "tech";
  const inFrame = !!props.onClose$;

  // Reference props.sku directly inside computed/tasks so they re-track when the
  // panel is pointed at a different product (route [sku]→[sku] nav, or the
  // in-frame overlay switching products via a related item).
  const product = useComputed$(() => allProducts.find((p) => p.sku === props.sku) || null);

  const imgIndex = useSignal(0);
  const touchStartX = useSignal(0);
  const selectedSize = useSignal("");
  const selectedColor = useSignal("");
  const selectedQty = useSignal(1);
  const selectedWaist = useSignal("");
  const selectedLength = useSignal("");
  const selectedVariant = useSignal("");
  const added = useSignal(false);
  const addedInfo = useSignal("");
  // When the toast is showing an allowance-limit warning rather than an
  // "Added — …" confirmation (drops the prefix, flips the toast to a warning).
  const capBlocked = useSignal(false);
  // Portal allowance for THIS product: how many more units the role may still
  // order (cap minus whatever's already in the cart for the same group), and
  // whether it's an "as needed/approved" item. Refreshed when the panel points
  // at a new SKU and on every cart change, so the qty stepper + add button
  // reflect the live remaining allowance. null = unrestricted (shouldn't happen
  // for a real portal, but keeps the panel usable if the login type is unknown).
  const capInfo = useSignal<{ cap: number; remaining: number; approval: boolean; label: string } | null>(null);
  // Transient note shown by the quantity stepper when "+" is blocked by the
  // per-order cap (e.g. a toque locked at 1), so the lock has a reason.
  const qtyNotice = useSignal("");
  // The limit message under Add to Cart is revealed while the button is hovered,
  // or flashed for a few seconds on a blocked click. Hover is tracked explicitly
  // (not CSS :hover) so a successful add that locks the button doesn't pop the
  // message while the cursor is still resting on it — it resets `hovering` and
  // only shows again once the cursor leaves and returns.
  const hovering = useSignal(false);
  const limitFlash = useSignal(false);
  const refreshCap = $(() => {
    const p = product.value;
    if (!p || !isPortal(loginType.value)) { capInfo.value = null; return; }
    let items: any[] = [];
    try {
      const saved = localStorage.getItem(`ce_cart_mn_${loginType.value}`);
      items = saved ? JSON.parse(saved) : [];
    } catch { items = []; }
    const r = remainingAllowance(loginType.value, currentSeason(), p.sku, items);
    capInfo.value = r.group
      ? { cap: r.cap, remaining: r.remaining, approval: r.approval, label: r.group.label }
      : null;
  });
  const imgFullscreen = useSignal(false);
  const imgLayout = useSignal<"rail" | "full">("rail");

  const relatedPerView = useSignal(2);
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => {
    const mq = window.matchMedia("(min-width: 1025px)");
    const apply = () => { relatedPerView.value = mq.matches ? 4 : 2; };
    apply();
    mq.addEventListener("change", apply);
    cleanup(() => mq.removeEventListener("change", apply));
  });

  // Per-SKU size/fit overrides. Keyed by SKU; empty for Tamarack's current
  // catalog (products fall back to the generic size/waist/length options below).
  const waistLengthSkus = new Set<string>([]);
  const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL"];
  const waistOptionsBySku: Record<string, string[]> = {};
  const lengthOptionsBySku: Record<string, string[]> = {};
  const waistOptions = ["28", "29", "30", "31", "32", "33", "34", "35", "36", "38", "40", "42", "44", "46", "48", "50"];
  const lengthOptions = ["30", "32", "34", "36"];

  const sizeOptions = useComputed$<string[]>(() => {
    const p = product.value;
    if (!p) return [];
    const variantMap = getVariantMap(p);
    if (variantMap) {
      if (selectedVariant.value && variantMap[selectedVariant.value]) {
        return variantMap[selectedVariant.value];
      }
      const union = new Set<string>();
      Object.values(variantMap).forEach((arr) => arr.forEach((s) => union.add(s)));
      return Array.from(union).sort((a, b) => SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b));
    }
    return expandSizes(p.sizes);
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track }) => {
    track(() => selectedVariant.value);
    const p = product.value;
    if (p && waistLengthSkus.has(p.sku)) return;
    if (!selectedSize.value) return;
    if (!sizeOptions.value.includes(selectedSize.value)) {
      selectedSize.value = "";
    }
  });

  // Keep the remaining allowance current: recompute when the panel switches
  // products and whenever any cart change fires. Clamp the chosen quantity down
  // if it now exceeds what's left.
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track, cleanup }) => {
    track(() => product.value?.sku);
    track(() => loginType.value);
    refreshCap();
    const onCartUpdate = () => refreshCap();
    window.addEventListener("cart-updated", onCartUpdate);
    cleanup(() => window.removeEventListener("cart-updated", onCartUpdate));
  });
  useTask$(({ track }) => {
    const ci = track(() => capInfo.value);
    // The allowance changed (cart update / different product) — the stale "can't
    // increase" note no longer applies.
    qtyNotice.value = "";
    if (ci && selectedQty.value > ci.remaining) selectedQty.value = Math.max(1, ci.remaining);
  });

  const addToCart = $(() => {
    const p = product.value;
    if (!p || !selectedSize.value) return;
    // Enforce the portal's quantity cap: never let the group total exceed the
    // allowance. Clicking the locked button flashes the limit message (which is
    // otherwise only revealed on hover) for a few seconds.
    if (capInfo.value && capInfo.value.remaining <= 0) {
      limitFlash.value = true;
      setTimeout(() => { limitFlash.value = false; }, 4000);
      return;
    }
    const qtyToAdd = capInfo.value ? Math.min(selectedQty.value, capInfo.value.remaining) : selectedQty.value;
    if (p.colors.length > 0 && !selectedColor.value) return;
    if (waistLengthSkus.has(p.sku) && (!selectedWaist.value || !selectedLength.value)) return;
    if (getVariantMap(p) && !selectedVariant.value) return;
    const sizeVal = waistLengthSkus.has(p.sku)
      ? `W${selectedWaist.value} x L${selectedLength.value}`
      : getVariantMap(p)
        ? `${selectedSize.value} ${selectedVariant.value}`
        : selectedSize.value;
    try {
      const saved = localStorage.getItem(`ce_cart_mn_${loginType.value || "clothing"}`);
      const items = saved ? JSON.parse(saved) : [];
      const existing = items.find(
        (i: any) => i.name === p.name && i.size === sizeVal && i.color === selectedColor.value
      );
      if (existing) {
        existing.quantity += qtyToAdd;
      } else {
        const codeMatch = p.details?.match(/#[A-Za-z0-9]+/);
        let colorVal = selectedColor.value;
        if (!colorVal && (!p.colors || p.colors.length === 0)) {
          const nm = p.name.match(/\s-\s([A-Za-z ]+)$/);
          if (nm) colorVal = nm[1].trim();
        }
        const item: any = {
          name: p.name,
          sku: p.sku,
          category: p.category,
          size: sizeVal,
          color: colorVal,
          quantity: qtyToAdd,
          price: p.price,
          img: p.img,
        };
        if (codeMatch) item.code = codeMatch[0];
        if (capInfo.value?.approval) item.approval = true;
        if (waistLengthSkus.has(p.sku)) {
          item.waist = selectedWaist.value;
          item.length = selectedLength.value;
        }
        if (getVariantMap(p)) {
          item.variant = selectedVariant.value;
        }
        items.push(item);
      }
      localStorage.setItem(`ce_cart_mn_${loginType.value || "clothing"}`, JSON.stringify(items));
      window.dispatchEvent(new CustomEvent("cart-updated"));
    } catch (err) { console.error("addToCart error:", err); }
    capBlocked.value = false;
    // Drop the hover state: this add may have just locked the button, and the
    // cursor is still on it — don't pop the limit message until it re-enters.
    hovering.value = false;
    addedInfo.value = selectedColor.value ? `${p.name} — ${colorName(selectedColor.value, "en")} / ${sizeVal}` : `${p.name} — ${sizeVal}`;
    added.value = true;
    selectedQty.value = 1;
    // Hold the "Added" state ~1.3s, then revert. The toast fade-out is timed to
    // finish just before this (see .toast in global.css).
    setTimeout(() => { added.value = false; }, 1300);
  });

  useTask$(({ track }) => {
    track(() => props.sku);
    imgIndex.value = 0;
    imgFullscreen.value = false;
    selectedQty.value = 1;
    selectedWaist.value = "";
    selectedLength.value = "";
    selectedVariant.value = "";
    selectedSize.value = "";
    selectedColor.value = "";
    const p0 = product.value;
    if (!p0) return;
    selectedColor.value = sortColorsWhiteLast(p0.colors)[0];
    if (waistLengthSkus.has(p0.sku)) {
      selectedSize.value = "W/L";
    } else if (getVariantMap(p0)) {
      const variantMap = getVariantMap(p0)!;
      const variantKeys = Object.keys(variantMap);
      const defVariant = variantKeys.includes("Regular") ? "Regular" : variantKeys[0];
      selectedVariant.value = defVariant;
      const sizes = variantMap[defVariant];
      const lIdx = sizes.indexOf("L");
      selectedSize.value = lIdx !== -1 ? sizes[lIdx] : sizes[0];
    } else {
      const sizes = expandSizes(p0.sizes);
      const lIdx = sizes.indexOf("L");
      selectedSize.value = lIdx !== -1 ? sizes[lIdx] : sizes[0];
    }
  });

  // Selecting a colour swatch switches the shown image to that colour's photo.
  // Only when imgs are colour-aligned (one image per colour, same order as the
  // DB `colors` array); otherwise imgs is a plain carousel and we leave it be.
  useTask$(({ track }) => {
    const color = track(() => selectedColor.value);
    const p0 = product.value;
    if (!p0 || !color) return;
    const imgs = p0.imgs && p0.imgs.length ? p0.imgs : [p0.img];
    if (imgs.length !== p0.colors.length) return;
    const idx = p0.colors.indexOf(color);
    if (idx >= 0) imgIndex.value = idx;
  });

  if (!product.value) {
    return (
      <div class="apparel-catalog" id="products">
        <div class="product-detail">
          <p style={{ padding: "2rem", textAlign: "center" }}>{t("product.notfound", locale.value)}</p>
        </div>
      </div>
    );
  }

  const p = product.value;
  const pdf = (p as any).pdf as string | undefined;
  const hasMultipleImgs = (p.imgs && p.imgs.length ? p.imgs : [p.img]).length > 1;
  const isFootwear = (c: string) => c === "Safety Boots" || c === "Safety Shoes" || c === "Footwear";
  const tabCategory = isFootwear(p.category) ? "Footwear" : p.category;
  const catHash = tabCategory.toLowerCase().replace(/\s+/g, "-");
  const backLabel = loginType.value === "tech" ? t("cat.Work Wear", locale.value) : t("nav.apparel", locale.value);
  const catLabel = categoryLabel(tabCategory, locale.value);

  return (
    <div class={`apparel-catalog ${inFrame ? "apparel-catalog--inframe" : ""}`} id={inFrame ? undefined : "products"}>
      {inFrame ? (
        <button class="product-detail__close" aria-label="Close" onClick$={() => props.onClose$?.()}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
        </button>
      ) : (
        <nav class="pdp-breadcrumb" aria-label="Breadcrumb">
          <Link href="/" class="pdp-breadcrumb__link pdp-breadcrumb__back">
            <svg class="pdp-breadcrumb__arrow" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            <span>{backLabel}</span>
          </Link>
          <Link href={`/#${catHash}`} class="pdp-breadcrumb__link pdp-breadcrumb__cat">
            {tabCategory === "New Hire Kit" ? (
              <>
                <span class="pdp-breadcrumb__cat-full">{catLabel}</span>
                <span class="pdp-breadcrumb__cat-short">{t("cat.newhirekit.short", locale.value)}</span>
              </>
            ) : catLabel}
          </Link>
          <span class="pdp-breadcrumb__sku">{p.sku}</span>
          {hasMultipleImgs && (
            <button
              class="pdp-breadcrumb__view"
              aria-label={imgLayout.value === "rail" ? "Full-width image" : "Show image previews"}
              onClick$={() => (imgLayout.value = imgLayout.value === "rail" ? "full" : "rail")}
            >
              {imgLayout.value === "rail" ? (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="M8 21H5a2 2 0 0 1-2-2v-3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>
              ) : (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
              )}
            </button>
          )}
        </nav>
      )}
      <div class={`product-detail ${imgLayout.value === "full" ? "product-detail--imgfull" : ""}`}>
        <div class="product-modal__layout">
          <div class="product-image-row">
            <div
              class="product-carousel"
              onTouchStart$={(e) => { touchStartX.value = e.touches[0].clientX; }}
              onTouchEnd$={(e) => {
                const diff = touchStartX.value - e.changedTouches[0].clientX;
                const imgs = ((p.imgs && p.imgs.length ? p.imgs : [p.img]) as string[]);
                if (Math.abs(diff) > 40) {
                  if (diff > 0) {
                    imgIndex.value = (imgIndex.value + 1) % imgs.length;
                  } else {
                    imgIndex.value = (imgIndex.value - 1 + imgs.length) % imgs.length;
                  }
                }
              }}
              onClick$={() => {
                const imgs = ((p.imgs && p.imgs.length ? p.imgs : [p.img]) as string[]);
                if (window.innerWidth > 1024) {
                  imgFullscreen.value = true;
                } else if (imgs.length > 1) {
                  imgIndex.value = (imgIndex.value + 1) % imgs.length;
                }
              }}
            >
              {(((p.imgs && p.imgs.length ? p.imgs : [p.img]) as string[])).map((src, i) => (
                <picture key={i}>
                  <source srcset={src.replace(/\.(jpe?g|png)$/i, ".webp")} type="image/webp" />
                  <img
                    src={src}
                    alt={p.name}
                    width="600"
                    height="400"
                    loading={i === 0 ? "eager" : "lazy"}
                    fetchPriority={i === 0 ? "high" : "auto"}
                    decoding="async"
                    class={`product-carousel__slide ${imgIndex.value === i ? "active" : ""} ${src.includes("spec") ? "product-carousel__slide--contain" : ""}`}
                    style={src.includes("BACK") ? { objectPosition: "center 65%" } : {}}
                  />
                </picture>
              ))}
              {pdf && (
                <a href={pdf} target="_blank" class="product-modal__pdf" onClick$={(e) => e.stopPropagation()}>
                  {t("product.specsheet.pdf", locale.value)}
                </a>
              )}
              {(((p.imgs && p.imgs.length ? p.imgs : [p.img]) as string[])).length > 1 && (
                <div class="product-carousel__indicators">
                  {(((p.imgs && p.imgs.length ? p.imgs : [p.img]) as string[])).map((_, i) => (
                    <button
                      key={i}
                      class={`product-carousel__dot ${imgIndex.value === i ? "active" : ""}`}
                      aria-label={`Image ${i + 1}`}
                      onClick$={(e) => { e.stopPropagation(); imgIndex.value = i; }}
                    />
                  ))}
                </div>
              )}
            </div>
            {(((p.imgs && p.imgs.length ? p.imgs : [p.img]) as string[])).length > 1 && (
              <div class="product-thumbs product-thumbs--column">
                {(((p.imgs && p.imgs.length ? p.imgs : [p.img]) as string[])).map((src, i) => (
                  <button
                    key={i}
                    class={`product-thumbs__item ${imgIndex.value === i ? "active" : ""}`}
                    onClick$={() => { imgIndex.value = i; }}
                  >
                    <ProductImage src={src} alt={`${p.name} ${i + 1}`} width={80} height={80} loading={i === 0 ? "eager" : "lazy"} />
                  </button>
                ))}
              </div>
            )}
          </div>
          <div class="product-modal__details">
            <h2 class="product-modal__name">{p.name}</h2>
            {!hidePrice && <div class="product-modal__price">${(Number(p.price) || 0).toFixed(2)}</div>}
            {p.material && (
              <div class="product-modal__material">
                <strong>{t("modal.material", locale.value)}:</strong> {p.material}
              </div>
            )}
            {p.details && (
              <ul class={`product-modal__details-list ${p.details.split(",").length <= 2 ? "product-modal__details-list--single" : ""}`}>
                {p.details.split(",").map((detail, i) => (
                  <li key={i}>{detail.trim()}</li>
                ))}
              </ul>
            )}
            {!waistLengthSkus.has(p.sku) && (
            <div class="product-modal__field">
              <label class="product-modal__label">{t("modal.size", locale.value)}{getVariantMap(p) && selectedVariant.value && <span class="product-modal__color-inline"> — {t(`variant.${selectedVariant.value}` as any, locale.value)}</span>}{!getVariantMap(p) && sizeOptions.value.some((s) => TALL_SIZES.has(s)) && selectedSize.value && <span class="product-modal__color-inline"> — {t(TALL_SIZES.has(selectedSize.value) ? "variant.Tall" : "variant.Regular", locale.value)}</span>}</label>
              <div class="product-modal__options">
                {sizeOptions.value.filter((s) => !TALL_SIZES.has(s)).map((size) => (
                  <button
                    key={size}
                    class={`product-modal__option ${selectedSize.value === size ? "active" : ""}`}
                    onClick$={() => (selectedSize.value = size)}
                  >
                    {size === "One Size" ? t("modal.onesize", locale.value) : size}
                  </button>
                ))}
              </div>
              {sizeOptions.value.some((s) => TALL_SIZES.has(s)) && (
                <div class="product-modal__options product-modal__options--tall">
                  {sizeOptions.value.filter((s) => TALL_SIZES.has(s)).map((size) => (
                    <button
                      key={size}
                      class={`product-modal__option ${selectedSize.value === size ? "active" : ""}`}
                      onClick$={() => (selectedSize.value = size)}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              )}
            </div>
            )}
            {getVariantMap(p) && (
              <div class="product-modal__field">
                <label class="product-modal__label">{t("product.variant", locale.value)}</label>
                <div class="product-modal__options">
                  {(getVariantMap(p) ? Object.keys(getVariantMap(p)!) : []).map((v) => (
                    <button
                      key={v}
                      class={`product-modal__option ${selectedVariant.value === v ? "active" : ""}`}
                      onClick$={() => (selectedVariant.value = v)}
                    >
                      {t(`variant.${v}` as any, locale.value)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {waistLengthSkus.has(p.sku) && (
              <div class="product-modal__field product-modal__waist-length-row">
                <div class="product-modal__select-group">
                  <label class="product-modal__label">{t("product.waist", locale.value)}</label>
                  <select
                    class="product-modal__select"
                    value={selectedWaist.value}
                    onChange$={(_, el) => (selectedWaist.value = el.value)}
                  >
                    <option value="" disabled>{t("product.select", locale.value)}</option>
                    {(waistOptionsBySku[p.sku] ?? waistOptions).map((w) => (
                      <option key={w} value={w}>{w}</option>
                    ))}
                  </select>
                </div>
                <div class="product-modal__select-group">
                  <label class="product-modal__label">{t("product.length", locale.value)}</label>
                  <select
                    class="product-modal__select"
                    value={selectedLength.value}
                    onChange$={(_, el) => (selectedLength.value = el.value)}
                  >
                    <option value="" disabled>{t("product.select", locale.value)}</option>
                    {(lengthOptionsBySku[p.sku] ?? lengthOptions).map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            {p.colors.length > 0 && (
              <div class="product-modal__field">
                <label class="product-modal__label">{t("modal.color", locale.value)}{selectedColor.value && <span class="product-modal__color-inline"> — {colorName(selectedColor.value, locale.value)}</span>}</label>
                <div class="product-modal__options">
                  {sortColorsWhiteLast(p.colors).map((color) => (
                    <button
                      key={color}
                      class={`product-modal__color ${selectedColor.value === color ? "active" : ""}`}
                      style={{ background: color }}
                      onClick$={() => (selectedColor.value = color)}
                      aria-label={colorName(color, locale.value)}
                      title={colorName(color, locale.value)}
                    />
                  ))}
                </div>
              </div>
            )}
            <div class="product-modal__field product-modal__qty-group">
              <label class="product-modal__label">{t("modal.quantity", locale.value)}</label>
              <div class="product-modal__qty">
                <button class="product-modal__qty-btn" aria-label="Decrease quantity" onClick$={() => { qtyNotice.value = ""; if (selectedQty.value > 1) selectedQty.value--; }}>-</button>
                <span class="product-modal__qty-val">{selectedQty.value}</span>
                {/* "+" stays clickable even at the cap so the attempt can explain
                    itself — it shows a note instead of silently doing nothing. */}
                <button
                  class={`product-modal__qty-btn ${!!capInfo.value && selectedQty.value >= capInfo.value.remaining ? "product-modal__qty-btn--maxed" : ""}`}
                  aria-label="Increase quantity"
                  onClick$={() => {
                    if (capInfo.value && selectedQty.value >= capInfo.value.remaining) {
                      const ci = capInfo.value;
                      qtyNotice.value = `Limited to ${ci.cap} ${ci.label} per order${ci.remaining < ci.cap && ci.remaining > 0 ? ` — ${ci.remaining} more available` : ""}.`;
                      return;
                    }
                    qtyNotice.value = "";
                    selectedQty.value++;
                  }}
                >+</button>
              </div>
              {qtyNotice.value && <p class="product-modal__qty-note" role="status">{qtyNotice.value}</p>}
            </div>
            <div class="product-modal__actions">
              <button
                class={`btn btn--primary product-modal__add product-modal__add--branded ${added.value ? "product-modal__add--added" : ""} ${(!!capInfo.value && capInfo.value.remaining <= 0) ? "product-modal__add--locked" : ""}`}
                disabled={!selectedSize.value || (waistLengthSkus.has(p.sku) && (!selectedWaist.value || !selectedLength.value)) || (!!getVariantMap(p) && !selectedVariant.value)}
                onMouseEnter$={() => { hovering.value = true; }}
                onMouseLeave$={() => { hovering.value = false; }}
                onClick$={addToCart}
              >
                <span class="product-modal__add-label">
                  <span class="product-modal__add-label-text product-modal__add-label-text--primary">{selectedSize.value ? t("modal.addtocart", locale.value) : t("modal.selectsize", locale.value)}</span>
                  <span class="product-modal__add-label-text product-modal__add-label-text--added">{t("modal.added", locale.value)}</span>
                </span>
                <span class="product-modal__add-mark" aria-hidden="true">
                  <svg class="product-modal__add-glyph product-modal__add-glyph--cart" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>
                  {/* Tamarack mark (white, transparent) — wipes in from the left when the item is added. */}
                  <img class="product-modal__add-logo" src="/footer-mark.png" alt="" width="40" height="40" decoding="async" />
                </span>
              </button>
              {/* Explains WHY the Add button is locked. Hidden by default,
                  revealed on hover of the button (CSS) or flashed on click. It's
                  absolutely positioned below the button so it overlays the empty
                  space already there rather than adding a line that shifts the
                  page down. */}
              {capInfo.value && capInfo.value.remaining <= 0 && (
                <p class={`product-modal__limit ${(hovering.value || limitFlash.value) ? "product-modal__limit--show" : ""}`} role="status">
                  You've reached your {capInfo.value.label} limit ({capInfo.value.cap} per order). Anything more needs office approval.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
      {(() => {
        // Related items stay inside this role's allowed (season-aware) lineup so
        // the carousel never links to a product the portal can't actually order.
        const allow = isPortal(loginType.value) ? allowedSkus(loginType.value, currentSeason()) : null;
        const inLineup = (r: (typeof allProducts)[number]) =>
          r.sku !== p.sku && r.sku !== "CAR-12" && (allow ? allow.has(r.sku) : true);
        // Other products in the SAME category first; if this product is the only
        // one in its category within the lineup, fall back to a general "More
        // Apparel" row of other allowed items.
        const sameCat = allProducts.filter((r) => inLineup(r) && r.category === p.category);
        const hasSiblings = sameCat.length > 0;
        const related = (hasSiblings ? sameCat : allProducts.filter(inLineup)).slice(0, 8);
        // "More <Category>" when there are same-category siblings; otherwise the
        // generic "More Apparel".
        const headingSuffix = hasSiblings ? catLabel : t("nav.apparel", locale.value);
        // Card inner markup, shared by the grid + carousel below (inline, not a
        // component, to keep it a plain render helper).
        const cardInner = (item: typeof related[number], loading: "eager" | "lazy") => {
          const g = productGender(item.name);
          return (
          <>
            <div class="product-card__image">
              <ProductImage src={item.img} alt={item.name} width={440} height={440} loading={loading} />
            </div>
            <div class="product-card__info">
              <div class="product-card__name-row">
                <div class="product-card__name">{cardTitle(item.name)}</div>
                <div class="product-card__price-group">
                  {!hidePrice && <div class="product-card__price">${(Number(item.price) || 0).toFixed(2)}</div>}
                  <span class="product-card__sizes">
                    {(g === "Men" || g === "Women") && (
                      <span class="product-card__sizes-gender">{t(g === "Men" ? "gender.mens" : "gender.womens", locale.value)}{" "}</span>
                    )}
                    {(item.sizes === "One Size" ? [t("modal.onesize", locale.value)] : sizeGroups(item.sizes)).map((sg) => (
                      <span key={sg} class="product-card__sizes-line">{sg}</span>
                    ))}
                  </span>
                </div>
              </div>
            </div>
          </>
          );
        };
        return (
          <div class="related-items">
            <h3 class="related-items__title">{t("product.more", locale.value)} {headingSuffix}</h3>
            {/* In-frame: related items switch the panel in place (button + onSelectSku$).
                Route: they navigate (Link). */}
            <div class="related-items__grid">
              {related.slice(0, 4).map((item) => (
                inFrame ? (
                  <button key={item.sku} type="button" class="product-card product-card-link" onClick$={() => props.onSelectSku$?.(item.sku)}>
                    {cardInner(item, "eager")}
                  </button>
                ) : (
                  <Link key={item.sku} href={`/${item.sku}/`} class="product-card product-card-link">
                    {cardInner(item, "eager")}
                  </Link>
                )
              ))}
            </div>
            <Carousel.Root class="related-carousel" slidesPerView={relatedPerView.value} gap={0.4} align="start" sensitivity={{ touch: 1.5, mouse: 1.5 }} rewind>
              <div class="related-carousel__wrapper">
                {related.length > relatedPerView.value && (
                <Carousel.Previous class="related-carousel__arrow related-carousel__arrow--prev">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                </Carousel.Previous>
                )}
                <Carousel.Scroller class="related-carousel__scroller">
                  {related.map((item) => (
                    <Carousel.Slide key={item.sku} class="related-carousel__slide">
                      {inFrame ? (
                        <button type="button" class="product-card product-card-link" onClick$={() => props.onSelectSku$?.(item.sku)}>
                          {cardInner(item, "lazy")}
                        </button>
                      ) : (
                        <Link href={`/${item.sku}/`} class="product-card product-card-link">
                          {cardInner(item, "lazy")}
                        </Link>
                      )}
                    </Carousel.Slide>
                  ))}
                </Carousel.Scroller>
                {related.length > relatedPerView.value && (
                <Carousel.Next class="related-carousel__arrow related-carousel__arrow--next">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                </Carousel.Next>
                )}
              </div>
            </Carousel.Root>
          </div>
        );
      })()}
      {/* Kept mounted and toggled by the same `added` state as the button, so its
          fade-out runs on the same clock as the button's logo/glyph/label exit. */}
      <div class={`toast ${added.value ? "toast--show" : ""} ${capBlocked.value ? "toast--warn" : ""}`}>{capBlocked.value ? addedInfo.value : `${t("modal.added", locale.value)} — ${addedInfo.value}`}</div>
      {imgFullscreen.value && (
        <div class="product-fullscreen" onClick$={() => (imgFullscreen.value = false)}>
          <button class="product-fullscreen__close" aria-label="Close fullscreen" onClick$={(e) => { e.stopPropagation(); imgFullscreen.value = false; }}>&times;</button>
          <img
            src={(((p.imgs && p.imgs.length ? p.imgs : [p.img]) as string[]))[imgIndex.value]}
            alt={p.name}
            class="product-fullscreen__img"
            onClick$={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
});
