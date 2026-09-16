/**
 * Checkout page. This is the "details" step that used to live inside the cart
 * drawer, lifted onto its own route so it's a real, linkable URL (the standard
 * ecommerce mini-cart → checkout-page flow). The design is unchanged: it reuses
 * the exact drawer markup and classes (.drawer.cart-drawer / .checkout-modal__*
 * / .cart-drawer__*), so it renders pixel-identical to the old drawer step.
 *
 * The cart itself stays a slide-in drawer in the layout; its "Checkout" button
 * now navigates here. Payment is purchase-order only (no Stripe / gift card),
 * matching the rest of mn2.
 */
import { component$, useSignal, useStore, useComputed$, useContext, useVisibleTask$, $ } from "@builder.io/qwik";
import { Link, useNavigate } from "@builder.io/qwik-city";
import type { DocumentHead } from "@builder.io/qwik-city";
import { Modal, Collapsible } from "@qwik-ui/headless";
import { LocaleContext, t } from "../../i18n";
import { colorName } from "../apparel/products";
import { LoginTypeContext, useSubmitOrder } from "../layout";

// Provincial tax rates — mirrors the layout's table so the checkout total can
// update live as soon as a province is picked (the server re-derives it too).
const PROVINCE_TAX: Record<string, number> = {
  AB: 0.05, BC: 0.12, MB: 0.12, NB: 0.15, NL: 0.15,
  NS: 0.14, ON: 0.13, PE: 0.15, QC: 0.14975, SK: 0.11,
};
const taxRateFor = (code: string): number | undefined => PROVINCE_TAX[code];

function stripColorSuffix(name: string): string {
  const i = name.lastIndexOf(" - ");
  return i > -1 ? name.slice(0, i) : name;
}

interface CartItem {
  name: string;
  sku: string;
  category: string;
  size: string;
  color: string;
  quantity: number;
  price: number;
  img: string;
  waist?: string;
  length?: string;
  variant?: string;
  code?: string;
}

export default component$(() => {
  const nav = useNavigate();
  const locale = useContext(LocaleContext);
  const loginType = useContext(LoginTypeContext);
  const orderAction = useSubmitOrder();

  const cart = useStore<{ items: CartItem[] }>({ items: [] });
  const cartHydrated = useSignal(false);

  const summaryOpen = useSignal(true);
  const formError = useSignal("");
  const formTouched = useSignal(false);
  const submitting = useSignal(false);
  const orderSubmitted = useSignal(false);
  const orderNum = useSignal("");
  // Server/submission failure (DB, network) shown in a prominent modal — as
  // visible as the success modal — separate from inline field-validation.
  const serverError = useSignal("");
  const showError = useSignal(false);
  // One stable idempotency key per checkout visit — shared across all retries
  // so a re-submit can never create a duplicate order (server dedupes on it).
  const idempotencyKey = useSignal("");

  const empFirstName = useSignal("");
  const empLastName = useSignal("");
  const empEmail = useSignal("");
  const empPhone = useSignal("");
  const empDept = useSignal("");
  const empProvince = useSignal("");
  const empAddress1 = useSignal("");
  const empCity = useSignal("");
  const empPostal = useSignal("");
  const empPO = useSignal("");

  const cartCount = useComputed$(() => cart.items.reduce((sum, i) => sum + i.quantity, 0));
  const subtotal = useComputed$(() => cart.items.reduce((sum, i) => sum + (Number(i.price) || 0) * i.quantity, 0));
  const taxRate = useComputed$(() => taxRateFor(empProvince.value));
  const taxAmount = useComputed$(() => (taxRate.value === undefined ? undefined : subtotal.value * taxRate.value));
  const orderTotal = useComputed$(() => subtotal.value + (taxAmount.value ?? 0));
  const taxLabel = useComputed$(() => {
    if (taxRate.value === undefined) return t("cart.invoice.tax", locale.value);
    const pct = +(taxRate.value * 100).toFixed(3);
    return `${t("cart.invoice.tax", locale.value)} (${empProvince.value} ${pct}%)`;
  });
  // Every required field filled + a PO number — drives the greyed-out button.
  // Detailed email/phone/postal FORMAT checks stay on submit.
  const canPlaceOrder = useComputed$(() => {
    if (!empFirstName.value.trim() || !empLastName.value.trim() || !empEmail.value.trim()
        || !empPhone.value.trim() || !empProvince.value) return false;
    if (!empAddress1.value.trim() || !empCity.value.trim() || !empPostal.value.trim()) return false;
    if (!empPO.value.trim()) return false;
    return true;
  });

  // Load the cart from localStorage (the drawer writes it there) and stay in
  // sync with add/remove events fired elsewhere in the app.
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => {
    const loadCart = () => {
      try {
        const saved = localStorage.getItem(`ce_cart_mn_${loginType.value || "clothing"}`);
        cart.items = saved ? (JSON.parse(saved) as CartItem[]) : [];
      } catch {
        cart.items = [];
      }
      cartHydrated.value = true;
    };
    loadCart();
    window.addEventListener("cart-updated", loadCart);
    cleanup(() => window.removeEventListener("cart-updated", loadCart));
  });

  // Mint one idempotency key for this checkout visit (client-side only, so SSR
  // and client agree). Retries reuse it; a fresh visit gets a fresh key.
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(() => {
    if (idempotencyKey.value) return;
    try {
      idempotencyKey.value = crypto.randomUUID();
    } catch {
      idempotencyKey.value = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
  });

  const submitOrder = $(async () => {
    if (!canPlaceOrder.value || submitting.value) return;
    formTouched.value = true;
    if (!empFirstName.value || !empLastName.value || !empAddress1.value || !empCity.value
        || !empPostal.value || !empEmail.value || !empPhone.value || !empProvince.value || !empPO.value) {
      formError.value = t("cart.error.required", locale.value);
      return;
    }
    // Field-format checks — collect ALL failures so every invalid field is
    // reported together in one submit, not one at a time.
    const fmtErrors: string[] = [];
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(empEmail.value.trim())) fmtErrors.push(t("cart.error.email", locale.value));
    const phoneDigits = empPhone.value.replace(/[^\d]/g, "");
    if (phoneDigits.length < 10 || phoneDigits.length > 15 || !/^[\d\s+()\-.]+$/.test(empPhone.value.trim())) fmtErrors.push(t("cart.error.phone", locale.value));
    if (!/^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/.test(empPostal.value.trim())) fmtErrors.push(t("cart.error.postal", locale.value));
    if (fmtErrors.length) {
      formError.value = fmtErrors.join("\n");
      return;
    }
    formError.value = "";

    // Guarantee a key even if the mount task hasn't run yet.
    if (!idempotencyKey.value) {
      try {
        idempotencyKey.value = crypto.randomUUID();
      } catch {
        idempotencyKey.value = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      }
    }

    const device: "mobile" | "tablet" | "desktop" = window.innerWidth <= 600 ? "mobile" : window.innerWidth <= 1024 ? "tablet" : "desktop";
    const orderData = {
      paymentMethod: "po" as const,
      device,
      employee: {
        name: `${empFirstName.value} ${empLastName.value}`,
        email: empEmail.value,
        phone: empPhone.value,
        department: empDept.value,
        province: empProvince.value,
        address1: empAddress1.value,
        city: empCity.value,
        postal: empPostal.value,
        po: empPO.value,
      },
      items: cart.items.map((i: any) => ({
        name: i.name || "",
        sku: i.sku || "",
        color: i.color || "",
        size: i.size || "",
        quantity: Number(i.quantity) || 1,
        price: Number(i.price) || 0,
        ...(i.waist ? { waist: i.waist } : {}),
        ...(i.length ? { length: i.length } : {}),
        ...(i.variant ? { variant: i.variant } : {}),
        ...(i.code ? { code: i.code } : {}),
      })),
      date: new Date().toLocaleDateString("en-CA"),
      // Stable per-checkout key so retries can't create a duplicate order.
      idempotencyKey: idempotencyKey.value,
    };

    submitting.value = true;

    // Auto-retry until the order is confirmed placed, then surface a failure.
    // Both transient network drops and server-reported failures are retried —
    // safe because the idempotency key means a re-submit that already saved
    // just returns the same order rather than creating a second one. This
    // covers Turso cold starts and blips transparently while the spinner spins.
    const MAX_TRIES = 3;
    let v: any = null;
    let lastNetworkErr: any = null;
    for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
      try {
        const result = await orderAction.submit(orderData);
        v = result?.value ?? null;
        lastNetworkErr = null;
      } catch (err) {
        lastNetworkErr = err;
        v = null;
        console.error(`Order submit threw (attempt ${attempt}/${MAX_TRIES}):`, err);
      }
      if (v?.success === true) break;
      console.error(`Order not confirmed (attempt ${attempt}/${MAX_TRIES}):`, v ?? lastNetworkErr);
      if (attempt < MAX_TRIES) await new Promise((r) => setTimeout(r, 1500 * attempt));
    }

    if (v?.success !== true) {
      let msg = "";
      if (lastNetworkErr) {
        msg = (lastNetworkErr as Error)?.message || t("cart.error.network", locale.value);
      } else {
        msg = v?.message;
        if (!msg && v?.fieldErrors) {
          const flat: string[] = [];
          const walk = (obj: any) => {
            if (Array.isArray(obj)) flat.push(...obj.map(String));
            else if (obj && typeof obj === "object") Object.values(obj).forEach(walk);
          };
          walk(v.fieldErrors);
          msg = flat.join(", ");
        }
        if (!msg && v?.formErrors?.length) msg = v.formErrors.join(", ");
        msg = msg || t("cart.error.unconfirmed", locale.value);
      }
      serverError.value = msg;
      showError.value = true;
      console.error("Order submission failed after retries.");
      submitting.value = false;
      return;
    }

    // Order saved. Clear the cart, tell the rest of the app, and show the
    // confirmation. (mn2 is PO-only, so there's never a Stripe redirect.)
    orderNum.value = v?.orderNumber || "";
    try {
      localStorage.removeItem(`ce_cart_mn_${loginType.value || "clothing"}`);
      document.cookie = "ce_cart_count=0;path=/;max-age=31536000";
    } catch { /* ignore */ }
    cart.items = [];
    window.dispatchEvent(new CustomEvent("cart-updated"));
    orderSubmitted.value = true;
    submitting.value = false;
  });

  const isEmpty = cartHydrated.value && cart.items.length === 0;

  return (
    <div class="modal-overlay checkout-page">
      <div class="drawer cart-drawer">
        <div class="cart-drawer__site-header">
          <Link href="/" class="site-header__logo">
            <img src="/logo.png" alt="Tamarack" class="site-header__logo-img" width="200" height="200" loading="eager" decoding="sync" />
          </Link>
          <nav class="site-header__nav">
            <button class="cart-btn" onClick$={() => nav("/")}>
              <span class="cart-btn__label">{t("cart.mycart", locale.value)}</span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
            </button>
          </nav>
        </div>
        <div class="cart-drawer__header">
          <h2 class="cart-drawer__title">{t("cart.title", locale.value)} <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg></h2>
          <Link href="/" class="modal__close cart-drawer__close-desktop">x</Link>
        </div>
        {isEmpty ? (
          <div class="cart-drawer__empty">
            <p>{t("cart.empty", locale.value)}</p>
            <Link href="/" class="cart-drawer__back-link">{t("cart.backtoapparel", locale.value)}</Link>
          </div>
        ) : (
          <>
            <div class="cart-drawer__details-step">
              <button class="cart-drawer__back-btn" onClick$={() => nav("/")}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
                {t("cart.backtocart", locale.value)}
              </button>
              <Collapsible.Root class="cart-drawer__summary" bind:open={summaryOpen}>
                <Collapsible.Trigger class="cart-drawer__checkout-title">
                  {t("cart.ordersummary", locale.value)} — {cartCount.value} {cartCount.value !== 1 ? t("cart.items", locale.value) : t("cart.item", locale.value)}
                </Collapsible.Trigger>
                <Collapsible.Content>
                  <div class="cart-drawer__summary-list">
                    {cart.items.map((item) => (
                      <div key={`${item.name}-${item.size}`} class="cart-drawer__summary-item">
                        <span>
                          {item.color && item.color.startsWith("#") && <span class="cart-drawer__summary-swatch" style={{ background: item.color }} aria-hidden="true" />}
                          {item.quantity}x {stripColorSuffix(item.name)}{(item.color || item.size) ? ` — ${item.color ? (item.color.startsWith("#") ? colorName(item.color, locale.value) : item.color) : ""}${item.color && item.size ? " / " : ""}${item.size || ""}` : ""}
                        </span>
                        {loginType.value !== "tech" && <span>${(((Number(item.price) || 0) * item.quantity)).toFixed(2)}</span>}
                      </div>
                    ))}
                    {loginType.value !== "tech" && (
                      <>
                        <div class="cart-drawer__summary-item cart-drawer__summary-total">
                          <span>{t("cart.invoice.subtotal", locale.value)}</span>
                          <span>${subtotal.value.toFixed(2)}</span>
                        </div>
                        {empProvince.value ? (
                          <>
                            <div class="cart-drawer__summary-item">
                              <span>{taxLabel.value}</span>
                              <span>${(taxAmount.value ?? 0).toFixed(2)}</span>
                            </div>
                            <div class="cart-drawer__summary-item cart-drawer__summary-total">
                              <span>{t("cart.invoice.total", locale.value)}</span>
                              <span>${orderTotal.value.toFixed(2)}</span>
                            </div>
                          </>
                        ) : (
                          <div class="cart-drawer__summary-item">
                            <span>+ {t("cart.invoice.tax", locale.value)}</span>
                            <span>—</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </Collapsible.Content>
              </Collapsible.Root>
              <div class="checkout-modal__form">
                <h3 class="checkout-modal__form-title">{t("cart.orderdetails", locale.value)}</h3>
                <div class="checkout-modal__row">
                  <div class={`checkout-modal__field ${formTouched.value && !empFirstName.value ? "checkout-modal__field--error" : ""}`}>
                    <label>{t("cart.firstname", locale.value)}</label>
                    <input type="text" value={empFirstName.value} onInput$={(_, el) => { empFirstName.value = el.value; formError.value = ""; }} />
                  </div>
                  <div class={`checkout-modal__field ${formTouched.value && !empLastName.value ? "checkout-modal__field--error" : ""}`}>
                    <label>{t("cart.lastname", locale.value)}</label>
                    <input type="text" value={empLastName.value} onInput$={(_, el) => { empLastName.value = el.value; formError.value = ""; }} />
                  </div>
                </div>
                {/* Full shipping address — all required. */}
                <div class={`checkout-modal__field ${formTouched.value && !empAddress1.value ? "checkout-modal__field--error" : ""}`}>
                  <label>{t("cart.address", locale.value)}</label>
                  <input type="text" autoComplete="street-address" value={empAddress1.value} onInput$={(_, el) => { empAddress1.value = el.value; formError.value = ""; }} />
                </div>
                <div class={`checkout-modal__field ${formTouched.value && !empCity.value ? "checkout-modal__field--error" : ""}`}>
                  <label>{t("cart.city", locale.value)}</label>
                  <input type="text" autoComplete="address-level2" value={empCity.value} onInput$={(_, el) => { empCity.value = el.value; formError.value = ""; }} />
                </div>
                {/* Province sits high so the tax line in the summary updates as
                    soon as possible. */}
                <div class={`checkout-modal__field ${formTouched.value && !empProvince.value ? "checkout-modal__field--error" : ""}`}>
                  <label>{t("cart.province", locale.value)}</label>
                  <select required value={empProvince.value} onChange$={(_, el) => { empProvince.value = el.value; formError.value = ""; }}>
                    <option value="" disabled hidden>{locale.value === "fr" ? "Sélectionner…" : "Select…"}</option>
                    <option value="AB">{t("prov.AB", locale.value)}</option>
                    <option value="BC">{t("prov.BC", locale.value)}</option>
                    <option value="MB">{t("prov.MB", locale.value)}</option>
                    <option value="NB">{t("prov.NB", locale.value)}</option>
                    <option value="NL">{t("prov.NL", locale.value)}</option>
                    <option value="NS">{t("prov.NS", locale.value)}</option>
                    <option value="ON">{t("prov.ON", locale.value)}</option>
                    <option value="PE">{t("prov.PE", locale.value)}</option>
                    <option value="QC">{t("prov.QC", locale.value)}</option>
                    <option value="SK">{t("prov.SK", locale.value)}</option>
                  </select>
                </div>
                <div class={`checkout-modal__field ${formTouched.value && !empPostal.value ? "checkout-modal__field--error" : ""}`}>
                  <label>{t("cart.postal", locale.value)}</label>
                  <input type="text" autoComplete="postal-code" value={empPostal.value} onInput$={(_, el) => { empPostal.value = el.value; formError.value = ""; }} />
                </div>
                <div class={`checkout-modal__field ${formTouched.value && !empEmail.value ? "checkout-modal__field--error" : ""}`}>
                  <label>{t("cart.email", locale.value)}</label>
                  <input type="email" value={empEmail.value} onInput$={(_, el) => { empEmail.value = el.value; formError.value = ""; }} />
                </div>
                <div class={`checkout-modal__field ${formTouched.value && !empPhone.value ? "checkout-modal__field--error" : ""}`}>
                  <label>{t("cart.phone", locale.value)}</label>
                  <input type="tel" value={empPhone.value} onInput$={(_, el) => { empPhone.value = el.value; formError.value = ""; }} />
                </div>
              </div>

              {/* ---- Payment method ---- */}
              <div class="checkout-modal__pay">
                <h3 class="checkout-modal__form-title">{t("pay.title", locale.value)}</h3>
                {/* MN accepts purchase-order checkout only — no gift card or
                    credit-card options. */}
                <div class={`checkout-modal__field ${formTouched.value && !empPO.value ? "checkout-modal__field--error" : ""}`}>
                  <label>{t("cart.po", locale.value)}</label>
                  <input type="text" value={empPO.value} onInput$={(_, el) => (empPO.value = el.value)} />
                </div>
              </div>
            </div>
            {formError.value && (
              <div class="cart-drawer__error" role="alert">{formError.value}</div>
            )}
            <div class="cart-drawer__footer">
              <span class="cart-drawer__total">
                {cartCount.value} {cartCount.value !== 1 ? t("cart.items", locale.value) : t("cart.item", locale.value)}{loginType.value !== "tech" && (empProvince.value ? ` — $${orderTotal.value.toFixed(2)}` : ` — $${subtotal.value.toFixed(2)} + ${t("cart.invoice.tax", locale.value).toLowerCase()}`)}
              </span>
              <button
                class={`btn btn--primary cart-drawer__order-btn ${!canPlaceOrder.value ? "cart-drawer__order-btn--disabled" : ""}`}
                disabled={!canPlaceOrder.value || submitting.value}
                onClick$={submitOrder}
              >
                {submitting.value ? (
                  <>
                    <span class="btn-spinner" aria-hidden="true" />
                    {t("cart.placing", locale.value)}
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
                    {t("cart.createorder", locale.value)}
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Order confirmation — same design as the old in-layout modal. */}
      <Modal.Root bind:show={orderSubmitted}>
        <Modal.Panel class="modal-overlay">
          <div class="modal order-confirm">
            <div class="order-confirm__badge" aria-hidden="true">
              <img class="order-confirm__pinwheel" src="/logo.png" alt="" width="200" height="200" />
              <svg class="order-confirm__check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
            </div>
            <h2 class="order-confirm__title">{t("order.title", locale.value)}</h2>
            <p class="order-confirm__text">{t("order.text", locale.value)}</p>
            {/* Plain <a> (full page load) so the app re-mounts and every signal
                (cart, this modal flag) resets cleanly. */}
            <a href="/" class="btn btn--primary order-confirm__btn">{t("order.continue", locale.value)}</a>
          </div>
        </Modal.Panel>
      </Modal.Root>

      {/* Order failure — as prominent as the success modal, instead of a hidden
          inline error. Retrying reuses the same idempotency key, so a resend
          can't create a duplicate order. */}
      <Modal.Root bind:show={showError}>
        <Modal.Panel class="modal-overlay">
          <div class="modal order-confirm order-confirm--error">
            <h2 class="order-confirm__title">{t("order.fail.title", locale.value)}</h2>
            <p class="order-confirm__text">{t("order.fail.text", locale.value)}</p>
            <div class="order-confirm__actions">
              <button
                type="button"
                class="btn btn--primary"
                onClick$={() => { showError.value = false; submitOrder(); }}
              >
                {t("order.fail.retry", locale.value)}
              </button>
            </div>
          </div>
        </Modal.Panel>
      </Modal.Root>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Checkout — Tamarack Apparel",
  meta: [{ name: "robots", content: "noindex" }],
};
