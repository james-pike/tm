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
  const SHOW_HERO = false;  // Hero removed — the catalog + its sticky tab strip sits at the top.

  return (
    <div class="home-page">
      {/* Hero */}
      {SHOW_HERO && (
      <section class="hero">
        {/* Split hero that mirrors the login split panel exactly (see
            .login-modal--split): green iron "sign" pane on the left 1/3 carrying
            the brand lockup, brand photo on the right 2/3. Because it matches the
            login panel's geometry and logo placement 1:1, logging in fades the
            form out and the catalog in WITHOUT the logo moving or re-rendering. */}
        <div class="hero__upper hero__upper--split">
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

          {/* Left 1/3: green iron "sign" pane. The brand is stacked and top-
              anchored at the same padding as the login form-pane's header, so the
              logo occupies the identical spot across the login→home transition. */}
          <div class="hero__pane">
            <div class="hero__pane-header">
              <div class="hero__pane-brand">
                <img src="/tamarack-logo-white.png" alt="Tamarack" class="login-modal__logo-white" width="1451" height="250" fetchPriority="high" decoding="sync" />
                <span class="brand-apparel">Apparel</span>
              </div>
            </div>
          </div>

          {/* Right 2/3: brand photo — same image and crop as the login carousel. */}
          <div class="hero__media">
            <img class="hero__photo" src="/login-hero.jpg" alt="Tamarack Apparel" fetchPriority="high" decoding="sync" />
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
