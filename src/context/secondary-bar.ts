import { createContextId } from "@builder.io/qwik";
import type { Signal } from "@builder.io/qwik";

// Shared state for the unified secondary bar (the strip beneath the site header:
// category tabs on the gallery, breadcrumb on the PDP). The bar is mounted once
// in the root shell (src/routes/layout.tsx) so it can outlive the catalog (e.g.
// on /checkout), but its tab controls drive the catalog's filtering — which lives
// in ProductCatalog, a descendant in a different subtree. A child can't provide
// context to a sibling, so the signals are created and provided in the root shell
// (the common ancestor) and both the bar and ProductCatalog consume them.
//
// This lives in its own module (not in layout.tsx) so the context id can be
// imported into Qwik's lazy component/QRL chunks cleanly, without pulling the
// route layout's server code along with it.
//
// Keep this a flat object of Signals only — Qwik serializes signals across
// SSR/resume and every lazy $ boundary; QRLs, computeds and functions do not
// belong in the stored value.
export interface SecondaryBarState {
  activeCat: Signal<string>;           // selected category tab ("All" = no filter)
  searchQuery: Signal<string>;         // catalog search text
  searchOpen: Signal<boolean>;         // tablet: search field opened over the tab strip
  visibleCategories: Signal<string[]>; // categories the bar renders; written by ProductCatalog
}

export const SecondaryBarContext = createContextId<SecondaryBarState>("secondary-bar");
