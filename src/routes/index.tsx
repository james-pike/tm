import { component$, useSignal, useContext, useVisibleTask$, useComputed$ } from "@builder.io/qwik";
import { Carousel } from "@qwik-ui/headless";
import type { DocumentHead } from "@builder.io/qwik-city";
import { LocaleContext, t } from "../i18n";
import { ProductCatalog } from "../components/product-catalog/product-catalog";
import { LoginTypeContext } from "./layout";

export default component$(() => {
  const locale = useContext(LocaleContext);
  const loginType = useContext(LoginTypeContext);
  const isTech = useComputed$(() => loginType.value === "tech");
  const isSafety = useComputed$(() => loginType.value === "safety");
  const hasCartItems = useSignal(false);
  const heroIndex = useSignal(0);
  const carouselPaused = useSignal(false);
  const touchStartX = useSignal(0);
  const touchStartY = useSignal(0);

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => {
    const check = () => {
      try {
        const cart = JSON.parse(localStorage.getItem("ce_cart") || "[]");
        hasCartItems.value = cart.length > 0;
      } catch { hasCartItems.value = false; }
    };
    check();
    window.addEventListener("cart-updated", check);
    cleanup(() => window.removeEventListener("cart-updated", check));

    // Always play the hero intro animations on every render of the home page.
    // (Earlier we gated this on sessionStorage; that suppressed the animation
    // even on login, so the gate has been removed.)
    document.documentElement.classList.remove("mn-hero-no-anim");
    // Once the intro has finished, re-pin the final state. Otherwise a later
    // re-render that adds letters to the headline — e.g. switching language,
    // where APPAREL (7) becomes VÊTEMENTS (9) — replays the per-letter fade on
    // just the newly-added trailing letters, so they appear to lag behind.
    const introDone = setTimeout(() => {
      document.documentElement.classList.add("mn-hero-no-anim");
    }, 3000);
    cleanup(() => clearTimeout(introDone));
  });

  // Carousel autoplay (manual to avoid qwik-ui serialization bug)
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => {
    const id = setInterval(() => {
      if (carouselPaused.value) return;
      heroIndex.value = (heroIndex.value + 1) % 3;
    }, 9000);
    // Resume autoplay when user clicks anywhere outside a carousel pagination
    const onDocClick = (e: MouseEvent) => {
      if (!carouselPaused.value) return;
      const target = e.target as HTMLElement;
      if (!target.closest('.hero-carousel__dots, .hero-bento-carousel__dots')) {
        carouselPaused.value = false;
      }
    };
    document.addEventListener('click', onDocClick);
    cleanup(() => {
      clearInterval(id);
      document.removeEventListener('click', onDocClick);
    });
  });

  // Hero temporarily disabled so the catalog (and its sticky tab strip) sits at
  // the top of the page by default. Flip to true to restore — and re-enable the
  // header's hero slide-in in layout.tsx (search "SHOW_HERO") to match.
  const SHOW_HERO = true;   // Tamarack: full-width hero cover (as in the mn project)

  return (
    <div class="home-page">
      {/* Hero */}
      {SHOW_HERO && (
      <section class="hero">
        {/* Upper 2/3: full-width carousel as background, with text + nav overlaid */}
        <div
          class="hero__upper"
          onClick$={(e) => {
            // Advance the carousel when the user taps the dark hero overlay
            // (vignette / centered text). Skip clicks on real interactive
            // elements so buttons, links, pagination dots, etc. still work.
            const target = e.target as HTMLElement | null;
            if (!target) return;
            if (target.closest('button, a, input, label, [role="button"], .hero-carousel__dots, .hero-carousel__pagination')) return;
            carouselPaused.value = true;
            heroIndex.value = (heroIndex.value + 1) % 3;
          }}
        >
          <Carousel.Root class="hero-carousel" bind:selectedIndex={heroIndex} align="start" draggable={false} rewind>
            <Carousel.Scroller
              class="hero-carousel__scroller"
              onTouchStart$={(e) => {
                if (e.touches.length !== 1) return;
                touchStartX.value = e.touches[0].clientX;
                touchStartY.value = e.touches[0].clientY;
              }}
              onTouchEnd$={(e) => {
                const t = e.changedTouches[0];
                const dx = t.clientX - touchStartX.value;
                const dy = t.clientY - touchStartY.value;
                if (Math.abs(dx) < 40 || Math.abs(dy) > Math.abs(dx)) return;
                carouselPaused.value = true;
                heroIndex.value = (heroIndex.value + 1) % 3;
              }}
            >
              <Carousel.Slide class="hero-carousel__slide">
                <img src="/hero.jpg" alt="Tamarack hero" loading="eager" />
              </Carousel.Slide>
              <Carousel.Slide class="hero-carousel__slide hero-carousel__slide--van">
                <img src="/hero-edmonton-van.jpg" alt="Tamarack service van" class="hero-carousel__van-img" loading="eager" />
              </Carousel.Slide>
              <Carousel.Slide class="hero-carousel__slide">
                <img src="/hero-wills.jpg" alt="Tamarack Limited building sign at dusk" loading="eager" />
              </Carousel.Slide>
            </Carousel.Scroller>

            <Carousel.Pagination class="hero-carousel__dots" onClick$={() => { carouselPaused.value = true; }}>
              <Carousel.Bullet class="hero-carousel__dot" />
              <Carousel.Bullet class="hero-carousel__dot" />
              <Carousel.Bullet class="hero-carousel__dot" />
            </Carousel.Pagination>
          </Carousel.Root>

          {/* Vignette gradient for text readability */}
          <div class="hero__vignette" />

          {/* Floating nav header */}
          <div class="hero-card-header">
            <a href="/" class="hero-card-header__logo" aria-label="Home" />

            <nav class="hero-card-header__nav">
              <a href="/" class="hero-card-header__nav-link active">{t("nav.home", locale.value)}</a>
              <a href="/apparel/" class="hero-card-header__nav-link">{isTech.value ? t("teaser.workwear.title", locale.value) : t("nav.apparel", locale.value)}</a>
            </nav>
            <div class="hero-card-header__actions">
              <button class={`hero-card-header__btn hero-card-header__btn--cart ${hasCartItems.value ? "hero-card-header__btn--cart-active" : ""}`} onClick$={() => {
                const btn = document.querySelector('.cart-btn') as HTMLElement;
                btn?.click();
              }} aria-label="Cart">
                <span class="hero-card-header__btn-label">{t("cart.mycart", locale.value)}</span>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>
              </button>
              <button class="hero-card-header__btn hero-card-header__btn--logout" onClick$={() => {
                const btn = document.querySelector('.logout-btn') as HTMLElement;
                btn?.click();
              }} aria-label={t("login.logout", locale.value)}>
                <span class="hero-card-header__btn-label">{t("login.logout", locale.value)}</span>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              </button>
              <button class="hero-card-header__btn" onClick$={() => {
                const btn = document.querySelector('.hamburger-btn') as HTMLElement;
                btn?.click();
              }} aria-label="Menu">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h18"/><path d="M3 6h18"/><path d="M3 18h18"/></svg>
              </button>
            </div>
          </div>

          {/* Brand lockup — same side-by-side format as the header (Tamarack
              wordmark + APPAREL overlapping its tail), scaled up for the hero. */}
          <div class="hero__text hero__text--wills">
            <div class="hero__brand-lockup">
              <img class="hero__brand-logo" src="/tamarack-logo-white.png" alt="Tamarack" width="1451" height="250" fetchPriority="high" decoding="sync" />
              <span class="hero__brand-apparel">{t("logo.apparel", locale.value).toUpperCase()}</span>
            </div>
          </div>
        </div>

        {/* Bottom 1/3: category cards */}
        <div class="hero__lower">
          <div class="hero-categories">
                {isTech.value ? (<>
                  <a href="/apparel/" class="category-card category-card--tech-primary">
                    <picture>
                      <source media="(max-width: 767px)" srcset="/mn-services/chiller-retrofit.jpeg" />
                      <source media="(min-width: 768px) and (max-width: 1024px)" srcset="/mn-services/hvac-retrofit.jpeg" />
                      <img src="/mn-services/boiler-technicians.jpeg" alt="Work Wear" width="400" height="300" loading="eager" decoding="sync" />
                    </picture>
                    <span class="category-card__label">{t("teaser.workwear.title", locale.value)}</span>
                  </a>
                  <a href="/apparel/" class="category-card category-card--tech-extra category-card--tech-desktop">
                    <img src="/mn-services/careers.jpeg" alt="" width="400" height="300" loading="eager" decoding="sync" />
                  </a>
                  <a href="/apparel/" class="category-card category-card--tech-extra category-card--tech-desktop">
                    <img src="/mn-services/hvac-retrofit.jpeg" alt="" width="400" height="300" loading="eager" decoding="sync" />
                  </a>
                  <a href="/apparel/" class="category-card category-card--tech-extra category-card--tech-tablet">
                    <img src="/mn-services/chiller-retrofit.jpeg" alt="" width="400" height="300" loading="eager" decoding="sync" />
                  </a>
                </>) : isSafety.value ? (<>
                  {/* Safety uses plain .category-card on all four cards (no
                      --tech-primary / --tech-extra) so the layout is a uniform
                      2x2 on mobile and tablet, 4-up row on desktop. */}
                  <a href="/apparel/" class="category-card">
                    <img src="/hero.jpg" alt="Flame Resistant" width="400" height="300" loading="eager" decoding="sync" />
                    <span class="category-card__label">{t("cat.Flame Resistant", locale.value)}</span>
                  </a>
                  <a href="/apparel/#shirts" class="category-card">
                    <img src="/shirts.jpg" alt="Classic Shirts" width="400" height="300" loading="eager" decoding="sync" />
                    <span class="category-card__label">{t("teaser.polos.title", locale.value)}</span>
                  </a>
                  <a href="/apparel/#hats" class="category-card">
                    <div class="category-card__split">
                      <img src="/swag/cap.png" alt="Ball cap" width="200" height="300" loading="eager" decoding="sync" />
                      <img src="/sku/toque-removebg-preview.png" alt="Toque" class="category-card__split-img--pad" width="200" height="300" loading="eager" decoding="sync" />
                    </div>
                    <span class="category-card__label">{t("teaser.hats.title", locale.value)}</span>
                  </a>
                  <a href="/apparel/" class="category-card">
                    <img src="/jackets.jpg" alt="" width="400" height="300" loading="eager" decoding="sync" />
                  </a>
                </>) : (<>
                  <a href="/apparel/#polos" class="category-card">
                    <img src="/shirts.jpg" alt="Classic Shirts" width="400" height="300" loading="eager" decoding="sync" />
                    <span class="category-card__label">{t("teaser.polos.title", locale.value)}</span>
                  </a>
                  <a href="/apparel/#jackets" class="category-card">
                    <img src="/jackets.jpg" alt="Jackets & Hoodies" width="400" height="300" loading="eager" decoding="sync" />
                    <span class="category-card__label">{t("teaser.jackets.title", locale.value)}</span>
                  </a>
                  <a href="/apparel/#hats" class="category-card">
                    <div class="category-card__split">
                      <img src="/swag/cap.png" alt="Ball cap" width="200" height="300" loading="eager" decoding="sync" />
                      <img src="/sku/toque-removebg-preview.png" alt="Toque" class="category-card__split-img--pad" width="200" height="300" loading="eager" decoding="sync" />
                    </div>
                    <span class="category-card__label">{t("teaser.hats.title", locale.value)}</span>
                  </a>
                  <a href="/apparel/#swag" class="category-card">
                    <div class="category-card__split">
                      <img src="/swag/yeti.png" alt="Yeti tumbler" width="200" height="300" loading="eager" decoding="sync" />
                      <img src="/swag/Tundra.png" alt="Yeti cooler" width="200" height="300" loading="eager" decoding="sync" />
                    </div>
                    <span class="category-card__label">{t("cat.SWAG", locale.value)}</span>
                  </a>
                </>)}
          </div>
        </div>

      </section>
      )}



      {/* Apparel Catalog */}
      <ProductCatalog />
    </div>
  );
});

export const head: DocumentHead = {
  title: "Tamarack Apparel",
  meta: [
    { name: "description", content: "Premium Branded Tamarack Apparel" },
    { name: "robots", content: "noindex, nofollow" },
    { name: "theme-color", content: "#2e7d32" },
    { property: "og:title", content: "Tamarack Apparel" },
    { property: "og:description", content: "Premium Branded Tamarack Apparel" },
    { property: "og:type", content: "website" },
    { property: "og:url", content: "https://tamarackapparel.ca/" },
    { property: "og:image", content: "https://tamarackapparel.ca/wills-logo.png" },
    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: "Tamarack Apparel" },
    { name: "twitter:description", content: "Premium Branded Tamarack Apparel" },
    { name: "twitter:image", content: "https://tamarackapparel.ca/wills-logo.png" },
  ],
};
