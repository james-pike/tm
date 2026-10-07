import { component$ } from "@builder.io/qwik";
import { isPortal, currentSeason, portalLabel, allowanceGuide } from "../../lib/portals";

interface AllowancePanelProps {
  /** Signed-in portal key (loginType.value). */
  portal: string;
  /** Current cart lines, so each row can show used-of-limit. */
  items?: { sku?: string | null; quantity: number }[];
}

/**
 * Always-visible allowance legend for the cart / checkout: lists EVERY item the
 * signed-in portal may order this season, with a dot meter and an "n / limit"
 * count showing how much of each cap the cart has used. Rules live in
 * src/lib/portals. Renders nothing for a portal with no caps.
 */
export const AllowancePanel = component$<AllowancePanelProps>(({ portal, items = [] }) => {
  if (!isPortal(portal)) return null;
  const season = currentSeason();
  const rows = allowanceGuide(portal, season, items);
  if (!rows.length) return null;
  return (
    <section class="allowance" aria-label="Ordering allowance">
      <div class="allowance__head">
        <h4 class="allowance__title">{portalLabel(portal)} — what you can order</h4>
        <span class="allowance__season">{season === "winter" ? "Winter" : "Summer"}</span>
      </div>
      <ul class="allowance__list">
        {rows.map((r) => (
          <li class={`allowance__row ${r.remaining <= 0 ? "allowance__row--full" : ""}`} key={r.key}>
            <span class="allowance__name">
              {r.label.charAt(0).toUpperCase() + r.label.slice(1)}
              {r.approval && <span class="allowance__tag">approval</span>}
            </span>
            <span class="allowance__meter" aria-hidden="true">
              {Array.from({ length: r.cap }).map((_, i) => (
                <span class={`allowance__pip ${i < r.used ? "is-used" : ""}`} key={i} />
              ))}
            </span>
            <span class="allowance__count">
              <strong>{r.used}</strong>/{r.cap}
            </span>
          </li>
        ))}
      </ul>
      <p class="allowance__note">Only these items and quantities can be ordered — anything more needs office approval.</p>
    </section>
  );
});
