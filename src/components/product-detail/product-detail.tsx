import { component$, useSignal, useComputed$, useTask$, useVisibleTask$, $, useContext, type QRL } from "@builder.io/qwik";
import { Carousel } from "@qwik-ui/headless";
import { Link } from "@builder.io/qwik-city";
import { LocaleContext, t } from "../../i18n";
import { allProducts, colorName, categoryLabel } from "../../routes/apparel/products";
import { expandSizes, sizeGroups, sortColorsWhiteLast, cardTitle, productGender } from "../../routes/apparel/utils";
import { LoginTypeContext } from "../../routes/layout";
import { ProductImage } from "../product-image/product-image";

// Tall sizes are rendered on their own row, separate from the regular sizes.
const TALL_SIZES = new Set(["ST", "MT", "LT", "XLT", "2XLT", "3XLT", "4XLT", "5XLT"]);

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
  const variantSizesBySku: Record<string, Record<string, string[]>> = {};
  const variantSkus = new Set(Object.keys(variantSizesBySku));
  const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL"];
  const waistOptionsBySku: Record<string, string[]> = {};
  const lengthOptionsBySku: Record<string, string[]> = {};
  const waistOptions = ["28", "29", "30", "31", "32", "33", "34", "35", "36", "38", "40", "42", "44", "46", "48", "50"];
  const lengthOptions = ["30", "32", "34", "36"];

  const sizeOptions = useComputed$<string[]>(() => {
    const p = product.value;
    if (!p) return [];
    const variantMap = variantSizesBySku[p.sku];
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

  const addToCart = $(() => {
    const p = product.value;
    if (!p || !selectedSize.value) return;
    if (p.colors.length > 0 && !selectedColor.value) return;
    if (waistLengthSkus.has(p.sku) && (!selectedWaist.value || !selectedLength.value)) return;
    if (variantSkus.has(p.sku) && !selectedVariant.value) return;
    const sizeVal = waistLengthSkus.has(p.sku)
      ? `W${selectedWaist.value} x L${selectedLength.value}`
      : variantSkus.has(p.sku)
        ? `${selectedSize.value} ${selectedVariant.value}`
        : selectedSize.value;
    try {
      const saved = localStorage.getItem(`ce_cart_mn_${loginType.value || "clothing"}`);
      const items = saved ? JSON.parse(saved) : [];
      const existing = items.find(
        (i: any) => i.name === p.name && i.size === sizeVal && i.color === selectedColor.value
      );
      if (existing) {
        existing.quantity += selectedQty.value;
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
          quantity: selectedQty.value,
          price: p.price,
          img: p.img,
        };
        if (codeMatch) item.code = codeMatch[0];
        if (waistLengthSkus.has(p.sku)) {
          item.waist = selectedWaist.value;
          item.length = selectedLength.value;
        }
        if (variantSkus.has(p.sku)) {
          item.variant = selectedVariant.value;
        }
        items.push(item);
      }
      localStorage.setItem(`ce_cart_mn_${loginType.value || "clothing"}`, JSON.stringify(items));
      window.dispatchEvent(new CustomEvent("cart-updated"));
    } catch (err) { console.error("addToCart error:", err); }
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
    } else if (variantSkus.has(p0.sku)) {
      const variantMap = variantSizesBySku[p0.sku];
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
              <label class="product-modal__label">{t("modal.size", locale.value)}{variantSkus.has(p.sku) && selectedVariant.value && <span class="product-modal__color-inline"> — {t(`variant.${selectedVariant.value}` as any, locale.value)}</span>}{!variantSkus.has(p.sku) && sizeOptions.value.some((s) => TALL_SIZES.has(s)) && selectedSize.value && <span class="product-modal__color-inline"> — {t(TALL_SIZES.has(selectedSize.value) ? "variant.Tall" : "variant.Regular", locale.value)}</span>}</label>
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
            {variantSkus.has(p.sku) && (
              <div class="product-modal__field">
                <label class="product-modal__label">{t("product.variant", locale.value)}</label>
                <div class="product-modal__options">
                  {(variantSizesBySku[p.sku] ? Object.keys(variantSizesBySku[p.sku]) : []).map((v) => (
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
                <button class="product-modal__qty-btn" aria-label="Decrease quantity" onClick$={() => { if (selectedQty.value > 1) selectedQty.value--; }}>-</button>
                <span class="product-modal__qty-val">{selectedQty.value}</span>
                <button class="product-modal__qty-btn" aria-label="Increase quantity" onClick$={() => (selectedQty.value++)}>+</button>
              </div>
            </div>
            <div class="product-modal__actions">
              <button
                class={`btn btn--primary product-modal__add product-modal__add--branded ${added.value ? "product-modal__add--added" : ""}`}
                disabled={!selectedSize.value || (waistLengthSkus.has(p.sku) && (!selectedWaist.value || !selectedLength.value)) || (variantSkus.has(p.sku) && !selectedVariant.value)}
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
            </div>
          </div>
        </div>
      </div>
      {(() => {
        const visibleByLogin: Record<string, string[]> = {
          clothing: ["Jackets", "Sweaters", "Shirts", "Polos", "Hats", "SWAG", "New Hire Kit"],
          tech: ["Work Wear"],
          safety: ["Flame Resistant", "Shirts", "Hats"],
        };
        const isGroupB = loginType.value === "groupb";
        const visible = visibleByLogin[loginType.value] || visibleByLogin.clothing;
        // Other products in the SAME category (excluding self + the retired
        // CAR-12). If a product is the only one in its category (e.g. the single
        // jacket), there's nothing to show as "More <Category>", so fall back to
        // a general "More Apparel" row of other items.
        const sameCat = allProducts.filter((r) => r.sku !== p.sku && r.sku !== "CAR-12" && r.category === p.category);
        const hasSiblings = sameCat.length > 0;
        // Group B: the "more products" row stays within the Group B lineup, not
        // the full catalog.
        const related = isGroupB
          ? allProducts.filter((r) => r.sku !== p.sku && (r as { portals?: string[] }).portals?.includes("groupb")).slice(0, 8)
          : hasSiblings
          ? sameCat.slice(0, 8)
          : allProducts.filter((r) => r.sku !== p.sku && r.sku !== "CAR-12" && visible.includes(r.category)).slice(0, 8);
        // "More <Category>" when there are same-category siblings; otherwise (and
        // for Group B, which shows no group label) the generic "More Apparel".
        const headingSuffix = (!isGroupB && hasSiblings) ? catLabel : t("nav.apparel", locale.value);
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
      <div class={`toast ${added.value ? "toast--show" : ""}`}>{t("modal.added", locale.value)} — {addedInfo.value}</div>
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
