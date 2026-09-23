import { component$, Slot, useSignal, useTask$, useVisibleTask$, $, useContextProvider, useStore, useComputed$, createContextId, isBrowser } from "@builder.io/qwik";
import type { Signal } from "@builder.io/qwik";
import { Modal, Accordion } from '@qwik-ui/headless';
import {
  Link,
  routeAction$,
  routeLoader$,
  server$,
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
import { getGiftCard, giftContribution, deductGiftCard } from "../lib/giftcards";
import { sendConfirmationEmail } from "../lib/orders";
import type { OrderEmailData, PaymentMethod } from "../lib/orders";
import { createCheckoutSession } from "../lib/stripe";

const AUTH_COOKIE = "tm_auth"; // Tamarack-specific (isolated from sibling sites)
const LOCALE_COOKIE = "ce_locale";

// The home hero has been removed — "/" is now the catalog itself, so the header
// must always be visible (solid, with its logo) exactly like every other route,
// including the product pages. Hero slide-in mode is therefore OFF.

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

// "service" = the full catalog (first password). "labourers" = the second, curated
// lineup (second password). The label "Group B" is internal only — it is never
// shown to shoppers; the store looks identical either way, only the product set
// differs.
export type LoginType = "service" | "labourers" | null;

export function getLoginType(cookie: Cookie): LoginType {
  const val = cookie.get(AUTH_COOKIE)?.value;
  if (val === "service" || val === "labourers") return val;
  // backward compat: the old clothing/authenticated (and the retired
  // "electrical" scaffold) logins map to the full catalog.
  if (val === "clothing" || val === "authenticated" || val === "electrical") return "service";
  return null;
}

function isAuthenticated(cookie: Cookie): boolean {
  return getLoginType(cookie) !== null;
}

export const useAuthCheck = routeLoader$(({ cookie }) => {
  const loginType = getLoginType(cookie);
  return { loggedIn: loginType !== null, loginType: loginType || "service" };
});

export const useCartCountLoader = routeLoader$(({ cookie }) => {
  return parseInt(cookie.get("ce_cart_count")?.value || "0", 10);
});

export const useLogin = routeAction$(
  ({ portal, password }, { cookie, fail, env }) => {
    // Both portals share ONE password (APP_PASSWORD, set in Cloudflare). The
    // picked portal only decides which catalog is shown — Site Clerks ("service",
    // full catalog) or Labourers ("labourers", curated lineup) — not the credential.
    // Portal names live only on the login screen, never in the store.
    const expected = env.get("APP_PASSWORD") || env.get("VITE_APP_PASSWORD");
    if (!expected) {
      return fail(500, { message: "Login not configured" });
    }
    if (password === expected) {
      const granted = portal === "labourers" ? "labourers" : "service";
      cookie.set(AUTH_COOKIE, granted, {
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "none",
        maxAge: 60 * 60 * 24 * 3,
      });
      return { success: true };
    }
    return fail(401, { message: "Invalid password" });
  },
  zod$({
    portal: z.enum(["service", "labourers"]).optional().default("service"),
    password: z.string().min(1).max(128),
  }),
);

export const useLogout = routeAction$(async (_, { cookie }) => {
  cookie.delete(AUTH_COOKIE, { path: "/" });
  return { success: true };
});

// Look up a gift card's balance from the checkout form (before submitting), so
// the UI can show how much it covers and how much is left for the card.
//
// This is a server$ RPC, NOT a routeAction$: a routeAction submit runs the
// router lifecycle, which fired the "close the cart on navigation" visible-task
// and booted the user out of the checkout drawer on every Apply. server$ is a
// plain server call with no navigation, so the drawer stays put.
export const checkGiftCardBalance = server$(async function (code: string) {
  const env = this.env;
  const tursoUrl = env.get("TURSO_URL") || env.get("VITE_TURSO_URL");
  const tursoToken = env.get("TURSO_AUTH_TOKEN") || env.get("VITE_TURSO_AUTH_TOKEN");
  if (!tursoUrl || !tursoToken) return { valid: false, balance: 0, error: "not_configured" as const };
  const db = createClient({ url: tursoUrl, authToken: tursoToken });
  const card = await getGiftCard(db, (code || "").slice(0, 64));
  if (!card || !card.active) return { valid: false, balance: 0 };
  return { valid: true, balance: card.balance };
});

export const useSubmitOrder = routeAction$(
  async (data, { fail, env, cookie, url }) => {
    if (!isAuthenticated(cookie)) {
      return fail(401, { message: "Not authenticated" });
    }
    const lt = getLoginType(cookie);
    // Group B orders are tagged to their own vendor bucket so the admin can tell
    // the two lineups apart; the full catalog uses the main Tamarack vendor.
    // Both share the TM-<n> order numbering (the sequence counts vendor LIKE
    // 'tamarack%').
    const vendor = lt === "labourers" ? "tamarack-labourers" : "tamarack";
    // Read from non-prefixed names first, fall back to VITE_* for backward compat.
    // Both are safe at runtime — env.get() reads server env, never bundles.
    const tursoUrl = env.get("TURSO_URL") || env.get("VITE_TURSO_URL");
    const tursoToken = env.get("TURSO_AUTH_TOKEN") || env.get("VITE_TURSO_AUTH_TOKEN");
    const apiKey = env.get("RESEND_API_KEY") || env.get("VITE_RESEND_API_KEY");
    const stripeKey = env.get("STRIPE_SECRET_KEY") || env.get("VITE_STRIPE_SECRET_KEY");

    const { employee, items, date, idempotencyKey } = data;
    const paymentMethod = (data.paymentMethod || "po") as PaymentMethod;
    const wantsGift = paymentMethod === "giftcard" || paymentMethod === "giftcard_card";
    const wantsCard = paymentMethod === "card" || paymentMethod === "giftcard_card";

    const province = employee.province;
    if (!province || !PROVINCE_TAX[province]) {
      return fail(400, { message: "Please select a province before submitting the order." });
    }
    if (!employee.address1?.trim() || !employee.city?.trim() || !employee.postal?.trim()) {
      return fail(400, { message: "A full shipping address (street, city, postal code) is required." });
    }
    if (paymentMethod === "po" && !employee.po) {
      return fail(400, { message: "A PO number is required for purchase-order checkout." });
    }
    const taxRate = PROVINCE_TAX[province];
    const taxPct = +(taxRate * 100).toFixed(3);
    const subtotal = items.reduce((sum, i) => sum + (Number(i.price) || 0) * i.quantity, 0);
    const tax = subtotal * taxRate;
    const total = +(subtotal + tax).toFixed(2);

    // Dry-run / test mode (local .env only — never set in production). Runs the
    // full validation + UI flow but skips the Turso write, gift/Stripe, and email:
    //   ORDER_TEST_MODE=1|true|yes  -> simulate SUCCESS (no DB, no email)
    //   ORDER_TEST_MODE=fail        -> simulate the real DB-failure response
    const testModeVal = (env.get("ORDER_TEST_MODE") || env.get("VITE_ORDER_TEST_MODE") || "").trim().toLowerCase();
    if (testModeVal === "fail") {
      console.warn("[ORDER_TEST_MODE=fail] Simulating a failed order (no DB, no email).");
      return fail(500, { message: "Order could not be saved. Please try again." });
    }
    if (/^(1|true|yes)$/.test(testModeVal)) {
      console.warn("[ORDER_TEST_MODE] Skipping DB insert + email. Simulated order.", { vendor, total });
      return { success: true, orderNumber: "TM-TEST" };
    }

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
    // Empty string must become NULL so orders without a key don't collide on the
    // unique index (SQLite treats NULLs as distinct, empty strings not).
    const idemKey = (idempotencyKey || "").trim() || null;
    try {
      // Warm up the connection before writing. Turso databases on low-traffic
      // apps can be cold, and the first request after idle can fail or be slow.
      // Retry a harmless SELECT a few times (with backoff) to wake it. We retry
      // only this read — never the INSERT — so a cold start can't create a
      // duplicate order. The INSERT below then runs once on a live connection.
      const WARMUP_TRIES = 3;
      let warmErr: unknown = null;
      for (let attempt = 1; attempt <= WARMUP_TRIES; attempt++) {
        try {
          await db.execute("SELECT 1");
          warmErr = null;
          break;
        } catch (err) {
          warmErr = err;
          console.warn(`Turso warmup attempt ${attempt}/${WARMUP_TRIES} failed:`, err);
          if (attempt < WARMUP_TRIES) await new Promise((r) => setTimeout(r, 600 * attempt));
        }
      }
      if (warmErr) throw warmErr;

      try {
        const result = await db.execute({
          sql: `INSERT INTO orders (vendor, emp_number, emp_name, emp_dept, po_number, items, total, status, payment_method, gift_card_code, gift_amount, card_amount, device, idempotency_key, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
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
            data.device || null,
            idemKey,
          ],
        });
        orderId = (result.lastInsertRowid as any) ?? null;
      } catch (err) {
        // Idempotent replay: if this key already produced an order (a prior
        // attempt saved before the response was lost), reuse that same order
        // instead of inserting a duplicate. Any other error propagates.
        if (idemKey && /UNIQUE constraint failed/i.test(String((err as any)?.message ?? err))) {
          const existing = await db.execute({
            sql: "SELECT id FROM orders WHERE idempotency_key = ?",
            args: [idemKey],
          });
          if (existing.rows.length > 0) {
            orderId = (existing.rows[0] as any).id;
            console.warn("Idempotent replay — reusing existing order for key", idemKey);
          } else {
            throw err;
          }
        } else {
          throw err;
        }
      }

      // Confirm the row actually persisted before telling the customer it went
      // through — a silent non-write returns 0 rows and we fail loudly instead
      // of showing a false success.
      if (orderId == null) {
        console.error("Insert returned no rowid — order not confirmed");
        return fail(500, { message: "Order could not be confirmed. Please try again." });
      }
      const check = await db.execute({ sql: "SELECT id FROM orders WHERE id = ?", args: [orderId as any] });
      if (check.rows.length === 0) {
        console.error("Order row not found after insert — order not confirmed", orderId);
        return fail(500, { message: "Order could not be confirmed. Please try again." });
      }
      const seq = await db.execute({
        sql: "SELECT COUNT(*) AS n FROM orders WHERE vendor LIKE 'tamarack%' AND id <= ?",
        args: [orderId as any],
      });
      const n = Number((seq.rows[0] as any)?.n) || Number(orderId);
      orderNumber = `TM-${n}`;
    } catch (err) {
      console.error("Failed to save order to database:", err);
      return fail(500, { message: "Order could not be saved. Please try again." });
    }

    const provinceName = PROVINCE_NAMES[province] || province;
    const fromAddress = env.get("RESEND_FROM") || env.get("VITE_RESEND_FROM") || "Tamarack <onboarding@resend.dev>";
    const staffAddresses = (env.get("ORDER_NOTIFY_TO") || env.get("VITE_ORDER_NOTIFY_TO") || "info@tamarackapparel.ca")
      .split(",").map((a) => a.trim()).filter(Boolean);

    // Absolute origin for the email logo (hosted raster, since email can't
    // render the header's inline SVG). Prefer SITE_URL, fall back to request.
    const emailLogoUrl = (() => {
      let b = (env.get("SITE_URL") || url.origin || "").trim();
      if (b && !/^https?:\/\//i.test(b)) b = "https://" + b;
      let origin = url.origin;
      try { origin = new URL(b).origin; } catch { origin = url.origin; }
      return `${origin}/favicon-512.png`;
    })();

    // Build the confirmation-email payload once (used by the no-card path and
    // the dev simulated-card path).
    const buildEmailData = (): OrderEmailData => ({
      orderNumber, date, logoUrl: emailLogoUrl,
      employee: {
        name: employee.name, email: employee.email, phone: employee.phone,
        department: employee.department, provinceName, provinceCode: province,
        address1: employee.address1, city: employee.city, postal: employee.postal, po: employee.po,
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
      // Build the return-URL base from the ORIGIN only. Stripe needs an absolute
      // https URL, and a SITE_URL that includes a path (".../apparel") would push
      // success_url to /checkout/success/ — a non-existent route. Add a
      // scheme if missing, then strip everything to scheme+host.
      let siteBase = (env.get("SITE_URL") || url.origin || "").trim();
      if (siteBase && !/^https?:\/\//i.test(siteBase)) siteBase = "https://" + siteBase;
      let siteUrl = url.origin;
      try { siteUrl = new URL(siteBase).origin; } catch { siteUrl = url.origin; }
      console.warn(`[DEV] Simulated card payment for order ${orderNumber} — no Stripe key set.`);
      return { redirectUrl: `${siteUrl}/checkout/success/?test=1`, orderNumber };
    }

    // ---- Card required → hand off to Stripe Checkout ----
    if (cardAmount > 0) {
      // Build the return-URL base from the ORIGIN only. Stripe needs an absolute
      // https URL, and a SITE_URL that includes a path (".../apparel") would push
      // success_url to /checkout/success/ — a non-existent route. Add a
      // scheme if missing, then strip everything to scheme+host.
      let siteBase = (env.get("SITE_URL") || url.origin || "").trim();
      if (siteBase && !/^https?:\/\//i.test(siteBase)) siteBase = "https://" + siteBase;
      let siteUrl = url.origin;
      try { siteUrl = new URL(siteBase).origin; } catch { siteUrl = url.origin; }
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
            address1: employee.address1 || "",
            city: employee.city || "",
            postal: employee.postal || "",
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
        // Mark the order so a failed handoff isn't left looking like a real,
        // payable order in the admin.
        await db.execute({ sql: "UPDATE orders SET status = 'payment_error' WHERE id = ?", args: [orderId as any] });
        // Surface the actual Stripe reason (e.g. bad key) — the generic message
        // hid why the card step never started.
        return fail(502, { message: `Card payment couldn't start: ${(err as Error)?.message || "unknown error"}` });
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
      await sendConfirmationEmail({ apiKey, from: fromAddress, staffAddresses }, buildEmailData());
    } else {
      console.warn("RESEND_API_KEY not configured — order saved but email not sent");
    }

    return { success: true, orderNumber };
  },
  zod$({
    paymentMethod: z.enum(["po", "giftcard", "giftcard_card", "card"]).default("po"),
    device: z.enum(["mobile", "tablet", "desktop"]).optional(),
    giftCardCode: z.string().max(64).optional(),
    employee: z.object({
      name: z.string().min(1).max(120),
      email: z.string().email().max(254).or(z.literal("")),
      phone: z.string().max(40),
      department: z.string().max(120),
      province: z.string().length(2),
      address1: z.string().min(1).max(200),
      city: z.string().min(1).max(120),
      postal: z.string().min(1).max(20),
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
    idempotencyKey: z.string().max(80).optional().default(""),
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

export default component$(() => {
  const loc = useLocation();
  const nav = useNavigate();
  const auth = useAuthCheck();
  // Payment-return pages (Stripe success/cancelled). A customer coming back from
  // Stripe is a cross-site navigation, and even with a SameSite=Lax cookie it can
  // land un-recognised for that one request — which used to drop them onto the
  // login wall instead of their confirmation. These pages must show regardless
  // of auth, so exempt them from the login gate.
  const isPaymentReturn = useComputed$(() => loc.url.pathname.includes("/checkout/"));
  // True only on the dedicated /checkout page. The cart drawer stays mounted
  // (cartOpen) but is hidden here, so its overlay keeps covering the page
  // during the cart → checkout nav — no flash of the PDP underneath.
  const isCheckout = useComputed$(() => {
    const p = loc.url.pathname;
    return p === "/checkout" || p === "/checkout/";
  });
  const loginAction = useLogin();
  const logoutAction = useLogout();
  const orderAction = useSubmitOrder();

  const showLogin = useSignal(false);
  // Which portal tile is picked on the login screen. "service" = Site Clerks
  // (full catalog), "labourers" = Labourers (curated lineup). Submitted with the
  // password so the server checks that portal's password.
  const selectedPortal = useSignal<"service" | "labourers">("service");
  const overlayFading = useSignal(false);
  const menuOpen = useSignal(false);
  const savedLocale = useLocaleLoader();
  const locale = useSignal<Locale>(savedLocale.value);

  // EN/FR language toggle (footer on tablet+desktop, menu drawer on mobile).
  const toggleLocale = $(() => {
    locale.value = locale.value === "en" ? "fr" : "en";
    document.cookie = `${LOCALE_COOKIE}=${locale.value};path=/;max-age=31536000`;
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
    () =>
      (loc.url.pathname === "/" || (!loc.url.pathname.startsWith("/privacy") && !loc.url.pathname.startsWith("/checkout"))),
  );

  useContextProvider(LocaleContext, locale);

  // Typed as string (not the "service" | "electrical" union): several views still
  // compare against legacy portal values ("tech" / "safety"), and this also
  // matches LoginTypeContext's Signal<string>. Keeps the type-check (part of the
  // production build) from failing on those otherwise-narrowed comparisons.
  const loginType = useSignal<string>(auth.value.loginType);
  useContextProvider(LoginTypeContext, loginType);

  // Cart state
  const initialCartCount = useCartCountLoader();
  const cart = useStore<{ items: CartItem[] }>({ items: [] });
  const ssrCartCount = useSignal(initialCartCount.value);
  // Once the client has loaded the real cart, the live count is authoritative —
  // even when it drops to 0. Before that (SSR / first paint) we show the cookie
  // count so the badge isn't blank on load.
  const cartHydrated = useSignal(false);
  const cartOpen = useSignal(false);
  const orderSubmitted = useSignal(false);
  const orderNum = useSignal("");
  const submitting = useSignal(false);
  const checkoutOpen = useSignal(false);
  const checkoutStep = useSignal<"cart" | "details">("cart");
  const formError = useSignal("");
  const formTouched = useSignal(false);
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

  // Payment: 'po' (invoice), 'giftcard', 'giftcard_card', 'card'.
  const payMethod = useSignal<"po" | "giftcard" | "giftcard_card" | "card">("po");
  const giftCode = useSignal("");
  const giftBalance = useSignal<number | null>(null); // null = not yet checked
  const giftChecking = useSignal(false);
  const giftError = useSignal("");
  const usesGift = useComputed$(() => payMethod.value === "giftcard" || payMethod.value === "giftcard_card");

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const checkGiftCard = $(async () => {
    giftError.value = "";
    if (!giftCode.value.trim()) { giftError.value = t("pay.gift.enter", locale.value); return; }
    giftChecking.value = true;
    try {
      const v = await checkGiftCardBalance(giftCode.value.trim());
      if (v?.valid) {
        giftBalance.value = Number(v.balance) || 0;
      } else {
        giftBalance.value = null;
        giftError.value = t("pay.gift.invalid", locale.value);
      }
    } catch {
      giftBalance.value = null;
      giftError.value = t("pay.gift.invalid", locale.value);
    } finally {
      giftChecking.value = false;
    }
  });

  const cartCount = useComputed$(() => {
    const count = cart.items.reduce((sum, i) => sum + i.quantity, 0);
    return cartHydrated.value ? count : ssrCartCount.value;
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
  // What's left ON THE CARD after this order (balance minus what it covers) —
  // shown when the card fully covers the order, so the customer sees their
  // remaining allotment instead of a bare $0.00 amount-due.
  // Whether the order can be placed — every required field filled and the
  // payment method satisfied (gift card checked / covers the order, PO number
  // for PO). Drives the greyed-out state of the place-order button. Detailed
  // email/phone FORMAT checks stay on submit so the button un-greys once the
  // fields are simply filled in.
  const canPlaceOrder = useComputed$(() => {
    if (!empFirstName.value.trim() || !empLastName.value.trim() || !empEmail.value.trim()
        || !empPhone.value.trim() || !empProvince.value) return false;
    if (!empAddress1.value.trim() || !empCity.value.trim() || !empPostal.value.trim()) return false;
    if (payMethod.value === "po" && !empPO.value.trim()) return false;
    if (usesGift.value && giftBalance.value == null) return false;           // card not applied yet
    if (payMethod.value === "giftcard" && giftRemaining.value > 0) return false; // gift doesn't cover it
    return true;
  });
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
      // Client cart is now authoritative — even an empty cart must read as 0,
      // not the stale cookie count. Set in a finally-style position so a parse
      // error can't leave the badge stuck on the SSR number.
      cartHydrated.value = true;
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const submitOrder = $(async () => {
    // Fail-safe: the button is disabled while greyed out, but never act on a
    // click that somehow gets through when the order can't be placed / is sending.
    if (!canPlaceOrder.value || submitting.value) return;
    formTouched.value = true;
    const poRequired = payMethod.value === "po";
    if (!empFirstName.value || !empLastName.value || !empAddress1.value || !empCity.value || !empPostal.value || !empEmail.value || !empPhone.value || !empProvince.value || (poRequired && !empPO.value)) {
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
    // Field-format checks — collect ALL failures so every invalid field is
    // reported together in one submit, not one at a time.
    const fmtErrors: string[] = [];
    // Email (basic RFC-ish — anything@anything.tld)
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(empEmail.value.trim())) fmtErrors.push(t("cart.error.email", locale.value));
    // Phone — full number (10 digits NANP, up to 15 for an intl. dialing
    // prefix), allowing +, spaces, dashes, parens, dots.
    const phoneDigits = empPhone.value.replace(/[^\d]/g, "");
    if (phoneDigits.length < 10 || phoneDigits.length > 15 || !/^[\d\s+()\-.]+$/.test(empPhone.value.trim())) fmtErrors.push(t("cart.error.phone", locale.value));
    // Canadian postal code — A1A 1A1 (optional space/hyphen).
    if (!/^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/.test(empPostal.value.trim())) fmtErrors.push(t("cart.error.postal", locale.value));
    if (fmtErrors.length) {
      formError.value = fmtErrors.join("\n");
      checkoutOpen.value = true;
      return;
    }
    formError.value = "";

    // Which layout the order was placed on — viewport width against the site's
    // own breakpoints (mobile <=600, tablet 601-1024, desktop >=1025).
    const device: "mobile" | "tablet" | "desktop" = window.innerWidth <= 600 ? "mobile" : window.innerWidth <= 1024 ? "tablet" : "desktop";
    const orderData = {
      paymentMethod: payMethod.value,
      device,
      ...(usesGift.value ? { giftCardCode: giftCode.value.trim() } : {}),
      employee: { name: `${empFirstName.value} ${empLastName.value}`, email: empEmail.value, phone: empPhone.value, department: empDept.value, province: empProvince.value, address1: empAddress1.value, city: empCity.value, postal: empPostal.value, po: empPO.value },
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

    // Send order via server action. Show a spinner while the server saves the
    // order to the DB — success is only shown after that write confirms.
    submitting.value = true;
    let result: any;
    try {
      result = await orderAction.submit(orderData);
    } catch (err) {
      console.error("Order submit threw:", err);
      formError.value = (err as Error)?.message || t("cart.error.network", locale.value);
      submitting.value = false;
      return;
    }
    const v = result?.value as any;
    if (v?.failed) {
      submitting.value = false;
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
      formError.value = msg || t("cart.error.failed", locale.value);
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

    orderNum.value = v?.orderNumber || "";
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
    submitting.value = false;
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

  // Toggle the mobile menu from child pages (the hero cover's menu button) via a
  // custom event, rather than a programmatic click on the header hamburger. The
  // proxy click was fragile — on the home hero the hamburger is display:none /
  // pointer-events:none until the overlay exists, and a not-yet-hydrated first
  // tap could fall through to the content behind it (navigating to a product).
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => {
    const handler = () => {
      menuOpen.value = !menuOpen.value;
      if (menuOpen.value) cartOpen.value = false;
    };
    window.addEventListener("toggle-menu", handler);
    cleanup(() => window.removeEventListener("toggle-menu", handler));
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
    tabsStuck.value = !path.startsWith("/privacy") && !path.startsWith("/checkout");
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
      if ((!loc.url.pathname.startsWith("/privacy") && !loc.url.pathname.startsWith("/checkout"))) {
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
  // Only close on a REAL path change. A routeAction submit (order submit, etc.)
  // re-runs this task with the SAME pathname; without the guard it slammed the
  // cart shut mid-checkout and hid the order's error message behind the closed
  // drawer — which is exactly how a failed card handoff looked like "success".
  const prevPath = useSignal<string | null>(null);
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track }) => {
    const p = track(() => loc.url.pathname);
    if (prevPath.value !== null && prevPath.value !== p) {
      cartOpen.value = false;
      searchOpen.value = false;
    }
    prevPath.value = p;
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
    if (!auth.value.loggedIn && !isPaymentReturn.value) {
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
      {/* Mobile + tablet: the responsive layouts aren't ready for launch yet, so
          below the desktop breakpoint (<=1024px) cover the whole app with a
          "coming soon" screen. Pure CSS media query (see .mobile-coming-soon in
          global.css) — always rendered, shown only on small viewports, and its
          max z-index sits over the header, login overlay and content alike. */}
      <div class="mobile-coming-soon" aria-hidden="true">
        <div class="mobile-coming-soon__inner">
          <div class="mobile-coming-soon__brand brand-cluster">
            <img class="brand-cluster__logo" src="/tamarack-logo-white.png" alt="Tamarack Apparel" width="1451" height="250" />
            <span class="brand-cluster__apparel">{t("brand.apparel", locale.value)}</span>
          </div>
          <h1 class="mobile-coming-soon__title">Mobile &amp; Tablet<br />Coming Soon</h1>
        </div>
      </div>

      {/* Login Modal */}
      {showLogin.value && !isPaymentReturn.value && (
        <div class={`login-overlay ${overlayFading.value ? "login-overlay--fading" : ""}`} onClick$={() => { if (auth.value.loggedIn) showLogin.value = false; }}>
          {/* Split login: the sign-in form over the green iron-textured sign pane
              on the left third, a single Tamarack hero photo filling the right. */}
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
                  <span class="brand-apparel">{t("brand.apparel", locale.value)}</span>
                </div>
              </div>
              <Form action={loginAction} reloadDocument class="login-modal__form">
                {loginAction.value?.failed && (
                  <div class={`login-modal__error ${(loginAction.value as { comingSoon?: boolean }).comingSoon ? "login-modal__error--info" : ""}`}>{loginAction.value.message}</div>
                )}
                {/* Portal picker — two tiles; the selected one is submitted as a
                    hidden field and its own password is checked server-side. */}
                <input type="hidden" name="portal" value={selectedPortal.value} />
                <div class="login-modal__field">
                  <div class="login-portals" role="radiogroup" aria-label="Portal">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={selectedPortal.value === "service"}
                      class={`login-portal ${selectedPortal.value === "service" ? "is-selected" : ""}`}
                      onClick$={() => { selectedPortal.value = "service"; }}
                    >
                      <span>Site Clerks</span>
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={selectedPortal.value === "labourers"}
                      class={`login-portal ${selectedPortal.value === "labourers" ? "is-selected" : ""}`}
                      onClick$={() => { selectedPortal.value = "labourers"; }}
                    >
                      <span>Labourers</span>
                    </button>
                  </div>
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
                <button type="submit" class="btn login-modal__submit">
                  {loginAction.isRunning ? t("login.submitting", locale.value) : t("login.submit", locale.value)}
                </button>
              </Form>
            </div>
            <div class="login-modal__carousel" aria-hidden="true">
              <img src="/login-hero.jpg" alt="" width="1920" height="776"
                   loading="eager" decoding="sync"
                   class="login-modal__slide is-active" />
            </div>
          </div>
        </div>
      )}

      {/* Tablet widths aren't finished — CSS shows this over everything between
          601px and 1024px, so only mobile and desktop render the site. */}
      <div class="tablet-notice" aria-live="polite">
        <span class="tablet-notice__title">{t("tablet.title", locale.value)}</span>
        <span class="tablet-notice__sub">{t("tablet.sub", locale.value)}</span>
      </div>

      {(auth.value.loggedIn || (loginAction.value && !loginAction.value.failed) || isPaymentReturn.value) && <>
      <header class={`site-header site-header--white ${tabsStuck.value ? "site-header--tabs-stuck" : ""} ${searchOpen.value ? "site-header--search-open" : ""} ${cartOpen.value || isCheckout.value ? "site-header--cart-open" : ""}`}>
        <div class="site-header__inner">
          <Link
            href="/"
            class="site-header__logo brand-cluster brand-cluster--small"
            onClick$={(e) => {
              // Already on the catalog home: clicking the logo resets the active
              // collection back to "All" (rather than a no-op navigation to the
              // same route that leaves a specific category selected).
              if (loc.url.pathname === "/") {
                e.preventDefault();
                window.dispatchEvent(new CustomEvent("select-category", { detail: "All" }));
                window.scrollTo({ top: 0, behavior: "instant" });
              }
            }}
          >
            <img class="brand-cluster__logo" src="/tamarack-logo-white.png" alt="Tamarack Apparel" width="1451" height="250" />
            <span class="brand-cluster__apparel">{t("brand.apparel", locale.value)}</span>
          </Link>
          <nav class="site-header__categories">
            <Link href="/" class={loc.url.pathname === "/" ? "active" : ""}>{t("nav.home", locale.value)}</Link>
            <Link href="/" class={(!loc.url.pathname.startsWith("/privacy") && !loc.url.pathname.startsWith("/checkout")) ? "active" : ""}>{loginType.value === "tech" ? t("cat.Work Wear", locale.value) : t("nav.apparel", locale.value)}</Link>
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
                  // whose strip is always stuck (/) the comparison read
                  // "a few px short" even when the catalog sat exactly under the
                  // bar, and every open nudged the page ~6px. That nudge was the
                  // shift around the tab strip.
                  const alreadyPinned = !!header?.classList.contains("site-header--tabs-stuck");
                  if (!needsReposition && catalog && !alreadyPinned) {
                    const top = catalog.getBoundingClientRect().top + window.scrollY - headerH;
                    // Only reposition for a MEANINGFUL gap. stickyTop() drifts a
                    // few px from the header's real height, so with the old +2
                    // fudge and a 1px threshold every open nudged the page ~5px
                    // even when the catalog already sat under the bar (the visible
                    // shift on /, where the strip is always pinned). An
                    // 8px threshold absorbs that drift; genuine repositions (the
                    // hero's full height) are far larger and still fire.
                    if (window.scrollY < top - 8) window.scrollTo({ top, behavior: "instant" });
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
            {/* EN/FR toggle moved to the footer. */}
            <button class={`cart-btn ${cart.items.length > 0 ? "cart-btn--active" : ""}`} onClick$={() => { if (isCheckout.value) { cartOpen.value = true; nav("/"); return; } cartOpen.value = !cartOpen.value; if (cartOpen.value) menuOpen.value = false; if (!cartOpen.value) checkoutStep.value = "cart"; }}>
              <span class="cart-btn__label">{t("cart.mycart", locale.value)}</span>
              {cartOpen.value && !isCheckout.value ? (
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
                    // Live-filter only when the catalog GRID is the current view.
                    // The catalog stays mounted on a product page (PDP mode), so a
                    // "is .home-catalog present" check is true there too and would
                    // move the sidebar while the grid isn't even shown. Gate on the
                    // route instead (grid == home "/"); on a PDP, typing only fills
                    // the field — nothing moves until Enter (see below).
                    if (loc.url.pathname.replace(/\/+$/, "") === "") {
                      window.dispatchEvent(new CustomEvent("apparel-search", { detail: el.value }));
                    }
                  }}
                  onKeyDown$={(e, el) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      // Close the menu takeover so the filtered products are visible
                      // (searching from inside the open menu otherwise did nothing).
                      menuOpen.value = false;
                      if (loc.url.pathname.replace(/\/+$/, "") === "") {
                        // On the grid: commit the live-filtered results in place.
                        window.dispatchEvent(new CustomEvent("apparel-search", { detail: el.value }));
                        window.dispatchEvent(new CustomEvent("apparel-search-commit"));
                      } else {
                        // On a product page: apply the search to the catalog (kept
                        // mounted by the shared shell) FIRST, then swap to the grid
                        // so it opens straight on the results. A ?q= navigation
                        // wouldn't work here — the mount-time query handler doesn't
                        // re-run when the already-mounted catalog switches out of
                        // PDP mode, which left the first Enter showing the previous
                        // category and needing a second Enter.
                        window.dispatchEvent(new CustomEvent("apparel-search", { detail: el.value }));
                        window.dispatchEvent(new CustomEvent("apparel-search-commit"));
                        nav("/");
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
              <Link href="/" class="nav-drawer__title" onClick$={() => { menuOpen.value = false; requestAnimationFrame(() => window.scrollTo(0, 0)); }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                {t("nav.home", locale.value)}
              </Link>
              {/* Language toggle in the middle of the bar — an inline icon + FR/EN
                  styled like the logout (no button chrome), not a pill button. */}
              <button type="button" class="nav-drawer__header-logout nav-drawer__header-locale" onClick$={toggleLocale} aria-label="Toggle language">
                <span>{locale.value === "en" ? "FR" : "EN"}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
              </button>
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
              {loginType.value === "tech" && (
                <Link href="/" class={`nav-drawer__link ${(!loc.url.pathname.startsWith("/privacy") && !loc.url.pathname.startsWith("/checkout")) ? "active" : ""}`} onClick$={() => { menuOpen.value = false; window.dispatchEvent(new CustomEvent("select-category", { detail: "Work Wear" })); }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4M16 2v4M4 6h16v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6z"/><path d="M4 6l-2 4v2h4V8"/><path d="M20 6l2 4v2h-4V8"/></svg>
                  {t("cat.Work Wear", locale.value)}
                </Link>
              )}
              {loginType.value === "safety" && (
                <Link href="/" class={`nav-drawer__link ${(!loc.url.pathname.startsWith("/privacy") && !loc.url.pathname.startsWith("/checkout")) ? "active" : ""}`} onClick$={() => { menuOpen.value = false; window.dispatchEvent(new CustomEvent("select-category", { detail: "Flame Resistant" })); }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z"/><path d="M9 12l2 2 4-4"/></svg>
                  {t("cat.Flame Resistant", locale.value)}
                </Link>
              )}
              {loginType.value !== "tech" && (() => {
                // Mirror the catalog tabs (CLOTHING_CATEGORIES in
                // product-catalog.tsx, minus "All") so the menu's categories and
                // labels always match the tab bar. "Footwear" is the tab that
                // groups the Safety Boots / Safety Shoes data categories.
                const NAV_CATS: { key: TranslationKey; cat: string; icon: string }[] = [
                  { key: "cat.Jackets", cat: "Jackets", icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2l5 6v12a2 2 0 01-2 2h-3V12h-6v10H6a2 2 0 01-2-2V8l5-6"/><path d="M9 2a3 3 0 006 0"/><line x1="12" y1="12" x2="12" y2="22"/></svg>' },
                  { key: "cat.Sweaters", cat: "Sweaters", icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 3 4 6 2 9.5 5 12v9h14v-9l3-2.5L20 6l-4.5-3-1.3 1.7a3.4 3.4 0 0 1-4.4 0z"/><path d="M9 4.2c.9 1.2 4.1 1.2 5 0"/></svg>' },
                  { key: "cat.Shirts",  cat: "Shirts",  icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/></svg>' },
                  { key: "cat.Polos",   cat: "Polos",   icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.38 3.46 16 2l-4 4-4-4-4.38 1.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/><path d="M12 6v5"/></svg>' },
                  { key: "cat.CapsBeanies", cat: "Hats", icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a7 7 0 00-7 7c0 3 2 5 3 6h8c1-1 3-3 3-6a7 7 0 00-7-7z"/><path d="M5 15h14"/><path d="M6 18h12"/></svg>' },
                  { key: "cat.SWAG",    cat: "SWAG",    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/></svg>' },
                  ...(loginType.value !== "safety" ? [{ key: "nav.officewelcomekit" as TranslationKey, cat: "New Hire Kit", icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>' }] : []),
                ];
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
                                    await nav(`/#${c.cat.toLowerCase().replace(/\s+/g, "-")}`);
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
                              <a key={p.sku} href={`/${p.sku}/`} class="nav-drawer__cat-item" onClick$={() => (menuOpen.value = false)}>
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
          <div class="site-footer__brand brand-cluster">
            <img class="brand-cluster__logo" src="/tamarack-logo-white.png" alt="Tamarack Apparel" width="1451" height="250" />
            <span class="brand-cluster__apparel">{t("brand.apparel", locale.value)}</span>
          </div>
          <div class="site-footer__col">
          {loginType.value === "safety" && (
          <nav class="site-footer__links">
            <Link href="/#fr" onClick$={(e) => { if (loc.url.pathname === "/") { e.preventDefault(); } window.dispatchEvent(new CustomEvent("select-category", { detail: "Flame Resistant" })); const headerH = stickyTop(); const catalog = document.querySelector('.home-catalog'); if (catalog) { const top = catalog.getBoundingClientRect().top + window.scrollY - headerH + 2; window.scrollTo({ top, behavior: 'instant' }); } }}>{t("cat.Flame Resistant", locale.value)}</Link>
            <Link href="/#shirts" onClick$={(e) => { if (loc.url.pathname === "/") { e.preventDefault(); } window.dispatchEvent(new CustomEvent("select-category", { detail: "Shirts" })); const headerH = stickyTop(); const catalog = document.querySelector('.home-catalog'); if (catalog) { const top = catalog.getBoundingClientRect().top + window.scrollY - headerH + 2; window.scrollTo({ top, behavior: 'instant' }); } }}>{t("cat.Shirts", locale.value)}</Link>
            <Link href="/#hats" onClick$={(e) => { if (loc.url.pathname === "/") { e.preventDefault(); } window.dispatchEvent(new CustomEvent("select-category", { detail: "Hats" })); const headerH = stickyTop(); const catalog = document.querySelector('.home-catalog'); if (catalog) { const top = catalog.getBoundingClientRect().top + window.scrollY - headerH + 2; window.scrollTo({ top, behavior: 'instant' }); } }}>{t("cat.Hats", locale.value)}</Link>
            <Link class="site-footer__links-privacy" href="/privacy/">{t("footer.privacypolicy", locale.value)}</Link>
          </nav>
          )}
          {(loginType.value !== "tech" && loginType.value !== "safety") && (
          <nav class="site-footer__links">
            <Link href="/#shirts" onClick$={(e) => { if (loc.url.pathname === "/") { e.preventDefault(); } window.dispatchEvent(new CustomEvent("select-category", { detail: "Shirts" })); const headerH = stickyTop(); const catalog = document.querySelector('.home-catalog'); if (catalog) { const top = catalog.getBoundingClientRect().top + window.scrollY - headerH + 2; window.scrollTo({ top, behavior: 'instant' }); } }}>{t("cat.Shirts", locale.value)}</Link>
            <Link href="/#jackets" onClick$={(e) => { if (loc.url.pathname === "/") { e.preventDefault(); } window.dispatchEvent(new CustomEvent("select-category", { detail: "Jackets" })); const headerH = stickyTop(); const catalog = document.querySelector('.home-catalog'); if (catalog) { const top = catalog.getBoundingClientRect().top + window.scrollY - headerH + 2; window.scrollTo({ top, behavior: 'instant' }); } }}>{t("cat.Jackets", locale.value)}</Link>
            <Link href="/#hats" onClick$={(e) => { if (loc.url.pathname === "/") { e.preventDefault(); } window.dispatchEvent(new CustomEvent("select-category", { detail: "Hats" })); const headerH = stickyTop(); const catalog = document.querySelector('.home-catalog'); if (catalog) { const top = catalog.getBoundingClientRect().top + window.scrollY - headerH + 2; window.scrollTo({ top, behavior: 'instant' }); } }}>{t("cat.Hats", locale.value)}</Link>
            <Link href="/#swag" onClick$={(e) => { if (loc.url.pathname === "/") { e.preventDefault(); } window.dispatchEvent(new CustomEvent("select-category", { detail: "SWAG" })); const headerH = stickyTop(); const catalog = document.querySelector('.home-catalog'); if (catalog) { const top = catalog.getBoundingClientRect().top + window.scrollY - headerH + 2; window.scrollTo({ top, behavior: 'instant' }); } }}>{t("cat.SWAG", locale.value)}</Link>
            <Link href="/#new-hire-kit" onClick$={(e) => { if (loc.url.pathname === "/") { e.preventDefault(); } window.dispatchEvent(new CustomEvent("select-category", { detail: "New Hire Kit" })); const headerH = stickyTop(); const catalog = document.querySelector('.home-catalog'); if (catalog) { const top = catalog.getBoundingClientRect().top + window.scrollY - headerH + 2; window.scrollTo({ top, behavior: 'instant' }); } }}>{t("cat.New Hire Kit", locale.value)}</Link>
            <Link class="site-footer__links-privacy" href="/privacy/">{t("footer.privacypolicy", locale.value)}</Link>
          </nav>
          )}
          <div class="site-footer__contact-block">
            <div class="site-footer__contact site-footer__contact--inline">
              <svg class="site-footer__contact-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
              <a href="mailto:info@tamarackapparel.ca">info@tamarackapparel.ca</a>
            </div>
            <div class="site-footer__legal-row">
              <Link class="site-footer__privacy-link" href="/privacy/">{t("footer.privacypolicy", locale.value)}</Link>
              <button type="button" class="site-footer__locale locale-btn locale-btn--footer" onClick$={toggleLocale} aria-label="Toggle language">
                <svg class="locale-btn__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
                <span>{locale.value === "en" ? "Français" : "English"}</span>
              </button>
            </div>
          </div>
          </div>
        </div>
      </footer>

      {/* Cart Drawer */}
      {cartOpen.value && !isCheckout.value && (
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
                <Link href="/" class="cart-drawer__back-link" onClick$={() => (cartOpen.value = false)}>{t("cart.backtoapparel", locale.value)}</Link>
              </div>
            ) : (
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
                            <Link href={item.sku ? `/${item.sku}/` : "/"} class="cart-table__name-link">{stripColorSuffix(item.name)}</Link>
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
                    onClick$={() => { nav("/checkout/"); }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
                    {t("cart.checkout", locale.value)}
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
            <div class="order-confirm__badge" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
            </div>
            <h2 class="order-confirm__title">{t("order.title", locale.value)}</h2>
            {orderNum.value && (
              <p class="order-confirm__order">{locale.value === "fr" ? "Commande" : "Order"} #{orderNum.value}</p>
            )}
            <p class="order-confirm__text">{t("order.text", locale.value)}</p>
            {/* Plain <a> (full page load), not <Link>: this modal lives in the
                persistent layout, so an SPA nav would leave orderSubmitted=true
                and the success modal stuck open. A real navigation re-mounts the
                app and clears the flag. */}
            <a href="/" class="btn btn--primary order-confirm__btn">{t("order.continue", locale.value)}</a>
          </div>
        </Modal.Panel>
      </Modal.Root>
      </>}
    </>
  );
});
