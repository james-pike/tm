import { component$ } from "@builder.io/qwik";
import { useLocation, routeLoader$ } from "@builder.io/qwik-city";
import type { DocumentHead } from "@builder.io/qwik-city";
import { allProducts } from "../../apparel/products";
import { getLoginType } from "../../layout";
import { ProductDetailPanel } from "../../../components/product-detail/product-detail";

// Guards the /<sku>/ route. Unknown slugs (including the retired "/apparel"
// path) redirect to the catalog. The full-catalog login sees every product; a
// Group B session may only open products tagged for its lineup.
export const useProductGuard = routeLoader$((ev) => {
  const product = allProducts.find((p) => p.sku === ev.params.sku);
  if (!product) throw ev.redirect(302, "/");
  const lt = getLoginType(ev.cookie);
  const portals = (product as { portals?: string[] }).portals ?? [];
  // Labourers may only open products tagged for its lineup.
  if (lt === "labourers" && !portals.includes("labourers")) {
    throw ev.redirect(302, "/");
  }
  // "labourers-only" products are exclusive to the Labourers side — hide them
  // from Site Clerks (the full-catalog session) even via a direct URL.
  if (lt !== "labourers" && portals.includes("labourers-only")) {
    throw ev.redirect(302, "/");
  }
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
