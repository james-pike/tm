import { component$, useContext } from "@builder.io/qwik";
import { Link } from "@builder.io/qwik-city";
import type { DocumentHead } from "@builder.io/qwik-city";
import { LocaleContext, t } from "../i18n";

export default component$(() => {
  const locale = useContext(LocaleContext);
  return (
    <div class="not-found-page">
      <div class="not-found-page__inner">
        <h1 class="not-found-page__code">404</h1>
        <p class="not-found-page__text">
          {locale.value === "fr" ? "Page introuvable." : "Page not found."}
        </p>
        <Link href="/" class="btn btn--primary">{t("nav.home", locale.value)}</Link>
      </div>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Not Found — Tamarack Apparel",
  meta: [
    { name: "robots", content: "noindex, nofollow" },
  ],
};
