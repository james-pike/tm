import { component$, useSignal, useComputed$, useTask$, useVisibleTask$, $, useContext } from "@builder.io/qwik";
import { Carousel } from "@qwik-ui/headless";
import { Link, useLocation, useNavigate } from "@builder.io/qwik-city";
import type { DocumentHead } from "@builder.io/qwik-city";
import { LocaleContext, t } from "../../../i18n";
import { allProducts, colorName, categoryLabel } from "../products";
import { expandSizes, sizeGroups, sortColorsWhiteLast } from "../utils";
import { LoginTypeContext } from "../../layout";
import { ProductImage } from "../../../components/product-image/product-image";

export default component$(() => {
  const locale = useContext(LocaleContext);
  const loginType = useContext(LoginTypeContext);
  const hidePrice = loginType.value === "tech";
  const loc = useLocation();
  const nav = useNavigate();

  // Read loc.params.sku *inside* the computed so it re-tracks on client-side
  // navigation between two [sku] pages. That's the same route, so Qwik reuses
  // this component instance and never re-runs setup — a captured `const sku`
  // would stay stale and the page would keep showing the previous product
  // (the "stuck" related-carousel bug). The reset task below re-inits per-
  // product UI state (image index, size/colour) on each sku change.
  const product = useComputed$(() => allProducts.find((p) => p.sku === loc.params.sku) || null);

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
  // Mobile image layout: "rail" = catalog style with the preview column on the
  // right; "full" = full-width image (previews hidden, dots for paging).
  // Toggled from the breadcrumb bar.
  const imgLayout = useSignal<"rail" | "full">("rail");

  // How many related-carousel slides are shown per view. Qwik UI marks every
  // slide *outside* the [currentIndex, currentIndex + slidesPerView) window as
  // `inert` (unclickable). Desktop CSS shows 4 slides but the JS prop was a
  // fixed 2, so the 3rd/4th visible slides were inert — clicks did nothing.
  // Track the viewport so the prop matches the CSS: 4 on desktop, 2 elsewhere.
  const relatedPerView = useSignal(2);
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => {
    const mq = window.matchMedia("(min-width: 1025px)");
    const apply = () => { relatedPerView.value = mq.matches ? 4 : 2; };
    apply();
    mq.addEventListener("change", apply);
    cleanup(() => mq.removeEventListener("change", apply));
  });

  // SKUs that use the waist x inseam size picker instead of a S–4XL run.
  // Carhartt 102291 Rigby Dungaree (MN-1) and the FR pants (MNFR-1) ship
  // in the same waist/inseam matrix.
  const waistLengthSkus = new Set(["CAR-12", "CAR-14", "MN-1", "MNFR-1"]);
  // Per-SKU variant options. Each entry maps the variant label to the list
  // of sizes available *for that variant* — different lengths on the same
  // bib can carry different size runs (e.g. Carhartt 106672 Short comes
  // M-4XL, Regular S-5XL, Tall M-4XL).
  const variantSizesBySku: Record<string, Record<string, string[]>> = {
    // MN-3 tee ships S-4XL regular plus a tall run (LT-4XLT). Tall starts at
    // L, so the size labels stay plain (L-4XL) and the tall-ness is carried
    // by the variant pick — same as the rest of the catalog.
    "MN-3": {
      "Regular": ["S", "M", "L", "XL", "2XL", "3XL", "4XL"],
      "Tall": ["L", "XL", "2XL", "3XL", "4XL"],
    },
    "CAR-11": {
      "Regular": ["S", "M", "L", "XL", "2XL", "3XL", "4XL"],
      "Tall": ["S", "M", "L", "XL", "2XL", "3XL", "4XL"],
    },
    "CAR-17": {
      "Regular": ["S", "M", "L", "XL", "2XL", "3XL", "4XL"],
      "Tall": ["S", "M", "L", "XL", "2XL", "3XL", "4XL"],
    },
    "MN-8": {
      "Short": ["M", "L", "XL", "2XL", "3XL", "4XL"],
      "Regular": ["S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"],
      "Tall": ["M", "L", "XL", "2XL", "3XL", "4XL"],
    },
  };
  const variantSkus = new Set(Object.keys(variantSizesBySku));
  const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL"];
  // Per-SKU waist + inseam runs. MN-1 (Carhartt 102291 Rigby) and MNFR-1
  // (Carhartt 104204 FR Rigby) carry different waist/length grids.
  // Carhartt CAR-12 / CAR-14 don't have a specific entry — they fall back
  // to the default (full union) range.
  const waistOptionsBySku: Record<string, string[]> = {
    "MN-1": ["28", "29", "30", "31", "32", "33", "34", "35", "36", "38", "40", "42", "44", "46", "48", "50", "52", "54"],
    "MNFR-1": ["30", "31", "32", "33", "34", "35", "36", "38", "40", "42", "44", "46"],
  };
  const lengthOptionsBySku: Record<string, string[]> = {
    "MN-1": ["28", "30", "32", "34", "36"],
    "MNFR-1": ["30", "32", "34", "36"],
  };
  // Default (CAR-12 / CAR-14, or any new waist-length SKU without an
  // explicit entry above) — full union range.
  const waistOptions = ["28", "29", "30", "31", "32", "33", "34", "35", "36", "38", "40", "42", "44", "46", "48", "50"];
  const lengthOptions = ["30", "32", "34", "36"];

  // Sizes shown in the size picker. For per-variant SKUs the list narrows
  // to whatever the currently selected variant carries; before a variant
  // is picked, show the union (sorted) so the user sees the full pool.
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

  // If the user switches variant and their previously-picked size isn't
  // offered in the new variant, clear it so they re-select consciously.
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track }) => {
    track(() => selectedVariant.value);
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
    setTimeout(() => { added.value = false; }, 1300);
  });

  // Re-initialise per-product UI state whenever the SKU changes. Because the
  // component instance is reused across [sku]→[sku] navigation, image index and
  // size/colour selections would otherwise carry over from the previous product
  // — a stale imgIndex past the new product's image count shows a blank main
  // image ("image doesn't load"). Tracking loc.params.sku re-runs this on every
  // navigation (and once during SSR for the first paint).
  useTask$(({ track }) => {
    track(() => loc.params.sku);
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
      // Variant SKUs always start on a selected variant — "Regular" when
      // available, otherwise the first variant — so the picker is never
      // left blank. Size is then chosen from that variant's run (prefer L).
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

  if (!product.value) {
    return (
      <div class="apparel-catalog" id="products">
        <div class="product-detail">
          <p style={{ padding: "2rem", textAlign: "center" }}>{t("product.notfound", locale.value)}</p>
          <button class="btn btn--primary" onClick$={() => nav("/apparel/")} style={{ margin: "0 auto", display: "block" }}>
            {t("apparel.title", locale.value)}
          </button>
        </div>
      </div>
    );
  }

  const p = product.value;
  const pdf = (p as any).pdf as string | undefined;
  // The breadcrumb category must read as the TAB the product lives under, not
  // its raw data category: the catalog remaps Safety Boots / Safety Shoes into
  // the "Footwear" tab (see product-catalog.tsx), so the crumb has to remap the
  // same way — otherwise a boot showed "Safety Shoes" while its tab said
  // "Safety Footwear". categoryLabel() then gives the identical label the tab
  // uses, so the two can't drift (the old per-category overrides did drift).
  const isFootwear = (c: string) => c === "Safety Boots" || c === "Safety Shoes" || c === "Footwear";
  const tabCategory = isFootwear(p.category) ? "Footwear" : p.category;
  const catHash = tabCategory.toLowerCase().replace(/\s+/g, "-");
  const backLabel = loginType.value === "tech" ? t("cat.Work Wear", locale.value) : t("nav.apparel", locale.value);
  const catLabel = categoryLabel(tabCategory, locale.value);

  return (
    <div class="apparel-catalog" id="products">
      <nav class="pdp-breadcrumb" aria-label="Breadcrumb">
        <Link href="/apparel/" class="pdp-breadcrumb__link pdp-breadcrumb__back">
          <svg class="pdp-breadcrumb__arrow" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          <span>{backLabel}</span>
        </Link>
        <Link href={`/apparel/#${catHash}`} class="pdp-breadcrumb__link pdp-breadcrumb__cat">{catLabel}</Link>
        <span class="pdp-breadcrumb__sku">{p.sku}</span>
        {/* Mobile: toggle between full-width image and the right preview rail.
            The icon shows the view you'll switch TO. */}
        <button
          class="pdp-breadcrumb__view"
          aria-label={imgLayout.value === "rail" ? "Full-width image" : "Show image previews"}
          onClick$={() => (imgLayout.value = imgLayout.value === "rail" ? "full" : "rail")}
        >
          {imgLayout.value === "rail" ? (
            // next: full-width image — expand-corners icon
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="M8 21H5a2 2 0 0 1-2-2v-3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>
          ) : (
            // next: preview rail — panel-right icon
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
          )}
        </button>
      </nav>
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
              <label class="product-modal__label">{t("modal.size", locale.value)}{variantSkus.has(p.sku) && selectedVariant.value && <span class="product-modal__color-inline"> — {selectedVariant.value}</span>}</label>
              <div class="product-modal__options">
                {sizeOptions.value.map((size) => (
                  <button
                    key={size}
                    class={`product-modal__option ${selectedSize.value === size ? "active" : ""}`}
                    onClick$={() => (selectedSize.value = size)}
                  >
                    {size === "One Size" ? t("modal.onesize", locale.value) : size}
                  </button>
                ))}
              </div>
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
                      {v}
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
                  <svg class="product-modal__add-pinwheel" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                    <polygon points="50,50 50,0 100,0" fill="#ffe2a6" />
                    <polygon points="50,50 100,0 100,50" fill="#ae1f2a" />
                    <polygon points="50,50 100,50 100,100" fill="#d43950" />
                    <polygon points="50,50 100,100 50,100" fill="#9ec069" />
                    <polygon points="50,50 50,100 0,100" fill="#7fa244" />
                    <polygon points="50,50 0,100 0,50" fill="#4689b3" />
                    <polygon points="50,50 0,50 0,0" fill="#31759c" />
                    <polygon points="50,50 0,0 50,0" fill="#ffd25b" />
                  </svg>
                  <svg class="product-modal__add-glyph product-modal__add-glyph--cart" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>
                  <svg class="product-modal__add-glyph product-modal__add-glyph--check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
      {(() => {
        // Same visibility map as the breadcrumb above — when the product's
        // category isn't a tab in the current login's catalog (e.g.
        // clothing user on MN-1 Pants), fall back to broader "More
        // Apparel" pulled from every visible category, instead of a
        // single-category list with a "cat.Pants" / "cat.Work Wear"
        // un-translated heading.
        const visibleByLogin: Record<string, string[]> = {
          clothing: ["Shirts", "Jackets", "Hats", "SWAG"],
          tech: ["Work Wear"],
          safety: ["Flame Resistant", "Shirts", "Hats"],
        };
        const visible = visibleByLogin[loginType.value] || visibleByLogin.clothing;
        const inVisible = visible.includes(p.category);
        const related = inVisible
          ? allProducts.filter((r) => r.sku !== p.sku && r.sku !== "CAR-12" && r.category === p.category).slice(0, 8)
          : allProducts.filter((r) => r.sku !== p.sku && r.sku !== "CAR-12" && visible.includes(r.category)).slice(0, 8);
        const headingSuffix = inVisible ? catLabel : t("nav.apparel", locale.value);
        return (
          <div class="related-items">
            {/* Heading above the related carousel — "More {Category}". */}
            <h3 class="related-items__title">{t("product.more", locale.value)} {headingSuffix}</h3>
            {/* Desktop grid */}
            <div class="related-items__grid">
              {related.slice(0, 4).map((item) => (
                <Link key={item.sku} href={`/apparel/${item.sku}/`} class="product-card product-card-link">
                  <div class="product-card__image">
                    <ProductImage src={item.img} alt={item.name} width={440} height={440} loading="eager" />
                  </div>
                  <div class="product-card__info">
                    <div class="product-card__name-row">
                      <div class="product-card__name">{item.name}</div>
                      <div class="product-card__price-group">
                        {!hidePrice && <div class="product-card__price">${(Number(item.price) || 0).toFixed(2)}</div>}
                        <span class="product-card__sizes">
                          {(item.sizes === "One Size" ? [t("modal.onesize", locale.value)] : sizeGroups(item.sizes)).map((g) => (
                            <span key={g} class="product-card__sizes-line">{g}</span>
                          ))}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
            {/* Mobile carousel */}
            <Carousel.Root class="related-carousel" slidesPerView={relatedPerView.value} gap={0.4} align="start" sensitivity={{ touch: 1.5, mouse: 1.5 }} rewind>
              <div class="related-carousel__wrapper">
                <Carousel.Previous class="related-carousel__arrow related-carousel__arrow--prev">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                </Carousel.Previous>
                <Carousel.Scroller class="related-carousel__scroller">
                  {related.map((item) => (
                    <Carousel.Slide key={item.sku} class="related-carousel__slide">
                      <Link href={`/apparel/${item.sku}/`} class="product-card product-card-link">
                        <div class="product-card__image">
                          <ProductImage src={item.img} alt={item.name} width={440} height={440} loading="lazy" />
                        </div>
                        <div class="product-card__info">
                          <div class="product-card__name-row">
                            <div class="product-card__name">{item.name}</div>
                            <div class="product-card__price-group">
                              {!hidePrice && <div class="product-card__price">${(Number(item.price) || 0).toFixed(2)}</div>}
                              <span class="product-card__sizes">
                          {(item.sizes === "One Size" ? [t("modal.onesize", locale.value)] : sizeGroups(item.sizes)).map((g) => (
                            <span key={g} class="product-card__sizes-line">{g}</span>
                          ))}
                        </span>
                            </div>
                          </div>
                        </div>
                      </Link>
                    </Carousel.Slide>
                  ))}
                </Carousel.Scroller>
                <Carousel.Next class="related-carousel__arrow related-carousel__arrow--next">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                </Carousel.Next>
              </div>
            </Carousel.Root>
          </div>
        );
      })()}
      {added.value && (
        <div class="toast">{t("modal.added", locale.value)} — {addedInfo.value}</div>
      )}
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

export const head: DocumentHead = ({ params }) => {
  const product = allProducts.find((p) => p.sku === params.sku);
  return {
    title: product ? `${product.name} - Tamarack Apparel` : "Product - Tamarack Apparel",
  };
};
