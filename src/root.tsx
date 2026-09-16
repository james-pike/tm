import { component$, isDev } from "@builder.io/qwik";
import { QwikCityProvider, RouterOutlet } from "@builder.io/qwik-city";
import { RouterHead } from "./components/router-head/router-head";

import "./global.css";

export default component$(() => {
  /**
   * The root of a QwikCity site always start with the <QwikCityProvider> component,
   * immediately followed by the document's <head> and <body>.
   *
   * Don't remove the `<head>` and `<body>` elements.
   */

  // viewTransition={false}: Qwik City otherwise wraps every SPA navigation in
  // document.startViewTransition(), which cross-fades a snapshot of the old page
  // into the new one. Navigating from a scrolled catalog, that fades the old
  // scrolled viewport into the new page at the top — the header and the tab /
  // breadcrumb strip visibly flash even though they are identical on both routes.
  // From an unscrolled page the two snapshots match, so nothing shows. Without
  // it, Qwik commits the DOM and sets the scroll in one synchronous block, so the
  // swap paints once.
  return (
    <QwikCityProvider viewTransition={false}>
      <head>
        <meta charset="utf-8" />
        <meta name="theme-color" content="#1B6551" />
        <meta name="google" content="notranslate" />
        {/* Tamarack mark. Explicit tags — without them the browser silently falls
            back to /favicon.ico, which used to be the inherited pinwheel. */}
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/favicon-192.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&family=Playfair+Display:wght@400;500;600;700&display=swap" rel="stylesheet" />

        {!isDev && (
          <link
            rel="manifest"
            href={`${import.meta.env.BASE_URL}manifest.json`}
          />
        )}
        <RouterHead />
        <style dangerouslySetInnerHTML={`
          html{overflow-y:scroll}
          body.loading{opacity:0}
          body.ready{opacity:1;transition:opacity 0.1s ease}
        `} />
        {/* Hero intro animations play on every home-page render — no session gate. */}
      </head>
      <body lang="en" translate="no" class="notranslate loading">
        <RouterOutlet />
        <script dangerouslySetInnerHTML="(function(){function r(){document.body.classList.remove('loading');document.body.classList.add('ready')}if(document.readyState!=='loading'){r()}else{document.addEventListener('DOMContentLoaded',r)}})()" />
      </body>
    </QwikCityProvider>
  );
});
