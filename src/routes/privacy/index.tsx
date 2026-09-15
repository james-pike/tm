import { component$, useContext } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { Link } from "@builder.io/qwik-city";
import { LocaleContext, t } from "../../i18n";

export default component$(() => {
  const locale = useContext(LocaleContext);
  const email = "info@tamarackapparel.ca";
  const body = t("privacy.body", locale.value);
  const [beforeResend, afterResend = ""] = body.split("Resend");
  const [middle = "", afterEmail = ""] = afterResend.split(email);
  return (
    // Reuse the shared page frame (surround + card ring + the persistent orange
    // strip below the header) so this document sits inside the same card the
    // catalog and product pages use — only the strip's text changes per view.
    <div class="privacy-page apparel-page dot-pattern">
      <div class="apparel-catalog" id="products">
        <nav class="pdp-breadcrumb" aria-label="Breadcrumb">
          <Link
            href="/"
            class="pdp-breadcrumb__link pdp-breadcrumb__back"
            onClick$={(e) => {
              // Go back to wherever the user came from rather than always Home;
              // fall back to Home (the href) when there's no history to go back to.
              if (typeof window !== "undefined" && window.history.length > 1) {
                e.preventDefault();
                window.history.back();
              }
            }}
          >
            <svg class="pdp-breadcrumb__arrow" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            {t("nav.back", locale.value)}
          </Link>
          <span class="pdp-breadcrumb__sku">{t("privacy.title", locale.value)}</span>
        </nav>
        <div class="product-detail">
          <div class="doc-panel">
            <h1 class="privacy-page__title">{t("privacy.title", locale.value)}</h1>
            <p class="privacy-page__body">
              {beforeResend}
              <a class="privacy-page__contact-link" href="https://resend.com" target="_blank" rel="noopener noreferrer">Resend</a>
              {middle}
              <a class="privacy-page__contact-link" href={`mailto:${email}`}>{email}</a>
              {afterEmail}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Privacy Policy — Tamarack Apparel",
};
