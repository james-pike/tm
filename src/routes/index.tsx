import { component$, useSignal, useContext, useVisibleTask$, useComputed$ } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { LocaleContext, t } from "../i18n";
import { ProductCatalog } from "../components/product-catalog/product-catalog";
import { LoginTypeContext } from "./layout";

export default component$(() => {
  const locale = useContext(LocaleContext);
  const loginType = useContext(LoginTypeContext);
  const isTech = useComputed$(() => loginType.value === "tech");
  const hasCartItems = useSignal(false);

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

  // Hero temporarily disabled so the catalog (and its sticky tab strip) sits at
  // the top of the page by default. Flip to true to restore — and re-enable the
  // header's hero slide-in in layout.tsx (search "SHOW_HERO") to match.
  const SHOW_HERO = true;   // Tamarack: full-width hero cover (as in the mn project)

  return (
    <div class="home-page">
      {/* Hero */}
      {SHOW_HERO && (
      <section class="hero">
        {/* Upper 2/3: the green iron-textured "sign" surface (same as the header
            / login sign), with an enlarged centered brand logo. */}
        <div class="hero__upper hero__upper--brand">
          {/* Floating nav header */}
          <div class="hero-card-header">
            <a href="/" class="hero-card-header__logo" aria-label="Home" />

            <nav class="hero-card-header__nav">
              <a href="/" class="hero-card-header__nav-link active">{t("nav.home", locale.value)}</a>
              <a href="/apparel/" class="hero-card-header__nav-link">{isTech.value ? t("teaser.workwear.title", locale.value) : t("nav.apparel", locale.value)}</a>
            </nav>
            <div class="hero-card-header__actions">
              <button class="hero-card-header__btn hero-card-header__btn--locale" onClick$={() => {
                const btn = document.querySelector('.locale-btn') as HTMLElement;
                btn?.click();
              }} aria-label="Toggle language">
                <span class="hero-card-header__btn-label">{locale.value === "en" ? "Français" : "English"}</span>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
              </button>
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
            <p class="hero__tagline">{t("hero.subtitle", locale.value)}</p>
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
    { name: "theme-color", content: "#1B6551" },
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
