/**
 * Card-payment return page. Stripe redirects here with ?session_id=... after a
 * successful Checkout. The webhook is what actually finalizes the order; this
 * page just confirms to the customer and clears their cart.
 */
import { component$, useVisibleTask$ } from "@builder.io/qwik";
import { routeLoader$, Link } from "@builder.io/qwik-city";
import type { DocumentHead } from "@builder.io/qwik-city";
import { retrieveCheckoutSession } from "../../../lib/stripe";

export const useSession = routeLoader$(async ({ query, env }) => {
  const sessionId = query.get("session_id") || "";
  const stripeKey = env.get("STRIPE_SECRET_KEY");
  if (!sessionId || !stripeKey) return { ok: false as const, orderNumber: "", paid: false };
  try {
    const s = await retrieveCheckoutSession(stripeKey, sessionId);
    return {
      ok: true as const,
      orderNumber: s.metadata?.order_number || "",
      paid: s.payment_status === "paid",
    };
  } catch {
    return { ok: false as const, orderNumber: "", paid: false };
  }
});

export default component$(() => {
  const session = useSession();

  // Clear the cart on a confirmed return (payment happened before this page).
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(() => {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith("ce_cart_mn_")) localStorage.removeItem(k);
      }
      document.cookie = "ce_cart_count=0;path=/;max-age=31536000";
      window.dispatchEvent(new CustomEvent("cart-updated"));
    } catch { /* ignore */ }
  });

  return (
    <div class="checkout-result">
      <div class="checkout-result__card">
        <div class="checkout-result__icon checkout-result__icon--ok">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
        </div>
        <h1 class="checkout-result__title">Thank you for your order!</h1>
        <p class="checkout-result__text">
          {session.value.orderNumber
            ? `Order ${session.value.orderNumber} has been confirmed and sent for processing.`
            : "It has been confirmed and sent for processing."}
        </p>
        <Link href="/" class="btn btn--primary">Continue</Link>
      </div>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Order confirmed — Tamarack Apparel",
};
