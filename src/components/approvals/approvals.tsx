import { component$, useSignal } from "@builder.io/qwik";
import type { PendingOrder, DecisionRow } from "../../routes/(shop)/layout";

// The order-approval area, shown to the authorizer login instead of the
// storefront. Lists orders awaiting authorization with Approve / Deny. The
// Qwik action auto-revalidates the loader, so an acted-on order drops off the
// list without a manual refresh. `approve`/`deny` are the route action stores.
interface Props {
  orders: PendingOrder[];
  history: DecisionRow[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  approve: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deny: any;
}

const money = (n: number) => `$${(Number(n) || 0).toFixed(2)}`;

export const Approvals = component$<Props>(({ orders, history, approve, deny }) => {
  const openId = useSignal<number | null>(null);
  return (
    <div class="approvals">
      <div class="approvals__head">
        <div>
          <h1 class="approvals__title">Order approvals</h1>
          <span class="approvals__count">{orders.length} awaiting approval</span>
        </div>
      </div>

      {orders.length === 0 ? (
        <div class="approvals__empty">No orders are waiting for approval right now.</div>
      ) : (
        <ul class="approvals__list">
          {orders.map((o) => {
            const busy = (approve.isRunning && approve.value?.id === o.id) || (deny.isRunning && deny.value?.id === o.id);
            return (
              <li key={o.id} class="approvals__card">
                <div class="approvals__card-head">
                  <div>
                    <div class="approvals__order-no">{o.po ? `PO ${o.po}` : o.orderNumber}</div>
                    <div class="approvals__meta">
                      {o.empName || "—"}{o.empDept ? ` · ${o.empDept}` : ""}
                    </div>
                    {o.createdAt && <div class="approvals__date">{o.createdAt}</div>}
                  </div>
                  <div class="approvals__total">{money(o.total)}</div>
                </div>

                <ul class="approvals__items">
                  {o.items.map((it, i) => (
                    <li key={i}>
                      <span class="approvals__item-name">{it.name}</span>
                      <span class="approvals__item-detail">
                        {[it.color, it.size].filter(Boolean).join(" / ")}
                        {it.quantity ? ` ×${it.quantity}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>

                <div class="approvals__actions">
                  <button
                    type="button"
                    class="approvals__btn approvals__btn--approve"
                    disabled={busy}
                    onClick$={() => approve.submit({ id: o.id })}
                  >
                    {busy ? "Working…" : "Approve"}
                  </button>
                  <button
                    type="button"
                    class="approvals__btn approvals__btn--deny"
                    disabled={busy}
                    onClick$={() => deny.submit({ id: o.id })}
                  >
                    Deny
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {history.length > 0 && (
        <div class="approvals__history">
          <h2 class="approvals__history-title">Recent Orders</h2>
          <ul class="approvals__history-list">
            {history.map((h) => (
              <li key={h.id} class={`approvals__history-row approvals__history-row--${h.decision} ${openId.value === h.id ? "is-open" : ""}`}>
                <button
                  type="button"
                  class="approvals__history-head"
                  aria-expanded={openId.value === h.id}
                  onClick$={() => (openId.value = openId.value === h.id ? null : h.id)}
                >
                  <span class={`approvals__history-badge approvals__history-badge--${h.decision}`}>
                    {h.decision === "approved" ? "Approved" : "Denied"}
                  </span>
                  <span class="approvals__history-no">{h.orderNumber || "—"}</span>
                  <span class="approvals__history-emp">
                    {h.empName}{h.empDept ? ` · ${h.empDept}` : ""}
                  </span>
                  <span class="approvals__history-total">{money(h.total)}</span>
                  <span class="approvals__history-at">{h.at}</span>
                  <span class="approvals__history-chev" aria-hidden="true">{openId.value === h.id ? "▾" : "▸"}</span>
                </button>
                {openId.value === h.id && (
                  <ul class="approvals__history-items">
                    {h.items.map((it, i) => (
                      <li key={i}>
                        <span class="approvals__item-name">{it.name}</span>
                        <span class="approvals__item-detail">
                          {[it.color, it.size].filter(Boolean).join(" / ")}
                          {it.quantity ? ` ×${it.quantity}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
});
