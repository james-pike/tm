/**
 * Card-payment cancel page. Stripe redirects here if the customer backs out of
 * the Checkout page. The cart is left intact so they can try again.
 */
import { component$ } from "@builder.io/qwik";
import { Link } from "@builder.io/qwik-city";
import type { DocumentHead } from "@builder.io/qwik-city";

export default component$(() => {
  return (
    <div class="checkout-result">
      <div class="checkout-result__card">
        <div class="checkout-result__icon checkout-result__icon--cancel">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18" /><path d="M6 6l12 12" /></svg>
        </div>
        <h1 class="checkout-result__title">Payment cancelled</h1>
        <p class="checkout-result__text">
          No charge was made and your cart is still saved. You can return to your
          cart and try again whenever you're ready.
        </p>
        <Link href="/" class="btn btn--primary">Back to apparel</Link>
      </div>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Payment cancelled — Tamarack Apparel",
};
