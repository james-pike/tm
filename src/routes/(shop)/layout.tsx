import { component$, Slot } from "@builder.io/qwik";
import { useLocation, useNavigate } from "@builder.io/qwik-city";
import { ProductCatalog } from "../../components/product-catalog/product-catalog";

// ONE shared shell for the whole shop: the catalog at "/" and each product at
// "/<sku>/". The sidebar + header live inside ProductCatalog and stay mounted as
// a single instance across the catalog ↔ product navigation, so there is no
// layout shift and no styling divergence between the two views. On a product
// route the routed <Slot/> (the product detail) renders in ProductCatalog's main
// column instead of the grid.
//
// No server auth guard here: unauthenticated visitors are blocked client-side by
// the login overlay (root layout locks scroll + covers the screen until login),
// the same way the home route always worked. A server redirect to "/" would loop
// here, since "/" is this very route.
export default component$(() => {
  const loc = useLocation();
  const nav = useNavigate();
  return (
    <div
      class="apparel-page dot-pattern"
      onClick$={(e, el) => {
        // On a product page, clicking the outermost page margin (the greige
        // gutter around the whole route) returns to the catalog. Only fires when
        // this wrapper itself is the click target — never its content.
        if (loc.url.pathname.replace(/\/+$/, "") === "") return; // catalog home
        if (e.target === el) nav("/");
      }}
    >
      <ProductCatalog>
        <Slot />
      </ProductCatalog>
    </div>
  );
});
