import { component$ } from "@builder.io/qwik";
import { useLocation, routeLoader$ } from "@builder.io/qwik-city";
import type { DocumentHead } from "@builder.io/qwik-city";
import { allProducts } from "../../apparel/products";
import { ProductDetailPanel } from "../../../components/product-detail/product-detail";

// Guards the /<sku>/ route. Unknown slugs (including the retired "/apparel"
// path) redirect to the catalog. Tamarack is a single open catalog — every
// known product is viewable.
export const useProductGuard = routeLoader$((ev) => {
  const product = allProducts.find((p) => p.sku === ev.params.sku);
  if (!product) throw ev.redirect(302, "/");
  return {};
});

// The /<sku>/ route: a thin wrapper around <ProductDetailPanel>. It renders into
// the shared shell's main column (the group layout keeps ProductCatalog — and so
// the sidebar/header — mounted), so navigating catalog ↔ product never shifts.
export default component$(() => {
  const loc = useLocation();
  useProductGuard();
  return <ProductDetailPanel sku={loc.params.sku} />;
});

export const head: DocumentHead = ({ params }) => {
  const product = allProducts.find((p) => p.sku === params.sku);
  return {
    title: product
      ? `${product.name} - Tamarack Apparel`
      : "Product - Tamarack Apparel",
  };
};
