import { component$ } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";

// The catalog IS the home route. The ProductCatalog shell is rendered by the
// group layout; this entry just provides the route + document head. The catalog
// grid shows because the layout's <Slot/> (this component) is empty.
export default component$(() => {
  return <></>;
});

export const head: DocumentHead = {
  title: "Tamarack Apparel",
  meta: [
    { name: "description", content: "Premium Branded Tamarack Apparel" },
    { name: "robots", content: "noindex, nofollow" },
    { name: "theme-color", content: "#ffffff" },
    { property: "og:title", content: "Tamarack Apparel" },
    { property: "og:description", content: "Premium Branded Tamarack Apparel" },
    { property: "og:type", content: "website" },
    { property: "og:url", content: "https://www.tamarackapparel.ca/" },
    { property: "og:image", content: "https://www.tamarackapparel.ca/tamarack-logo.png" },
    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: "Tamarack Apparel" },
    { name: "twitter:description", content: "Premium Branded Tamarack Apparel" },
    { name: "twitter:image", content: "https://www.tamarackapparel.ca/tamarack-logo.png" },
  ],
};
