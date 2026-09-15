import { component$ } from "@builder.io/qwik";
import { useLocation, routeLoader$ } from "@builder.io/qwik-city";
import type { DocumentHead } from "@builder.io/qwik-city";
import { allProducts } from "../../apparel/products";
import { ProductDetailPanel } from "../../../components/product-detail/product-detail";
import { ELECTRICAL_SKUS } from "../../../components/product-catalog/product-catalog";
import { getLoginType } from "../../layout";

// Guards the /<sku>/ route. Unknown slugs (including the retired "/apparel"
// path) redirect to the catalog. In addition, the Electrical portal is scoped
// to its own lineup: an electrical session may only open a SKU that is in
// ELECTRICAL_SKUS — any other product resolves to "not found" (server-side, so
// it can't be bypassed by editing the URL).
export const useProductGuard = routeLoader$((ev) => {
  const product = allProducts.find((p) => p.sku === ev.params.sku);
  if (!product) throw ev.redirect(302, "/");
  const lt = getLoginType(ev.cookie);
  const allowed = lt !== "electrical" || ELECTRICAL_SKUS.includes(ev.params.sku);
  if (!allowed) ev.status(404);
  return { allowed };
});

// The /<sku>/ route: a thin wrapper around <ProductDetailPanel>. It renders into
// the shared shell's main column (the group layout keeps ProductCatalog — and so
// the sidebar/header — mounted), so navigating catalog ↔ product never shifts.
export default component$(() => {
  const loc = useLocation();
  const guard = useProductGuard();
  if (!guard.value.allowed) {
    return (
      <div style="max-width:640px;margin:0 auto;padding:80px 24px;text-align:center;">
        <h1 style="font-size:22px;font-weight:700;margin:0 0 8px;color:#1b2a41;">Product not found</h1>
        <p style="color:#6b7280;margin:0 0 20px;">This item isn’t available in the Electrical catalogue.</p>
        <a href="/" style="display:inline-block;padding:10px 18px;background:#1b2a41;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">Back to catalogue</a>
      </div>
    );
  }
  return <ProductDetailPanel sku={loc.params.sku} />;
});

export const head: DocumentHead = ({ params, resolveValue }) => {
  const guard = resolveValue(useProductGuard);
  const product = allProducts.find((p) => p.sku === params.sku);
  return {
    title:
      guard.allowed && product
        ? `${product.name} - Tamarack Apparel`
        : "Product - Tamarack Apparel",
  };
};
