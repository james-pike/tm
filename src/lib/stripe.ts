/**
 * Minimal Stripe helper built on `fetch` + Web Crypto so it runs on the
 * Cloudflare Pages / Workers runtime with no Node dependencies and no npm
 * package. We only need three things:
 *   1. create a Checkout Session (hosted card page) for an amount,
 *   2. verify an incoming webhook signature,
 *   3. read a Checkout Session back (to confirm on the success page).
 *
 * All amounts are in the smallest currency unit (cents) as Stripe requires.
 */

const STRIPE_API = "https://api.stripe.com/v1";

export interface CheckoutSessionInput {
  secretKey: string;
  /** Amount to charge on the card, in cents (e.g. $12.50 -> 1250). */
  amountCents: number;
  currency?: string; // default "cad"
  /** Line-item label shown on the Stripe page. */
  description: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  /** Small key/values echoed back on the webhook (each value <= 500 chars). */
  metadata?: Record<string, string>;
}

export interface CheckoutSession {
  id: string;
  url: string;
  payment_status?: string;
  status?: string;
  amount_total?: number;
  metadata?: Record<string, string>;
}

/** Flatten a nested object into Stripe's bracketed form-encoding. */
function toForm(obj: Record<string, unknown>, prefix = ""): [string, string][] {
  const out: [string, string][] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") {
      out.push(...toForm(v as Record<string, unknown>, key));
    } else {
      out.push([key, String(v)]);
    }
  }
  return out;
}

export async function createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSession> {
  const currency = (input.currency || "cad").toLowerCase();
  const body: Record<string, unknown> = {
    mode: "payment",
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    // One line item for the card-charged balance (the gift-card portion is
    // applied in our own DB, not on the Stripe page).
    "line_items[0][quantity]": 1,
    "line_items[0][price_data][currency]": currency,
    "line_items[0][price_data][unit_amount]": Math.round(input.amountCents),
    "line_items[0][price_data][product_data][name]": input.description,
  };
  if (input.customerEmail) body["customer_email"] = input.customerEmail;
  if (input.metadata) {
    for (const [k, val] of Object.entries(input.metadata)) {
      body[`metadata[${k}]`] = val;
      // Also on the PaymentIntent so it's visible in the Stripe dashboard.
      body[`payment_intent_data[metadata][${k}]`] = val;
    }
  }

  const params = new URLSearchParams();
  for (const [k, v] of toForm(body)) params.append(k, v);

  const res = await fetch(`${STRIPE_API}/checkout/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  const json = (await res.json()) as any;
  if (!res.ok) {
    throw new Error(`Stripe checkout session failed: ${json?.error?.message || res.status}`);
  }
  return json as CheckoutSession;
}

export async function retrieveCheckoutSession(secretKey: string, sessionId: string): Promise<CheckoutSession> {
  const res = await fetch(`${STRIPE_API}/checkout/sessions/${sessionId}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  const json = (await res.json()) as any;
  if (!res.ok) throw new Error(`Stripe retrieve failed: ${json?.error?.message || res.status}`);
  return json as CheckoutSession;
}

/**
 * Verify a Stripe webhook signature (the `Stripe-Signature` header) against the
 * raw request body, using the endpoint's signing secret (whsec_...). Returns
 * the parsed event on success, or null if the signature is invalid/stale.
 *
 * Implements Stripe's scheme: sign `${timestamp}.${payload}` with HMAC-SHA256.
 */
export async function verifyAndParseWebhook(
  payload: string,
  sigHeader: string | null,
  secret: string,
  toleranceSeconds = 300,
  nowSeconds?: number,
): Promise<any | null> {
  if (!sigHeader || !secret) return null;
  const parts = Object.fromEntries(
    sigHeader.split(",").map((kv) => kv.split("=").map((s) => s.trim()) as [string, string]),
  );
  const t = parts["t"];
  const v1 = parts["v1"];
  if (!t || !v1) return null;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${payload}`));
  const expected = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");

  // Constant-time-ish compare.
  if (expected.length !== v1.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ v1.charCodeAt(i);
  if (diff !== 0) return null;

  // Reject stale timestamps. `nowSeconds` is injectable for testing.
  const now = nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(t)) > toleranceSeconds) return null;

  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}
