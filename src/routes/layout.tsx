import { component$, Slot, useSignal, useTask$, useVisibleTask$, $, useContextProvider, useStore, useComputed$, createContextId, isBrowser } from "@builder.io/qwik";
import type { Signal } from "@builder.io/qwik";
import { Modal, Collapsible, Accordion } from '@qwik-ui/headless';
import {
  Link,
  routeAction$,
  routeLoader$,
  useLocation,
  useNavigate,
  Form,
  z,
  zod$,
} from "@builder.io/qwik-city";
import type { Cookie } from "@builder.io/qwik-city";
import { createClient } from "@libsql/client";
import { LocaleContext, t } from "../i18n";
import type { Locale, TranslationKey } from "../i18n";
import { allProducts, colorName } from "./apparel/products";
import { CLOTHING_CATEGORIES, SAFETY_CATEGORIES, CATEGORY_ICONS } from "../components/product-catalog/product-catalog";
import { getGiftCard, giftContribution, deductGiftCard } from "../lib/giftcards";
import { sendConfirmationEmail } from "../lib/orders";
import type { OrderEmailData, PaymentMethod } from "../lib/orders";
import { createCheckoutSession } from "../lib/stripe";

const AUTH_COOKIE = "ce_auth"; // v2: orders persist to db
const LOCALE_COOKIE = "ce_locale";

// The home hero is temporarily disabled (see routes/index.tsx SHOW_HERO), so
// the header's hero slide-in mode is off too — the header must be visible at
// scrollY 0. Flip both back together when the hero returns.
const SHOW_HERO_HEADER = false;  // No hero — the sticky site header shows at the top of the home page.

// Canadian provincial sales tax rates (combined GST/HST/PST/QST)
const PROVINCE_TAX: Record<string, number> = {
  AB: 0.05, BC: 0.12, MB: 0.12, NB: 0.15, NL: 0.15,
  NS: 0.14, ON: 0.13, PE: 0.15, QC: 0.14975, SK: 0.11,
};
const PROVINCE_NAMES: Record<string, string> = {
  AB: "Alberta", BC: "British Columbia", MB: "Manitoba",
  NB: "New Brunswick", NL: "Newfoundland and Labrador",
  NS: "Nova Scotia", ON: "Ontario", PE: "Prince Edward Island",
  QC: "Quebec", SK: "Saskatchewan",
};
const taxRateFor = (code: string): number | undefined => PROVINCE_TAX[code];
// Provinces with a single branch — the Location field is unnecessary for these
const SINGLE_BRANCH_PROVINCES = new Set(["AB", "BC"]);
const needsLocation = (code: string): boolean => !!code && !SINGLE_BRANCH_PROVINCES.has(code);

// The header's height drives every scroll offset in the app: the sticky strips
// (catalog tabs, apparel titlebar, product breadcrumb) pin directly beneath it,
// so anything scrolling content "to just below the bars" has to know it. This
// used to be a hardcoded `innerWidth < 601 ? 64 : (<= 1024 ? 67 : 58)` chain,
// copied into a dozen call sites — and it silently desynced from the CSS every
// time a bar height changed, parking content a few px under the header.
// Measure the element instead; fall back to the CSS custom property that sets
// the same height, and only then to a literal.
// NB this is the header's BOTTOM EDGE once pinned, not its height. On desktop
// the header is pinned 4px down from the viewport top (a strip of the greige
// surround shows above the card), so bottom = 4 + height. Using the height
// alone puts content 4px too high — under the header — which is what made the
// tab bar and breadcrumb look short after a tab click.
export function stickyTop(): number {
  const el = document.querySelector(".site-header") as HTMLElement | null;
  if (el) {
    const rect = el.getBoundingClientRect();
    if (rect.height > 0) {
      const cs = getComputedStyle(el);
      const offset = cs.position === "sticky" || cs.position === "fixed" ? parseFloat(cs.top) || 0 : 0;
      return Math.round(offset + rect.height);
    }
  }
  return 64;
}

export const LoginTypeContext = createContextId<Signal<string>>("loginType");

export const useLocaleLoader = routeLoader$(({ cookie }) => {
  const saved = cookie.get(LOCALE_COOKIE)?.value;
  return (saved === "fr" ? "fr" : "en") as Locale;
});

type LoginType = "clothing" | "tech" | "safety" | null;

function getLoginType(cookie: Cookie): LoginType {
  const val = cookie.get(AUTH_COOKIE)?.value;
  if (val === "clothing" || val === "tech" || val === "safety") return val;
  if (val === "authenticated") return "clothing"; // backward compat
  return null;
}

function isAuthenticated(cookie: Cookie): boolean {
  return getLoginType(cookie) !== null;
}

export const useAuthCheck = routeLoader$(({ cookie }) => {
  const loginType = getLoginType(cookie);
  return { loggedIn: loginType !== null, loginType: loginType || "clothing" };
});

export const useCartCountLoader = routeLoader$(({ cookie }) => {
  return parseInt(cookie.get("ce_cart_count")?.value || "0", 10);
});

export const useLogin = routeAction$(
  ({ username, password }, { cookie, fail, env }) => {
    const expectedUser = env.get("APP_USERNAME") || env.get("VITE_APP_USERNAME") || "admin";
    const expectedPass = env.get("APP_PASSWORD") || env.get("VITE_APP_PASSWORD");
    const techUser = env.get("TECH_USERNAME") || env.get("VITE_TECH_USERNAME") || "tech";
    const techPass = env.get("TECH_PASSWORD") || env.get("VITE_TECH_PASSWORD");
    const safetyUser = env.get("SAFETY_USERNAME") || env.get("VITE_SAFETY_USERNAME") || "Safety";
    const safetyPass = env.get("SAFETY_PASSWORD") || env.get("VITE_SAFETY_PASSWORD");

    // Check Tech login first
    if (techPass && username === techUser && password === techPass) {
      cookie.set(AUTH_COOKIE, "tech", {
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 3,
      });
      return { success: true };
    }

    // Check Safety login
    if (safetyPass && username === safetyUser && password === safetyPass) {
      cookie.set(AUTH_COOKIE, "safety", {
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 3,
      });
      return { success: true };
    }

    // Check Clothing login
    if (!expectedPass) {
      return fail(500, { message: "Login not configured" });
    }
    if (username === expectedUser && password === expectedPass) {
      cookie.set(AUTH_COOKIE, "clothing", {
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 3,
      });
      return { success: true };
    }
    return fail(401, { message: "Invalid username or password" });
  },
  zod$({
    username: z.string().min(1).max(64),
    password: z.string().min(1).max(128),
  }),
);

export const useLogout = routeAction$(async (_, { cookie }) => {
  cookie.delete(AUTH_COOKIE, { path: "/" });
  return { success: true };
});

// Look up a gift card's balance from the checkout form (before submitting), so
// the UI can show how much it covers and how much is left for the card.
export const useCheckGiftCard = routeAction$(
  async ({ code }, { env, fail }) => {
    const tursoUrl = env.get("TURSO_URL") || env.get("VITE_TURSO_URL");
    const tursoToken = env.get("TURSO_AUTH_TOKEN") || env.get("VITE_TURSO_AUTH_TOKEN");
    if (!tursoUrl || !tursoToken) return fail(500, { message: "Gift cards not configured" });
    const db = createClient({ url: tursoUrl, authToken: tursoToken });
    const card = await getGiftCard(db, code);
    if (!card || !card.active) return { valid: false, balance: 0 };
    return { valid: true, balance: card.balance };
  },
  zod$({ code: z.string().min(1).max(64) }),
);

export const useSubmitOrder = routeAction$(
  async (data, { fail, env, cookie, url }) => {
    if (!isAuthenticated(cookie)) {
      return fail(401, { message: "Not authenticated" });
    }
    const lt = getLoginType(cookie);
    const vendor = lt === "tech" ? "wills-tech" : lt === "safety" ? "wills-safety" : "wills";
    // Read from non-prefixed names first, fall back to VITE_* for backward compat.
    // Both are safe at runtime — env.get() reads server env, never bundles.
    const tursoUrl = env.get("TURSO_URL") || env.get("VITE_TURSO_URL");
    const tursoToken = env.get("TURSO_AUTH_TOKEN") || env.get("VITE_TURSO_AUTH_TOKEN");
    const apiKey = env.get("RESEND_API_KEY") || env.get("VITE_RESEND_API_KEY");
    const stripeKey = env.get("STRIPE_SECRET_KEY") || env.get("VITE_STRIPE_SECRET_KEY");

    const { employee, items, date } = data;
    const paymentMethod = (data.paymentMethod || "po") as PaymentMethod;
    const wantsGift = paymentMethod === "giftcard" || paymentMethod === "giftcard_card";
    const wantsCard = paymentMethod === "card" || paymentMethod === "giftcard_card";

    const province = employee.province;
    if (!province || !PROVINCE_TAX[province]) {
      return fail(400, { message: "Please select a province before submitting the order." });
    }
    if (paymentMethod === "po" && !employee.po) {
      return fail(400, { message: "A PO number is required for purchase-order checkout." });
    }
    const taxRate = PROVINCE_TAX[province];
    const taxPct = +(taxRate * 100).toFixed(3);
    const subtotal = items.reduce((sum, i) => sum + (Number(i.price) || 0) * i.quantity, 0);
    const tax = subtotal * taxRate;
    const total = +(subtotal + tax).toFixed(2);

    if (!tursoUrl || !tursoToken) {
      return fail(500, { message: "Order database not configured (missing env vars)" });
    }
    const db = createClient({ url: tursoUrl, authToken: tursoToken });

    // ---- Resolve the gift-card contribution (if any) ----
    let giftAmount = 0;
    let giftCode = "";
    if (wantsGift) {
      if (!data.giftCardCode) {
        return fail(400, { message: "Enter a gift card code, or choose a different payment method." });
      }
      const card = await getGiftCard(db, data.giftCardCode);
      if (!card || !card.active) {
        return fail(400, { message: "Gift card not found or inactive." });
      }
      giftAmount = giftContribution(card, total);
      giftCode = card.code;
    }
    const remaining = +(total - giftAmount).toFixed(2);

    // Gift-card-only but the balance doesn't cover the order → they must add a card.
    if (paymentMethod === "giftcard" && remaining > 0) {
      return fail(400, {
        message: `Gift card covers $${giftAmount.toFixed(2)} of $${total.toFixed(2)}. Choose "Gift card + credit card" to pay the $${remaining.toFixed(2)} balance.`,
      });
    }
    const cardAmount = wantsCard ? remaining : 0;
    if (wantsCard && cardAmount <= 0 && paymentMethod === "card") {
      return fail(400, { message: "Order total is $0 — nothing to charge." });
    }
    // DEV-ONLY simulated payment: when there's no Stripe key AND we're running
    // the dev server, the card charge is faked so the whole post-checkout flow
    // (order finalized + email + gift-card deduction + success page) can be
    // tested before a Stripe account exists. `import.meta.env.DEV` is compile-
    // time false in a production build, so this branch is dead code in prod.
    const simulateCard = !stripeKey && !!import.meta.env.DEV;
    if (wantsCard && cardAmount > 0 && !stripeKey && !simulateCard) {
      return fail(500, { message: "Card payments are not configured yet (missing Stripe key)." });
    }

    // ---- Persist the order (status depends on whether a card charge follows) ----
    // 'pending'          — PO / invoice, settled offline
    // 'paid'             — gift card covered it in full
    // 'awaiting_payment' — a Stripe card charge is required; the webhook flips it
    //                      to 'paid' and deducts the gift card once payment lands.
    const status = cardAmount > 0 ? "awaiting_payment" : paymentMethod === "po" ? "pending" : "paid";
    let orderNumber = "";
    let orderId: bigint | number | null = null;
    try {
      const result = await db.execute({
        sql: `INSERT INTO orders (vendor, emp_number, emp_name, emp_dept, po_number, items, total, status, payment_method, gift_card_code, gift_amount, card_amount, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        args: [
          vendor,
          "",
          // The name IS stored (so the admin knows who ordered); email/phone are
          // NOT — for card orders they travel through Stripe metadata to the
          // webhook, never a column here. See the privacy policy.
          employee.name || "",
          "",
          employee.po || "",
          JSON.stringify(items),
          total,
          status,
          paymentMethod,
          giftCode,
          giftAmount,
          cardAmount,
        ],
      });
      orderId = (result.lastInsertRowid as any) ?? null;
      if (orderId != null) {
        const seq = await db.execute({
          sql: "SELECT COUNT(*) AS n FROM orders WHERE vendor LIKE 'wills%' AND id <= ?",
          args: [orderId as any],
        });
        const n = Number((seq.rows[0] as any)?.n) || Number(orderId);
        orderNumber = `WT-${n}`;
      }
    } catch (err) {
      console.error("Failed to save order to database:", err);
      return fail(500, { message: "Order could not be saved. Please try again." });
    }

    const provinceName = PROVINCE_NAMES[province] || province;
    const fromAddress = env.get("RESEND_FROM") || env.get("VITE_RESEND_FROM") || "Tamarack <onboarding@resend.dev>";
    const staffAddresses = (env.get("ORDER_NOTIFY_TO") || env.get("VITE_ORDER_NOTIFY_TO") || "cs@safetyhouse.ca")
      .split(",").map((a) => a.trim()).filter(Boolean);

    // Build the confirmation-email payload once (used by the no-card path and
    // the dev simulated-card path).
    const buildEmailData = (): OrderEmailData => ({
      orderNumber, date,
      employee: {
        name: employee.name, email: employee.email, phone: employee.phone,
        department: employee.department, provinceName, provinceCode: province, po: employee.po,
      },
      items: items as any,
      subtotal, taxPct, tax, total,
      payment: { method: paymentMethod, giftCardCode: giftCode || undefined, giftAmount, cardAmount },
    });

    // ---- DEV simulated card payment (no Stripe key) ----
    // Finalize exactly like the webhook would after a real charge, then land on
    // the success page. Dev-only (see `simulateCard`).
    if (cardAmount > 0 && simulateCard) {
      if (giftAmount > 0) {
        const ok = await deductGiftCard(db, giftCode, giftAmount);
        if (ok) {
          await db.execute({
            sql: "INSERT INTO gift_card_transactions (code, amount, order_ref) VALUES (?, ?, ?)",
            args: [giftCode, giftAmount, orderNumber],
          });
        }
      }
      await db.execute({
        sql: "UPDATE orders SET status = 'paid', paid_at = datetime('now') WHERE id = ?",
        args: [orderId as any],
      });
      if (apiKey) await sendConfirmationEmail({ apiKey, from: fromAddress, staffAddresses }, buildEmailData());
      const siteUrl = env.get("SITE_URL") || url.origin;
      console.warn(`[DEV] Simulated card payment for order ${orderNumber} — no Stripe key set.`);
      return { redirectUrl: `${siteUrl}/checkout/success/?test=1`, orderNumber };
    }

    // ---- Card required → hand off to Stripe Checkout ----
    if (cardAmount > 0) {
      const siteUrl = env.get("SITE_URL") || url.origin;
      try {
        const session = await createCheckoutSession({
          secretKey: stripeKey!,
          amountCents: Math.round(cardAmount * 100),
          currency: "cad",
          description: `Tamarack apparel order ${orderNumber} — balance after gift card`,
          successUrl: `${siteUrl}/checkout/success/?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${siteUrl}/checkout/cancelled/`,
          customerEmail: (employee.email || "").trim() || undefined,
          // Everything the webhook needs to finalize + email, WITHOUT storing PII
          // in our DB. Items are loaded from the order row by id.
          metadata: {
            order_id: String(orderId ?? ""),
            order_number: orderNumber,
            employee_name: employee.name || "",
            customer_email: (employee.email || "").trim(),
            customer_phone: employee.phone || "",
            department: employee.department || "",
            po: employee.po || "",
            province_code: province,
            province_name: provinceName,
            tax_pct: String(taxPct),
            subtotal: subtotal.toFixed(2),
            tax: tax.toFixed(2),
            total: total.toFixed(2),
            payment_method: paymentMethod,
            gift_code: giftCode,
            gift_amount: giftAmount.toFixed(2),
            card_amount: cardAmount.toFixed(2),
            date: date,
          },
        });
        await db.execute({
          sql: "UPDATE orders SET stripe_session_id = ? WHERE id = ?",
          args: [session.id, orderId as any],
        });
        return { redirectUrl: session.url, orderNumber };
      } catch (err) {
        console.error("Stripe checkout session failed:", err);
        return fail(502, { message: "Could not start the card payment. Please try again." });
      }
    }

    // ---- No card: gift-card-only (deduct now) or PO (settle offline) ----
    if (giftAmount > 0) {
      const ok = await deductGiftCard(db, giftCode, giftAmount);
      if (!ok) {
        // Balance changed between the estimate and now.
        await db.execute({ sql: "UPDATE orders SET status = 'gift_failed' WHERE id = ?", args: [orderId as any] });
        return fail(409, { message: "Gift card balance is no longer sufficient. Please re-check your balance." });
      }
      await db.execute({
        sql: "INSERT INTO gift_card_transactions (code, amount, order_ref) VALUES (?, ?, ?)",
        args: [giftCode, giftAmount, orderNumber],
      });
      await db.execute({ sql: "UPDATE orders SET paid_at = datetime('now') WHERE id = ?", args: [orderId as any] });
    }

    if (apiKey) {
      const emailData: OrderEmailData = {
        orderNumber, date,
        employee: {
          name: employee.name, email: employee.email, phone: employee.phone,
          department: employee.department, provinceName, provinceCode: province, po: employee.po,
        },
        items: items as any,
        subtotal, taxPct, tax, total,
        payment: { method: paymentMethod, giftCardCode: giftCode || undefined, giftAmount, cardAmount },
      };
      await sendConfirmationEmail({ apiKey, from: fromAddress, staffAddresses }, emailData);
    } else {
      console.warn("RESEND_API_KEY not configured — order saved but email not sent");
    }

    return { success: true, orderNumber };
  },
  zod$({
    paymentMethod: z.enum(["po", "giftcard", "giftcard_card", "card"]).default("po"),
    giftCardCode: z.string().max(64).optional(),
    employee: z.object({
      name: z.string().min(1).max(120),
      email: z.string().email().max(254).or(z.literal("")),
      phone: z.string().max(40),
      department: z.string().max(120),
      province: z.string().length(2),
      po: z.string().max(60).optional().default(""),
    }),
    items: z
      .array(
        z.object({
          name: z.string().min(1).max(200),
          sku: z.string().max(40).optional().nullable(),
          color: z.string().max(40).optional().nullable().default(""),
          size: z.string().max(40).optional().nullable().default(""),
          quantity: z.coerce.number().int().min(1).max(999),
          price: z.coerce.number().nonnegative().max(100000),
          waist: z.string().max(20).optional().nullable(),
          length: z.string().max(20).optional().nullable(),
          variant: z.string().max(40).optional().nullable(),
          code: z.string().max(40).optional().nullable(),
        }),
      )
      .min(1)
      .max(100),
    date: z.string().min(1).max(40),
  }),
);

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

// Branded product shots that cross-fade behind the login form so visitors see
// the catalog before signing in.
const LOGIN_SLIDES = [
  "/login-hero.jpg",
];

export default component$(() => {
  const loc = useLocation();
  const nav = useNavigate();
  const auth = useAuthCheck();
  const loginAction = useLogin();
  const logoutAction = useLogout();
  const orderAction = useSubmitOrder();

  const showLogin = useSignal(false);
  const overlayFading = useSignal(false);
  const loginSlide = useSignal(0);
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track, cleanup }) => {
    track(() => showLogin.value);
    if (!showLogin.value) return;
    const id = setInterval(() => {
      loginSlide.value = (loginSlide.value + 1) % LOGIN_SLIDES.length;
    }, 3800);
    cleanup(() => clearInterval(id));
  });
  const menuOpen = useSignal(false);
  const savedLocale = useLocaleLoader();
  const locale = useSignal<Locale>(savedLocale.value);
  // Flip EN <-> FR and persist the choice so it survives reloads.
  const toggleLocale = $(() => {
    const next = locale.value === "en" ? "fr" : "en";
    locale.value = next;
    document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=31536000`;
  });

  // Mobile/tablet apparel search lives in the header (not the catalog tab
  // strip). It relays keystrokes to the catalog via an "apparel-search" event.
  const searchOpen = useSignal(false);
  const searchValue = useSignal("");
  // Phones use a shorter search placeholder ("Search...") than desktop
  // ("Search apparel"); placeholder text can't be swapped by CSS, so track the
  // breakpoint here. The mobile search field is hidden until tapped, so there's
  // no flash before this settles.
  const narrowSearch = useSignal(false);
  // The catalog (and therefore search) is only rendered on the home page and
  // the apparel listing — not on product detail or 404 pages.
  // Search shows on the home page, the apparel listing, AND product pages. On a
  // product page there's no catalog mounted, so the first keystroke navigates to
  // the listing (see the input handlers) — the search bar itself stays put in
  // the header the whole time.
  const showSearch = useComputed$(
    () => loc.url.pathname === "/" || loc.url.pathname.startsWith("/apparel"),
  );

  useContextProvider(LocaleContext, locale);

  const loginType = useSignal(auth.value.loginType);
  useContextProvider(LoginTypeContext, loginType);

  // Cart state
  const initialCartCount = useCartCountLoader();
  const cart = useStore<{ items: CartItem[] }>({ items: [] });
  const ssrCartCount = useSignal(initialCartCount.value);
  const cartOpen = useSignal(false);
  const orderSubmitted = useSignal(false);
  const checkoutOpen = useSignal(false);
  const checkoutStep = useSignal<"cart" | "details">("cart");
  const summaryOpen = useSignal(true);
  const formError = useSignal("");
  const formTouched = useSignal(false);
  const empFirstName = useSignal("");
  const empLastName = useSignal("");
  const empEmail = useSignal("");
  const empPhone = useSignal("");
  const empDept = useSignal("");
  const empProvince = useSignal("");
  const empPO = useSignal("");

  // Payment: 'po' (invoice), 'giftcard', 'giftcard_card', 'card'.
  const payMethod = useSignal<"po" | "giftcard" | "giftcard_card" | "card">("po");
  const giftCode = useSignal("");
  const giftBalance = useSignal<number | null>(null); // null = not yet checked
  const giftError = useSignal("");
  const usesGift = useComputed$(() => payMethod.value === "giftcard" || payMethod.value === "giftcard_card");

  // Gift-card checking was removed with the PO-only checkout — the gift signals
  // below are retained only for the (now unreachable) validation guards in
  // submitOrder, so the payment flow stays correct if gift cards return.

  const cartCount = useComputed$(() => {
    const count = cart.items.reduce((sum, i) => sum + i.quantity, 0);
    return count > 0 ? count : ssrCartCount.value;
  });
  const subtotal = useComputed$(() =>
    cart.items.reduce((sum, i) => sum + (Number(i.price) || 0) * i.quantity, 0),
  );
  const taxRate = useComputed$(() => taxRateFor(empProvince.value));
  const taxAmount = useComputed$(() => taxRate.value === undefined ? undefined : subtotal.value * taxRate.value);
  const orderTotal = useComputed$(() => subtotal.value + (taxAmount.value ?? 0));
  // How much the checked gift card covers of the current total, and the leftover.
  const giftCovers = useComputed$(() =>
    giftBalance.value == null ? 0 : Math.min(giftBalance.value, orderTotal.value),
  );
  const giftRemaining = useComputed$(() => Math.max(0, +(orderTotal.value - giftCovers.value).toFixed(2)));
  const taxLabel = useComputed$(() => {
    if (taxRate.value === undefined) return t("cart.invoice.tax", locale.value);
    const pct = +(taxRate.value * 100).toFixed(3);
    return `${t("cart.invoice.tax", locale.value)} (${empProvince.value} ${pct}%)`;
  });
  const headerScrolled = useSignal(false);
  // True once the catalog tab strip is stuck to the header (always true on the
  // apparel route). Gates the header search icon so it only appears when the
  // tabs are pinned — opening search from there needs no reposition, so the
  // keyboard raises with no flash.
  const tabsStuck = useSignal(false);

  // Load cart from localStorage — eager strategy to ensure it runs immediately
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(
    ({ track, cleanup }) => {
    track(() => loginType.value);
    const cartStorageKey = () => `ce_cart_mn_${loginType.value || "clothing"}`;
    const loadCart = () => {
      try {
        const saved = localStorage.getItem(cartStorageKey());
        if (saved) {
          cart.items = JSON.parse(saved) as CartItem[];
        } else {
          cart.items = [];
        }
        const count = cart.items.reduce((sum, i: any) => sum + i.quantity, 0);
        document.cookie = `ce_cart_count=${count};path=/;max-age=31536000`;
        ssrCartCount.value = 0; // clear SSR fallback once real data loaded
      } catch { cart.items = []; }
    };
    loadCart();
    window.addEventListener("cart-updated", loadCart);
    cleanup(() => window.removeEventListener("cart-updated", loadCart));
  }, { strategy: 'document-ready' });

  const saveCart = $(() => {
    try {
      const key = `ce_cart_mn_${loginType.value || "clothing"}`;
      localStorage.setItem(key, JSON.stringify(cart.items));
      const count = cart.items.reduce((sum, i) => sum + i.quantity, 0);
      document.cookie = `ce_cart_count=${count};path=/;max-age=31536000`;
    } catch { /* ignore */ }
  });

  const updateQty = $(async (index: number, delta: number) => {
    const newQty = cart.items[index].quantity + delta;
    if (newQty < 1) {
      cart.items = cart.items.filter((_, i) => i !== index);
    } else {
      cart.items = cart.items.map((item, i) => i === index ? { ...item, quantity: newQty } : item);
    }
    await saveCart();
    window.dispatchEvent(new CustomEvent("cart-updated"));
  });

  const submitOrder = $(async () => {
    formTouched.value = true;
    const locationRequired = needsLocation(empProvince.value);
    const poRequired = payMethod.value === "po";
    if (!empFirstName.value || !empLastName.value || !empEmail.value || !empPhone.value || !empProvince.value || (locationRequired && !empDept.value) || (poRequired && !empPO.value)) {
      formError.value = t("cart.error.required", locale.value);
      checkoutOpen.value = true;
      return;
    }
    // Gift-card methods need a checked, valid code.
    if (usesGift.value && giftBalance.value == null) {
      formError.value = t("pay.gift.check", locale.value);
      checkoutOpen.value = true;
      return;
    }
    if (payMethod.value === "giftcard" && giftRemaining.value > 0) {
      formError.value = t("pay.gift.short", locale.value);
      checkoutOpen.value = true;
      return;
    }
    // Email format check (basic RFC-ish — anything@anything.tld)
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(empEmail.value.trim())) {
      formError.value = t("cart.error.email", locale.value);
      checkoutOpen.value = true;
      return;
    }
    // Phone format check — at least 7 digits, allow +, spaces, dashes, parens
    const phoneDigits = empPhone.value.replace(/[^\d]/g, "");
    if (phoneDigits.length < 7 || phoneDigits.length > 15 || !/^[\d\s+()\-.]+$/.test(empPhone.value.trim())) {
      formError.value = t("cart.error.phone", locale.value);
      checkoutOpen.value = true;
      return;
    }
    formError.value = "";

    const orderData = {
      paymentMethod: payMethod.value,
      ...(usesGift.value ? { giftCardCode: giftCode.value.trim() } : {}),
      employee: { name: `${empFirstName.value} ${empLastName.value}`, email: empEmail.value, phone: empPhone.value, department: empDept.value, province: empProvince.value, po: empPO.value },
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
    };

    // Send order via server action
    let result: any;
    try {
      result = await orderAction.submit(orderData);
    } catch (err) {
      console.error("Order submit threw:", err);
      formError.value = (err as Error)?.message || "Network error placing order";
      return;
    }
    const v = result?.value as any;
    if (v?.failed) {
      // Surface zod field errors, top-level form errors, or generic message
      let msg = v.message;
      if (!msg && v.fieldErrors) {
        const flat: string[] = [];
        const walk = (obj: any) => {
          if (Array.isArray(obj)) flat.push(...obj.map(String));
          else if (obj && typeof obj === "object") Object.values(obj).forEach(walk);
        };
        walk(v.fieldErrors);
        msg = flat.join(", ");
      }
      if (!msg && v.formErrors?.length) msg = v.formErrors.join(", ");
      formError.value = msg || "Failed to place order. Please try again.";
      console.error("Order submission failed:", v);
      return;
    }

    // Card / gift+card: the server created a Stripe Checkout session — hand off
    // to Stripe. The cart is cleared on return (the /checkout/success page), not
    // here, so it survives if the customer cancels the card payment.
    if (v?.redirectUrl) {
      window.location.href = v.redirectUrl;
      return;
    }

    cart.items = [];
    await saveCart();
    window.dispatchEvent(new CustomEvent("cart-updated"));
    orderSubmitted.value = true;
    cartOpen.value = false;
    empFirstName.value = "";
    empLastName.value = "";
    empEmail.value = "";
    empPhone.value = "";
    empDept.value = "";
    empProvince.value = "";
    empPO.value = "";
    payMethod.value = "po";
    giftCode.value = "";
    giftBalance.value = null;
    giftError.value = "";
    formTouched.value = false;
  });


  // Listen for open-cart events from child pages
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => {
    const handler = () => {
      cartOpen.value = true;
      checkoutStep.value = "details";
      checkoutOpen.value = true;
    };
    window.addEventListener("open-cart", handler);
    cleanup(() => window.removeEventListener("open-cart", handler));
  }, { strategy: 'document-ready' });

  // Settle the header's scroll-dependent state before the new route renders.
  // Qwik commits the DOM and sets the scroll to the top in one synchronous
  // block (see viewTransition={false} in root.tsx), so the new route's first
  // frame is at the top — but --tabs-stuck (which gates the search button) and
  // --hero-visible are driven by these signals, and if they were only updated
  // in the post-paint scroll handler below they'd be a frame stale.
  // Do NOT scroll here: this runs before the DOM swap, so it would drag the
  // page you're leaving up to the top while it's still on screen.
  useTask$(({ track }) => {
    const path = track(() => loc.url.pathname);
    // The catalog strip is sticky from the top of the apparel route, so its
    // tabs are pinned there from the first frame.
    tabsStuck.value = path.startsWith("/apparel");
    headerScrolled.value = false;
    if (isBrowser) document.documentElement.classList.remove("scrolled");
  });

  // Sticky header on scroll (mobile landing page)
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup, track }) => {
    track(() => loc.url.pathname);
    // Where the strip pins, read from the strip itself rather than a table of
    // per-breakpoint header heights. Those were 64/67/66 literals, and they
    // silently desynced the moment the header's height changed: --wt-header-h
    // is built from the bar + seam + top padding, so widening any of them moves
    // the pin, and the strip then rests one or two pixels BELOW the number this
    // compared against. The test never passed, --tabs-stuck never got set, and
    // the search button (gated on it in global.css) stopped appearing on the
    // home route. The strip's own resolved `top` is the pin by definition.
    const stickyTop = (strip: Element) => {
      const top = parseFloat(getComputedStyle(strip).top);
      return Number.isFinite(top) ? top : 64;
    };
    const onScroll = () => {
      headerScrolled.value = window.scrollY > 60;
      document.documentElement.classList.toggle("scrolled", window.scrollY > 60);
      // Search icon appears only once the catalog tab strip is stuck; always
      // available on the apparel route (tabs sticky from the top).
      if (loc.url.pathname.startsWith("/apparel")) {
        tabsStuck.value = true;
      } else {
        const strip = document.querySelector(".home-catalog__header");
        tabsStuck.value = !!strip && strip.getBoundingClientRect().top <= stickyTop(strip) + 1;
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    cleanup(() => window.removeEventListener("scroll", onScroll));
  }, { strategy: 'document-ready' });

  // Header search: close when clicking anywhere outside it; clear + close it
  // whenever the category changes (tab bar or menu drawer). Mirrors cm.
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => {
    const onDocClick = (e: MouseEvent) => {
      if (!searchOpen.value) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(".site-header__search") || target.closest(".site-header__search-btn")) return;
      // Outside click closes the bar but KEEPS the filtered results. The search
      // is only reset by a tab/category change or a route change.
      searchOpen.value = false;
    };
    // Category change clears the header input and closes it. The catalog already
    // resets its own filter/active tab, so we must NOT re-dispatch apparel-search
    // here (that would override the newly selected category).
    const onCategoryChange = () => {
      searchValue.value = "";
      searchOpen.value = false;
    };
    document.addEventListener("click", onDocClick);
    window.addEventListener("select-category", onCategoryChange);
    window.addEventListener("apparel-search-clear", onCategoryChange);
    cleanup(() => {
      document.removeEventListener("click", onDocClick);
      window.removeEventListener("select-category", onCategoryChange);
      window.removeEventListener("apparel-search-clear", onCategoryChange);
    });
  }, { strategy: 'document-ready' });

  // Track the phone breakpoint so the header search can use a shorter
  // placeholder there ("Search..." vs "Search apparel").
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => {
    const update = () => { narrowSearch.value = window.innerWidth <= 600; };
    update();
    window.addEventListener("resize", update);
    cleanup(() => window.removeEventListener("resize", update));
  }, { strategy: 'document-ready' });

  // Lock scroll when menu is open
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track }) => {
    track(() => menuOpen.value);
    if (menuOpen.value) {
      const scrollY = window.scrollY;
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.left = "0";
      document.body.style.right = "0";
      document.body.style.overflow = "hidden";
    } else {
      const scrollY = Math.abs(parseInt(document.body.style.top || "0", 10));
      document.body.style.cssText = "";
      window.scrollTo({ top: scrollY, behavior: "instant" });
    }
  }, { strategy: 'document-ready' });

  // Back/forward should land at the top too — you left the catalog from a
  // product, so you come back to the top of it.
  //
  // Qwik City restores the scroll position it saved on the history entry, at
  // the moment it commits the new DOM. Correcting that afterwards would mean a
  // visible jump, so instead zero the entry's saved position while the popstate
  // is still in flight: Qwik reads it later (once the route's data has loaded)
  // and scrolls to the top as part of the same atomic swap.
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => {
    const onPopState = () => {
      const state = history.state || {};
      const scroll = state._qCityScroll;
      history.replaceState({ ...state, _qCityScroll: { ...(scroll || {}), x: 0, y: 0 } }, "");
    };
    window.addEventListener("popstate", onPopState);
    cleanup(() => window.removeEventListener("popstate", onPopState));
  }, { strategy: 'document-ready' });

  // Close the cart and the search bar on navigation. We do NOT clear the search
  // filter here — closing the bar (click-away, scroll, X, nav) keeps the
  // searched items, matching cm. The filter only resets on a tab/category
  // change (see onCategoryChange) or because a cross-route nav remounts the
  // catalog fresh.
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track }) => {
    track(() => loc.url.pathname);
    cartOpen.value = false;
    searchOpen.value = false;
  }, { strategy: 'document-ready' });

  // Lock scroll when cart is open
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track }) => {
    track(() => cartOpen.value);
    if (cartOpen.value) {
      const scrollY = window.scrollY;
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.left = "0";
      document.body.style.right = "0";
      document.body.style.overflow = "hidden";
    } else {
      const scrollY = Math.abs(parseInt(document.body.style.top || "0", 10));
      document.body.style.cssText = "";
      window.scrollTo({ top: scrollY, behavior: "instant" });
    }
  }, { strategy: 'document-ready' });

  // Auto-open login modal and lock scroll for unauthenticated users
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(() => {
    if (!auth.value.loggedIn) {
      showLogin.value = true;
      document.documentElement.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.inset = "0";
      document.body.style.overflow = "hidden";
    }
  }, { strategy: 'document-ready' });

  // Close modal and unlock scroll on successful login
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track, cleanup }) => {
    track(() => loginAction.value);
    if (loginAction.value && !loginAction.value.failed) {
      overlayFading.value = true;
      document.documentElement.style.overflow = "";
      document.body.style.cssText = "";
      window.scrollTo({ top: 0, behavior: "instant" });
      const tid = setTimeout(() => {
        showLogin.value = false;
        overlayFading.value = false;
      }, 800);
      cleanup(() => clearTimeout(tid));
    }
  }, { strategy: 'document-ready' });

  // Footer separator dots dangle at the end of a wrapped line (mobile). Flag each
  // link whose next visible sibling drops to a new line so CSS drops its trailing dot.
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track, cleanup }) => {
    track(() => locale.value);
    track(() => loginType.value);
    const update = () => requestAnimationFrame(() => {
      document.querySelectorAll(".site-footer__links").forEach((nav) => {
        const links = (Array.from(nav.querySelectorAll("a")) as HTMLElement[])
          .filter((a) => a.offsetParent !== null);
        links.forEach((a, i) => {
          const next = links[i + 1];
          a.classList.toggle("is-line-end", !next || next.offsetTop > a.offsetTop);
        });
      });
    });
    update();
    window.addEventListener("resize", update);
    cleanup(() => window.removeEventListener("resize", update));
  }, { strategy: 'document-ready' });

  return (
    <>
      {/* Login Modal */}
      {showLogin.value && (
        <div class={`login-overlay ${overlayFading.value ? "login-overlay--fading" : ""}`} onClick$={() => { if (auth.value.loggedIn) showLogin.value = false; }}>
          <div class="login-modal login-modal--split" onClick$={(e) => e.stopPropagation()}>
            {auth.value.loggedIn && (
              <button
                class="login-modal__close"
                onClick$={() => (showLogin.value = false)}
                aria-label="Close"
              >
                &times;
              </button>
            )}
            <div class="login-modal__form-pane">
            <button type="button" class="login-modal__lang" onClick$={toggleLocale} aria-label="Toggle language">
              {locale.value === "en" ? "Français" : "English"}
            </button>
            <div class="login-modal__header">
              <div class="login-modal__brand login-modal__brand--img">
                <img src="/tamarack-logo-white.png" alt="Tamarack" class="login-modal__logo-white" width="1451" height="250" />
                <span class="brand-apparel">Apparel</span>
              </div>
            </div>
            <Form action={loginAction} reloadDocument class="login-modal__form">
              {loginAction.value?.failed && (
                <div class="login-modal__error">{loginAction.value.message}</div>
              )}
              <div class="login-modal__field">
                <label for="username">{t("login.username", locale.value)}</label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  required
                  placeholder={t("login.username.placeholder", locale.value)}
                />
              </div>
              <div class="login-modal__field">
                <label for="password">{t("login.password", locale.value)}</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  placeholder={t("login.password.placeholder", locale.value)}
                />
              </div>
              <button type="submit" class="btn btn--green login-modal__submit">
                {loginAction.isRunning ? t("login.submitting", locale.value) : t("login.submit", locale.value)}
              </button>
            </Form>
            </div>
            <div class="login-modal__carousel" aria-hidden="true">
              {LOGIN_SLIDES.map((src, i) => (
                <img
                  key={src}
                  src={src}
                  alt=""
                  width="820"
                  height="1040"
                  class={`login-modal__slide ${i === loginSlide.value ? "is-active" : ""}`}
                  loading={i === 0 ? "eager" : "lazy"}
                  decoding="async"
                />
              ))}
              {LOGIN_SLIDES.length > 1 && (
                <div class="login-modal__dots">
                  {LOGIN_SLIDES.map((src, i) => (
                    <span key={src} class={`login-modal__dot ${i === loginSlide.value ? "is-active" : ""}`} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mobile + tablet are held behind a coming-soon cover for launch (desktop
          only). The full mobile/tablet layout is built and ready behind it —
          remove this block (and the .tablet-notice CSS gate) to enable them. */}
      <div class="tablet-notice" aria-live="polite">
        <img src="/tamarack-logo-white.png" alt="Tamarack" class="tablet-notice__logo" width="1451" height="250" />
        <span class="tablet-notice__title">Mobile &amp; tablet coming soon</span>
      </div>

      {(auth.value.loggedIn || (loginAction.value && !loginAction.value.failed)) && <>
      <header class={`site-header site-header--white ${tabsStuck.value ? "site-header--tabs-stuck" : ""} ${searchOpen.value ? "site-header--search-open" : ""} ${cartOpen.value ? "site-header--cart-open" : ""} ${SHOW_HERO_HEADER && loc.url.pathname === "/" && !cartOpen.value ? `site-header--hero-hidden ${headerScrolled.value || searchOpen.value ? "site-header--hero-visible" : ""}` : ""}`}>
        <div class="site-header__inner">
          <Link href="/" class="site-header__logo site-header__logo--img">
            <img src="/tamarack-logo-white.png" alt="Tamarack" class="site-header__logo-white" width="1451" height="250" loading="eager" decoding="sync" />
            <span class="brand-apparel">Apparel</span>
          </Link>
          <nav class="site-header__categories">
            <Link href="/" class={loc.url.pathname === "/" ? "active" : ""}>{t("nav.home", locale.value)}</Link>
            <Link href="/apparel/" class={loc.url.pathname.startsWith("/apparel") ? "active" : ""}>{loginType.value === "tech" ? t("cat.Work Wear", locale.value) : t("nav.apparel", locale.value)}</Link>
          </nav>
          <nav class="site-header__nav">
            {showSearch.value && (
              <button class="site-header__search-btn" onClick$={() => {
                // If the cart drawer is open, close it first.
                cartOpen.value = false;
                const header = document.querySelector(".site-header") as (HTMLElement & { __pin?: (() => void) | null }) | null;
                const catalog = document.querySelector(".home-catalog") as HTMLElement | null;
                const headerH = stickyTop();
                const stickyPos = catalog ? catalog.getBoundingClientRect().top + window.scrollY - headerH + 2 : 0;
                // FLASH FIX: on the home page, before the catalog tabs have scrolled
                // into their sticky position, opening the search animates the hero
                // header in at the same instant the catalog jumps — a visible flash.
                // A category-tab click in that same state repositions cleanly, so we
                // mirror it: scroll the catalog under the tabs FIRST (which lets the
                // header settle via the scroll listener), THEN open the search once
                // it's pinned. In every other state nothing repositions, so we open
                // synchronously (keeps the mobile keyboard opening on the first tap).
                const needsReposition = !!catalog && loc.url.pathname === "/" && window.scrollY < stickyPos - 1;
                const open = () => {
                  searchOpen.value = true;
                  header?.classList.add("site-header--search-open");
                  // Reposition here only when we didn't already do it above,
                  // and ONLY to pull the catalog UP to the bar when it sits
                  // below it. Previously this scrolled to `top` unconditionally,
                  // which yanked the page upward whenever the user opened search
                  // already scrolled past the pinned position — the visible
                  // "shift" on open. When already pinned (or scrolled past), the
                  // header search field and sticky tabs are already in place, so
                  // no scroll is needed.
                  // "Already pinned" is the --tabs-stuck state, so test THAT
                  // rather than re-deriving the pinned scroll position. The
                  // derived `top` carries a +2 fudge and uses stickyTop(),
                  // which drifts from the header's real height — so on a route
                  // whose strip is always stuck (/apparel/) the comparison read
                  // "a few px short" even when the catalog sat exactly under the
                  // bar, and every open nudged the page ~6px. That nudge was the
                  // shift around the tab strip.
                  const alreadyPinned = !!header?.classList.contains("site-header--tabs-stuck");
                  if (!needsReposition && catalog && !alreadyPinned) {
                    const top = catalog.getBoundingClientRect().top + window.scrollY - headerH + 2;
                    if (window.scrollY < top - 1) window.scrollTo({ top, behavior: "instant" });
                  }
                  window.dispatchEvent(new CustomEvent("apparel-search-open"));
                  // preventScroll stops the browser from scroll-jumping the field
                  // into view.
                  const input = document.querySelector(".site-header__search-input") as HTMLInputElement | null;
                  input?.focus({ preventScroll: true });
                  // Keep the fixed header visible over the keyboard by pinning it to
                  // the visual viewport (iOS reports the keyboard offset via the
                  // viewport "scroll" event).
                  const vvp = window.visualViewport;
                  if (vvp && header && loc.url.pathname === "/") {
                    header.__pin?.();
                    // Self-tears down once the search closes (via any path), so we
                    // don't leak the pin and move the header when typing elsewhere.
                    const pin = () => {
                      if (!searchOpen.value) { header.__pin?.(); return; }
                      header.style.top = `${vvp.offsetTop}px`;
                    };
                    pin();
                    vvp.addEventListener("resize", pin);
                    vvp.addEventListener("scroll", pin);
                    header.__pin = () => {
                      vvp.removeEventListener("resize", pin);
                      vvp.removeEventListener("scroll", pin);
                      header.style.top = "";
                      header.__pin = null;
                    };
                  }
                  // Close the search on the first scroll/drag (any contact), tearing
                  // down the pin so scrolling is smooth.
                  const onTouchMove = () => { header?.__pin?.(); input?.blur(); searchOpen.value = false; };
                  window.addEventListener("touchmove", onTouchMove, { passive: true, once: true });
                };
                if (needsReposition) {
                  // Reposition first (like a tab click), then open once it settles
                  // — no flash.
                  window.scrollTo({ top: stickyPos, behavior: "instant" });
                  requestAnimationFrame(() => requestAnimationFrame(open));
                } else {
                  open();
                }
              }} aria-label="Search apparel">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              </button>
            )}
            <button type="button" class={`locale-btn ${locale.value === "en" ? "locale-btn--to-fr" : "locale-btn--to-en"}`} onClick$={toggleLocale} aria-label="Toggle language">
              <span class="locale-btn__full">{locale.value === "en" ? "Français" : "English"}</span>
              <span class="locale-btn__short">{locale.value === "en" ? "FR" : "EN"}</span>
              <svg class="locale-btn__icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
            </button>
            <button class={`cart-btn ${cart.items.length > 0 ? "cart-btn--active" : ""}`} onClick$={() => { cartOpen.value = !cartOpen.value; if (cartOpen.value) menuOpen.value = false; if (!cartOpen.value) checkoutStep.value = "cart"; }}>
              <span class="cart-btn__label">{t("cart.mycart", locale.value)}</span>
              {cartOpen.value ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
              ) : (
                <>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>
                  <span class={`cart-btn__dot ${cart.items.length > 0 ? "cart-btn__dot--visible" : ""}`} />
                </>
              )}
            </button>
            <Form action={logoutAction} reloadDocument class="logout-form">
              <button type="submit" class="logout-btn" aria-label={t("login.logout", locale.value)}>
                <span class="logout-btn__label">{t("login.logout", locale.value)}</span>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              </button>
            </Form>
            {/* Search field lives INSIDE the nav, BEFORE the hamburger. On tablet
                it absolutely overlays the nav (the buttons stay visibility:hidden
                to hold the width → no shift); on mobile it's an in-flow flex
                field that fills up to the hamburger (which stays at the far
                right). */}
            {showSearch.value && (
              <div class="site-header__search">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                <input
                  type="text"
                  class="site-header__search-input"
                  aria-label="Search apparel"
                  placeholder={narrowSearch.value ? t("search.placeholder.short", locale.value) : t("search.placeholder", locale.value)}
                  value={searchValue.value}
                  onInput$={(_, el) => {
                    searchValue.value = el.value;
                    // With the catalog on the page (home / apparel listing), relay
                    // keystrokes to it for live filtering. On a page without a
                    // catalog (e.g. a product page) typing just fills the field —
                    // nothing moves until Enter (see below).
                    if (document.querySelector(".home-catalog")) {
                      window.dispatchEvent(new CustomEvent("apparel-search", { detail: el.value }));
                    }
                  }}
                  onKeyDown$={(e, el) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (document.querySelector(".home-catalog")) {
                        window.dispatchEvent(new CustomEvent("apparel-search", { detail: el.value }));
                        window.dispatchEvent(new CustomEvent("apparel-search-commit"));
                      } else {
                        // No catalog here (product page): Enter takes the user to the
                        // listing, swapping the breadcrumb bar for the tabs + grid,
                        // with the typed term carried along in ?q=.
                        nav(`/apparel/?q=${encodeURIComponent(el.value)}`);
                      }
                    }
                    if (e.key === "Escape") { searchValue.value = ""; window.dispatchEvent(new CustomEvent("apparel-search", { detail: "" })); searchOpen.value = false; }
                  }}
                />
                <button class="site-header__search-close" aria-label="Close search" onClick$={() => { searchOpen.value = false; }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
                </button>
              </div>
            )}
            <button class={`hamburger-btn ${menuOpen.value ? "hamburger-btn--open" : ""}`} onClick$={() => { menuOpen.value = !menuOpen.value; if (menuOpen.value) cartOpen.value = false; }} aria-label={menuOpen.value ? "Close menu" : "Menu"}>
              {menuOpen.value ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h18"/><path d="M3 6h18"/><path d="M3 18h18"/></svg>
              )}
            </button>
          </nav>
        </div>
      </header>

      {/* Mobile Nav Drawer */}
      {menuOpen.value && (
        <div class="nav-drawer-overlay" onClick$={() => (menuOpen.value = false)}>
          <nav class="nav-drawer" onClick$={(e) => e.stopPropagation()}>
            {/* Orange strip at the top of the menu takeover — the same "sign" bar
                the catalog tabs, breadcrumb and cart header use. The close (X) is
                the header hamburger, which toggles to an X while the menu is open
                (like the cart button), so this strip carries no redundant close. */}
            <div class="nav-drawer__header">
              <span class="nav-drawer__title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h18"/><path d="M3 6h18"/><path d="M3 18h18"/></svg>
                {t("nav.menu", locale.value)}
              </span>
              {/* Logout rides the right end of the orange strip (moved out of a
                  separate footer). */}
              <Form action={logoutAction} reloadDocument class="nav-drawer__header-logout-form">
                <button type="submit" class="nav-drawer__header-logout" aria-label={t("login.logout", locale.value)}>
                  <span>{t("login.logout", locale.value)}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                </button>
              </Form>
            </div>
            <div class="nav-drawer__links">
              <Link href="/" class={`nav-drawer__link ${loc.url.pathname === "/" ? "active" : ""}`} onClick$={() => (menuOpen.value = false)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                {t("nav.home", locale.value)}
              </Link>
              {loginType.value === "tech" && (
                <Link href="/apparel/" class={`nav-drawer__link ${loc.url.pathname.startsWith("/apparel") ? "active" : ""}`} onClick$={() => { menuOpen.value = false; window.dispatchEvent(new CustomEvent("select-category", { detail: "Work Wear" })); }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4M16 2v4M4 6h16v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6z"/><path d="M4 6l-2 4v2h4V8"/><path d="M20 6l2 4v2h-4V8"/></svg>
                  {t("cat.Work Wear", locale.value)}
                </Link>
              )}
              {loginType.value === "safety" && (
                <Link href="/apparel/" class={`nav-drawer__link ${loc.url.pathname.startsWith("/apparel") ? "active" : ""}`} onClick$={() => { menuOpen.value = false; window.dispatchEvent(new CustomEvent("select-category", { detail: "Flame Resistant" })); }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z"/><path d="M9 12l2 2 4-4"/></svg>
                  {t("cat.Flame Resistant", locale.value)}
                </Link>
              )}
              {loginType.value !== "tech" && (() => {
                // Mirror the catalog tabs exactly (same CLOTHING_CATEGORIES /
                // SAFETY_CATEGORIES source as product-catalog.tsx, minus "All"),
                // so the menu's categories, order and labels can never drift from
                // the tab bar. "Footwear" is the tab that groups the Safety
                // Boots / Safety Shoes data categories.
                const tabCats = loginType.value === "safety" ? SAFETY_CATEGORIES : CLOTHING_CATEGORIES;
                const NAV_CATS: { key: TranslationKey; cat: string; icon: string }[] =
                  tabCats.filter((c) => c !== "All").map((cat) => ({
                    cat,
                    key: `cat.${cat}` as TranslationKey,
                    icon: CATEGORY_ICONS[cat] || "",
                  }));
                const catMatches = (pCat: string, tabCat: string) =>
                  tabCat === "Footwear"
                    ? (pCat === "Safety Boots" || pCat === "Safety Shoes")
                    : pCat === tabCat;
                return (
                  <Accordion.Root class="nav-drawer__accordion" collapsible>
                    {NAV_CATS.map((c) => {
                      const items = allProducts.filter((p) => catMatches(p.category, c.cat));
                      return (
                        <Accordion.Item key={c.cat} value={c.cat} class="nav-drawer__cat">
                          <Accordion.Header as="h3">
                            <Accordion.Trigger class="nav-drawer__cat-trigger">
                              {/* When the category is already expanded, clicking
                                  the name navigates to the full category view
                                  (all products) instead of collapsing. When
                                  collapsed, the click bubbles to the trigger and
                                  expands the accordion as usual. */}
                              <span
                                class="nav-drawer__cat-label"
                                onClick$={async (e, el) => {
                                  const trigger = el.closest(".nav-drawer__cat-trigger");
                                  if (trigger?.hasAttribute("data-open")) {
                                    e.stopPropagation();
                                    menuOpen.value = false;
                                    window.dispatchEvent(new CustomEvent("select-category", { detail: c.cat }));
                                    await nav(`/apparel/#${c.cat.toLowerCase().replace(/\s+/g, "-")}`);
                                  }
                                }}
                              >
                                <span class="nav-drawer__cat-icon" dangerouslySetInnerHTML={c.icon} />
                                {t(c.key, locale.value)}
                              </span>
                              <svg class="nav-drawer__cat-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                            </Accordion.Trigger>
                          </Accordion.Header>
                          <Accordion.Content class="nav-drawer__cat-content">
                            {items.length === 0 ? (
                              <span class="nav-drawer__cat-empty">—</span>
                            ) : items.map((p) => (
                              <a key={p.sku} href={`/apparel/${p.sku}/`} class="nav-drawer__cat-item" onClick$={() => (menuOpen.value = false)}>
                                <img src={p.img} alt="" width="24" height="24" class="nav-drawer__cat-item-img" loading="lazy" decoding="async" />
                                {p.name.replace(/#\S+/g, '').replace(/\s*-\s*$/, '').trim()}
                              </a>
                            ))}
                          </Accordion.Content>
                        </Accordion.Item>
                      );
                    })}
                  </Accordion.Root>
                );
              })()}
            </div>
          </nav>
        </div>
      )}

      <main>
        <Slot />
      </main>

      <footer class="site-footer">
        <div class="site-footer__inner">
          <div class="site-footer__brand site-footer__brand--img">
            <img src="/tamarack-logo-white.png" alt="Tamarack" class="site-footer__logo-white" width="1451" height="250" loading="lazy" decoding="async" />
            <span class="brand-apparel">Apparel</span>
          </div>
          <div class="site-footer__col">
          {loginType.value === "safety" && (
          <nav class="site-footer__links">
            <Link href="/apparel/#fr" onClick$={(e) => { if (/^\/apparel\/?$/.test(loc.url.pathname)) { e.preventDefault(); } window.dispatchEvent(new CustomEvent("select-category", { detail: "Flame Resistant" })); const headerH = stickyTop(); const catalog = document.querySelector('.home-catalog'); if (catalog) { const top = catalog.getBoundingClientRect().top + window.scrollY - headerH + 2; window.scrollTo({ top, behavior: 'instant' }); } }}>{t("cat.Flame Resistant", locale.value)}</Link>
            <Link href="/apparel/#shirts" onClick$={(e) => { if (/^\/apparel\/?$/.test(loc.url.pathname)) { e.preventDefault(); } window.dispatchEvent(new CustomEvent("select-category", { detail: "Shirts" })); const headerH = stickyTop(); const catalog = document.querySelector('.home-catalog'); if (catalog) { const top = catalog.getBoundingClientRect().top + window.scrollY - headerH + 2; window.scrollTo({ top, behavior: 'instant' }); } }}>{t("cat.Shirts", locale.value)}</Link>
            <Link href="/apparel/#hats" onClick$={(e) => { if (/^\/apparel\/?$/.test(loc.url.pathname)) { e.preventDefault(); } window.dispatchEvent(new CustomEvent("select-category", { detail: "Hats" })); const headerH = stickyTop(); const catalog = document.querySelector('.home-catalog'); if (catalog) { const top = catalog.getBoundingClientRect().top + window.scrollY - headerH + 2; window.scrollTo({ top, behavior: 'instant' }); } }}>{t("cat.Hats", locale.value)}</Link>
            <Link class="site-footer__links-privacy" href="/privacy/">{t("footer.privacypolicy", locale.value)}</Link>
          </nav>
          )}
          {(loginType.value !== "tech" && loginType.value !== "safety") && (
          <nav class="site-footer__links">
            <Link href="/apparel/#shirts" onClick$={(e) => { if (/^\/apparel\/?$/.test(loc.url.pathname)) { e.preventDefault(); } window.dispatchEvent(new CustomEvent("select-category", { detail: "Shirts" })); const headerH = stickyTop(); const catalog = document.querySelector('.home-catalog'); if (catalog) { const top = catalog.getBoundingClientRect().top + window.scrollY - headerH + 2; window.scrollTo({ top, behavior: 'instant' }); } }}>{t("cat.Shirts", locale.value)}</Link>
            <Link href="/apparel/#jackets" onClick$={(e) => { if (/^\/apparel\/?$/.test(loc.url.pathname)) { e.preventDefault(); } window.dispatchEvent(new CustomEvent("select-category", { detail: "Jackets" })); const headerH = stickyTop(); const catalog = document.querySelector('.home-catalog'); if (catalog) { const top = catalog.getBoundingClientRect().top + window.scrollY - headerH + 2; window.scrollTo({ top, behavior: 'instant' }); } }}>{t("cat.Jackets", locale.value)}</Link>
            <Link href="/apparel/#hats" onClick$={(e) => { if (/^\/apparel\/?$/.test(loc.url.pathname)) { e.preventDefault(); } window.dispatchEvent(new CustomEvent("select-category", { detail: "Hats" })); const headerH = stickyTop(); const catalog = document.querySelector('.home-catalog'); if (catalog) { const top = catalog.getBoundingClientRect().top + window.scrollY - headerH + 2; window.scrollTo({ top, behavior: 'instant' }); } }}>{t("cat.Hats", locale.value)}</Link>
            <Link href="/apparel/#swag" onClick$={(e) => { if (/^\/apparel\/?$/.test(loc.url.pathname)) { e.preventDefault(); } window.dispatchEvent(new CustomEvent("select-category", { detail: "SWAG" })); const headerH = stickyTop(); const catalog = document.querySelector('.home-catalog'); if (catalog) { const top = catalog.getBoundingClientRect().top + window.scrollY - headerH + 2; window.scrollTo({ top, behavior: 'instant' }); } }}>{t("cat.SWAG", locale.value)}</Link>
            <Link href="/apparel/#new-hire-kit" onClick$={(e) => { if (/^\/apparel\/?$/.test(loc.url.pathname)) { e.preventDefault(); } window.dispatchEvent(new CustomEvent("select-category", { detail: "New Hire Kit" })); const headerH = stickyTop(); const catalog = document.querySelector('.home-catalog'); if (catalog) { const top = catalog.getBoundingClientRect().top + window.scrollY - headerH + 2; window.scrollTo({ top, behavior: 'instant' }); } }}>{t("cat.New Hire Kit", locale.value)}</Link>
            <Link class="site-footer__links-privacy" href="/privacy/">{t("footer.privacypolicy", locale.value)}</Link>
          </nav>
          )}
          <div class="site-footer__contact-block">
            <div class="site-footer__contact site-footer__contact--inline">
              <svg class="site-footer__contact-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
              <a href="mailto:info@tamarackapparel.ca">info@tamarackapparel.ca</a>
            </div>
            <Link class="site-footer__privacy-link" href="/privacy/">{t("footer.privacypolicy", locale.value)}</Link>
          </div>
          </div>
        </div>
      </footer>

      {/* Cart Drawer */}
      {cartOpen.value && (
        <div class="modal-overlay" onClick$={() => { if (checkoutStep.value !== "details") cartOpen.value = false; }}>
          <div class="drawer cart-drawer" onClick$={(e) => e.stopPropagation()}>
            <div class="cart-drawer__site-header">
              <Link href="/" class="site-header__logo">
                <img src="/logo.png" alt="Tamarack" class="site-header__logo-img" width="200" height="200" loading="eager" decoding="sync" />
              </Link>
              <nav class="site-header__nav">
                <button class="cart-btn" onClick$={() => (cartOpen.value = false)}>
                  <span class="cart-btn__label">{t("cart.mycart", locale.value)}</span>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
                </button>
              </nav>
            </div>
            <div class="cart-drawer__header">
              <h2 class="cart-drawer__title">{t("cart.title", locale.value)} <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg></h2>
              <button class="modal__close cart-drawer__close-desktop" onClick$={() => (cartOpen.value = false)}>x</button>
            </div>
            {cart.items.length === 0 ? (
              <div class="cart-drawer__empty">
                <p>{t("cart.empty", locale.value)}</p>
                <Link href="/apparel/" class="cart-drawer__back-link" onClick$={() => (cartOpen.value = false)}>{t("cart.backtoapparel", locale.value)}</Link>
              </div>
            ) : checkoutStep.value === "cart" ? (
              <>
                <div class="cart-drawer__items">
                  <table class="cart-table">
                    <thead>
                      <tr>
                        <th class="cart-table__th-product">{t("cart.invoice.product", locale.value)}</th>
                        <th class="cart-table__th-qty">{t("cart.invoice.qty", locale.value)}</th>
                        {loginType.value !== "tech" && <th class="cart-table__th-total"><span class="cart-table__th-qty-inline">{t("cart.invoice.qty", locale.value)} / </span>{t("cart.invoice.total", locale.value)}</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {cart.items.map((item, i) => (
                        <tr key={`${item.name}-${item.size}-${item.color}-${item.quantity}`}>
                          <td class="cart-table__product">
                            <div class="cart-table__product-row">
                            <img src={item.img} alt={item.name} width="40" height="30" class="cart-table__img" />
                            <div>
                            <Link href={item.sku ? `/apparel/${item.sku}/` : "/apparel/"} class="cart-table__name-link">{stripColorSuffix(item.name)}</Link>
                            <div class="cart-table__meta">
                              {item.color && item.color.startsWith("#") && <span class="cart-table__swatch" style={{ background: item.color }} aria-hidden="true" />}
                              <span>{item.color ? `${item.color.startsWith("#") ? colorName(item.color, locale.value) : item.color} / ` : ""}{item.size}</span>
                            </div>
                            </div>
                            </div>
                          </td>
                          <td class="cart-table__qty">
                            <div class="cart-table__qty-controls">
                              <button class="cart-table__qty-btn" aria-label={`Decrease quantity of ${item.name}`} onClick$={() => updateQty(i, -1)}>-</button>
                              <span>{item.quantity}</span>
                              <button class="cart-table__qty-btn" aria-label={`Increase quantity of ${item.name}`} onClick$={() => updateQty(i, 1)}>+</button>
                            </div>
                          </td>
                          {loginType.value !== "tech" && <td class="cart-table__total">${(((Number(item.price) || 0) * item.quantity)).toFixed(2)}</td>}
                        </tr>
                      ))}
                    </tbody>
                    {loginType.value !== "tech" && (
                      <tfoot>
                        <tr>
                          <td colSpan={2} class="cart-table__subtotal-label">{t("cart.invoice.subtotal", locale.value)}</td>
                          <td class="cart-table__subtotal-val">${subtotal.value.toFixed(2)}</td>
                        </tr>
                        {empProvince.value ? (
                          <>
                            <tr>
                              <td colSpan={2} class="cart-table__subtotal-label">{taxLabel.value}</td>
                              <td class="cart-table__subtotal-val">${(taxAmount.value ?? 0).toFixed(2)}</td>
                            </tr>
                            <tr>
                              <td colSpan={2} class="cart-table__subtotal-label" style={{ fontWeight: 700 }}>{t("cart.invoice.total", locale.value)}</td>
                              <td class="cart-table__subtotal-val" style={{ fontWeight: 700 }}>${orderTotal.value.toFixed(2)}</td>
                            </tr>
                          </>
                        ) : (
                          <tr>
                            <td colSpan={2} class="cart-table__subtotal-label">+ {t("cart.invoice.tax", locale.value)}</td>
                            <td class="cart-table__subtotal-val">—</td>
                          </tr>
                        )}
                      </tfoot>
                    )}
                  </table>
                </div>
                <div class="cart-drawer__footer">
                  <span class="cart-drawer__total">
                    {cartCount.value} {cartCount.value !== 1 ? t("cart.items", locale.value) : t("cart.item", locale.value)}{loginType.value !== "tech" && (empProvince.value ? ` — $${orderTotal.value.toFixed(2)}` : ` — $${subtotal.value.toFixed(2)} + ${t("cart.invoice.tax", locale.value).toLowerCase()}`)}
                  </span>
                  <button
                    class="btn btn--primary cart-drawer__order-btn"
                    onClick$={() => { summaryOpen.value = true; checkoutStep.value = "details"; }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
                    {t("cart.checkout", locale.value)}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div class="cart-drawer__details-step">
                  <button class="cart-drawer__back-btn" onClick$={() => { checkoutStep.value = "cart"; }}>
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
                        <input
                          type="text"
                          value={empFirstName.value}
                          onInput$={(_, el) => { empFirstName.value = el.value; formError.value = ""; }}
                        />
                      </div>
                      <div class={`checkout-modal__field ${formTouched.value && !empLastName.value ? "checkout-modal__field--error" : ""}`}>
                        <label>{t("cart.lastname", locale.value)}</label>
                        <input
                          type="text"
                          value={empLastName.value}
                          onInput$={(_, el) => { empLastName.value = el.value; formError.value = ""; }}
                        />
                      </div>
                    </div>
                    {/* Province sits directly under the name row so the
                        tax line in the cart total updates as soon as
                        possible — before the user fills in phone/email. */}
                    <div class={`checkout-modal__field ${formTouched.value && !empProvince.value ? "checkout-modal__field--error" : ""}`}>
                      <label>{t("cart.province", locale.value)}</label>
                      <select
                        required
                        value={empProvince.value}
                        onChange$={(_, el) => {
                          empProvince.value = el.value;
                          if (!needsLocation(el.value)) empDept.value = "";
                          formError.value = "";
                        }}
                      >
                        <option value="" disabled hidden>{locale.value === "fr" ? "Sélectionner…" : "Select…"}</option>
                        <option value="AB">Alberta</option>
                        <option value="BC">British Columbia</option>
                        <option value="MB">Manitoba</option>
                        <option value="NB">New Brunswick</option>
                        <option value="NL">Newfoundland and Labrador</option>
                        <option value="NS">Nova Scotia</option>
                        <option value="ON">Ontario</option>
                        <option value="PE">Prince Edward Island</option>
                        <option value="QC">Quebec</option>
                        <option value="SK">Saskatchewan</option>
                      </select>
                    </div>
                    {/* Location renders only for multi-branch provinces
                        (see needsLocation). Kept directly under Province so
                        the conditional field appears next to the trigger
                        that toggled it. */}
                    {needsLocation(empProvince.value) && (
                      <div class={`checkout-modal__field ${formTouched.value && !empDept.value ? "checkout-modal__field--error" : ""}`}>
                        <label>{t("cart.location", locale.value)}</label>
                        <input
                          type="text"
                          value={empDept.value}
                          onInput$={(_, el) => (empDept.value = el.value)}
                        />
                      </div>
                    )}
                    <div class={`checkout-modal__field ${formTouched.value && !empEmail.value ? "checkout-modal__field--error" : ""}`}>
                      <label>{t("cart.email", locale.value)}</label>
                      <input
                        type="email"
                        value={empEmail.value}
                        onInput$={(_, el) => { empEmail.value = el.value; formError.value = ""; }}
                      />
                    </div>
                    <div class={`checkout-modal__field ${formTouched.value && !empPhone.value ? "checkout-modal__field--error" : ""}`}>
                      <label>{t("cart.phone", locale.value)}</label>
                      <input
                        type="tel"
                        value={empPhone.value}
                        onInput$={(_, el) => { empPhone.value = el.value; formError.value = ""; }}
                      />
                    </div>
                  </div>

                  {/* ---- Payment: purchase order only (like mn2) ---- */}
                  <div class="checkout-modal__pay">
                    <h3 class="checkout-modal__form-title">{t("pay.title", locale.value)}</h3>
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
                    class="btn btn--primary cart-drawer__order-btn"
                    onClick$={submitOrder}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
                    {(payMethod.value === "card" || (payMethod.value === "giftcard_card" && giftRemaining.value > 0))
                      ? t("cart.continuepayment", locale.value)
                      : t("cart.createorder", locale.value)}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Order Confirmation */}
      <Modal.Root bind:show={orderSubmitted} closeOnBackdropClick={true}>
        <Modal.Panel class="modal-overlay">
          <div class="modal order-confirm">
            <h2 class="order-confirm__title">{t("order.title", locale.value)}</h2>
            <p class="order-confirm__text">{t("order.text", locale.value)}</p>
            <Link href="/" class="btn btn--primary">{t("order.continue", locale.value)}</Link>
          </div>
        </Modal.Panel>
      </Modal.Root>
      </>}
    </>
  );
});
