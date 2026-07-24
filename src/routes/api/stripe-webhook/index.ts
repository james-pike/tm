/**
 * Stripe webhook — the source of truth for card payments.
 *
 * When a Checkout Session completes, Stripe POSTs here. We verify the signature,
 * then finalize the order: deduct the gift-card portion (now that the card
 * actually paid), mark the order 'paid', and send the confirmation email. The
 * customer's email/phone travel in the session metadata (not our DB); the line
 * items are loaded from the order row by id.
 *
 * Configure this URL in the Stripe dashboard (Developers → Webhooks) for the
 * `checkout.session.completed` event, and set STRIPE_WEBHOOK_SECRET.
 */
import type { RequestHandler } from "@builder.io/qwik-city";
import { createClient } from "@libsql/client";
import { verifyAndParseWebhook } from "../../../lib/stripe";
import { sendConfirmationEmail } from "../../../lib/orders";
import type { OrderEmailData, OrderItem, PaymentMethod } from "../../../lib/orders";
import { deductGiftCard } from "../../../lib/giftcards";

export const onPost: RequestHandler = async ({ request, env, json }) => {
  const secret = env.get("STRIPE_WEBHOOK_SECRET");
  const payload = await request.text();
  const sig = request.headers.get("stripe-signature");

  const event = await verifyAndParseWebhook(payload, sig, secret || "");
  if (!event) {
    json(400, { error: "Invalid signature" });
    return;
  }

  // Only act on completed checkout sessions.
  if (event.type !== "checkout.session.completed") {
    json(200, { received: true, ignored: event.type });
    return;
  }

  const session = event.data?.object ?? {};
  const m: Record<string, string> = session.metadata || {};
  const orderId = m.order_id;
  if (!orderId) {
    json(200, { received: true, note: "no order_id in metadata" });
    return;
  }

  const tursoUrl = env.get("TURSO_URL") || env.get("VITE_TURSO_URL");
  const tursoToken = env.get("TURSO_AUTH_TOKEN") || env.get("VITE_TURSO_AUTH_TOKEN");
  if (!tursoUrl || !tursoToken) {
    // Can't finalize without the DB — 500 so Stripe retries.
    json(500, { error: "DB not configured" });
    return;
  }
  const db = createClient({ url: tursoUrl, authToken: tursoToken });

  // Idempotency: if this order is already paid, ack and stop (Stripe retries).
  const existing = await db.execute({
    sql: "SELECT status, items FROM orders WHERE id = ?",
    args: [orderId as any],
  });
  const row = existing.rows[0] as any;
  if (!row) {
    json(200, { received: true, note: "order not found" });
    return;
  }
  if (String(row.status) === "paid") {
    json(200, { received: true, note: "already paid" });
    return;
  }

  // Deduct the gift-card portion now that the card has paid.
  const giftAmount = Number(m.gift_amount || "0") || 0;
  const giftCode = m.gift_code || "";
  if (giftAmount > 0 && giftCode) {
    const ok = await deductGiftCard(db, giftCode, giftAmount);
    if (ok) {
      await db.execute({
        sql: "INSERT INTO gift_card_transactions (code, amount, order_ref) VALUES (?, ?, ?)",
        args: [giftCode, giftAmount, m.order_number || ""],
      });
    } else {
      // Card already charged but the gift balance is short — flag for review.
      console.error(`Gift card ${giftCode} could not be deducted for order ${m.order_number} after card payment.`);
      await db.execute({ sql: "UPDATE orders SET status = 'review_gift' WHERE id = ?", args: [orderId as any] });
    }
  }

  await db.execute({
    sql: "UPDATE orders SET status = 'paid', paid_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
    args: [orderId as any],
  });

  // Send the confirmation email (items from DB, everything else from metadata).
  const apiKey = env.get("RESEND_API_KEY") || env.get("VITE_RESEND_API_KEY");
  if (apiKey) {
    let items: OrderItem[] = [];
    try { items = JSON.parse(String(row.items || "[]")); } catch { items = []; }
    const fromAddress = env.get("RESEND_FROM") || env.get("VITE_RESEND_FROM") || "Tamarack <onboarding@resend.dev>";
    const staffAddresses = (env.get("ORDER_NOTIFY_TO") || env.get("VITE_ORDER_NOTIFY_TO") || "cs@safetyhouse.ca")
      .split(",").map((a) => a.trim()).filter(Boolean);
    const emailData: OrderEmailData = {
      orderNumber: m.order_number || "",
      date: m.date || "",
      employee: {
        name: m.employee_name || "",
        email: m.customer_email || "",
        phone: m.customer_phone || "",
        department: m.department || "",
        provinceName: m.province_name || "",
        provinceCode: m.province_code || "",
        po: m.po || "",
      },
      items,
      subtotal: Number(m.subtotal || "0") || 0,
      taxPct: Number(m.tax_pct || "0") || 0,
      tax: Number(m.tax || "0") || 0,
      total: Number(m.total || "0") || 0,
      payment: {
        method: (m.payment_method as PaymentMethod) || "card",
        giftCardCode: giftCode || undefined,
        giftAmount,
        cardAmount: Number(m.card_amount || "0") || 0,
      },
    };
    await sendConfirmationEmail({ apiKey, from: fromAddress, staffAddresses }, emailData);
  }

  json(200, { received: true });
};
