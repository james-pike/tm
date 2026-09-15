/**
 * Shared order helpers used by BOTH the checkout action (PO / gift-card-only
 * paths) and the Stripe webhook (card paths, which finalize after payment).
 *
 * The confirmation email is built here from a fully-computed order object so it
 * can be sent from either place. Customer email/phone are passed in per-call and
 * are never stored in our DB — for card orders they ride through Stripe
 * metadata to the webhook (a third-party processor), consistent with the
 * privacy policy.
 */
import { Resend } from "resend";
import { colorName as colorLabel } from "../routes/apparel/products";

export type PaymentMethod = "po" | "giftcard" | "giftcard_card" | "card";

export interface OrderItem {
  name: string;
  sku?: string | null;
  code?: string | null;
  color?: string | null; // hex like "#1a1a18" or a plain name
  size?: string | null;
  quantity: number;
  price: number;
}

export interface OrderEmailData {
  orderNumber: string;
  date: string;
  /** Absolute URL to the logo image shown in the email banner (e.g.
   *  https://site/favicon-512.png). Emails can't render the header's inline
   *  SVG, so we point at a hosted raster. Falls back to text if absent. */
  logoUrl?: string;
  employee: {
    name: string;
    email?: string;
    phone?: string;
    department?: string;
    provinceName: string;
    provinceCode: string;
    address1?: string;
    city?: string;
    postal?: string;
    po?: string;
  };
  items: OrderItem[];
  subtotal: number;
  taxPct: number;
  tax: number;
  total: number;
  payment: {
    method: PaymentMethod;
    giftCardCode?: string;
    giftAmount: number;
    cardAmount: number;
  };
}

// Use the app's authoritative colour map (the same one the storefront/cart use)
// so every hex resolves to its label — e.g. "#ab8f66" -> "Dark Khaki" — instead
// of leaking a raw hex code into the email. English labels for the email.
const colorName = (hex: string) => colorLabel(hex, "en");

export function esc(s: string | undefined | null): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

export function buildOrderEmailHtml(o: OrderEmailData): string {
  const itemRows = o.items.map((i) =>
    `<tr>
      <td style="padding:6px 12px;border-bottom:1px solid #eee">${esc(i.name)}${i.code ? ` <span style="color:#999;font-size:12px">${esc(i.code)}</span>` : i.sku ? ` <span style="color:#999;font-size:12px">(${esc(i.sku)})</span>` : ""}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #eee">${i.color ? esc(i.color.startsWith("#") ? colorName(i.color) : i.color) + " / " : ""}${esc(i.size)}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:center">${i.quantity}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right">$${(((Number(i.price) || 0) * i.quantity)).toFixed(2)}</td>
    </tr>`
  ).join("");

  // Payment split rows (gift card / card), shown only when relevant.
  const payRows: string[] = [];
  if (o.payment.giftAmount > 0) {
    payRows.push(`<tr>
      <td colspan="3" style="padding:6px 12px;text-align:right">Gift card${o.payment.giftCardCode ? ` (${esc(o.payment.giftCardCode)})` : ""}</td>
      <td style="padding:6px 12px;text-align:right">-$${o.payment.giftAmount.toFixed(2)}</td>
    </tr>`);
  }
  if (o.payment.cardAmount > 0) {
    payRows.push(`<tr>
      <td colspan="3" style="padding:6px 12px;text-align:right">Paid by card</td>
      <td style="padding:6px 12px;text-align:right">$${o.payment.cardAmount.toFixed(2)}</td>
    </tr>`);
  }

  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#12463a;padding:18px 24px;border-radius:8px 8px 0 0">
        ${o.logoUrl
          ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="vertical-align:middle;padding-right:12px"><img src="${o.logoUrl}" width="46" height="46" alt="Tamarack" style="display:block;width:46px;height:46px;border:0" /></td>
              <td style="vertical-align:middle;font-family:sans-serif">
                <div style="color:#fff;font-size:15px;font-weight:700;letter-spacing:0.02em;line-height:1.15">TAMARACK</div>
                <div style="color:#fff;font-size:15px;font-weight:600;letter-spacing:0.02em;line-height:1.15">APPAREL</div>
                <div style="color:#cfe0ec;font-size:15px;font-weight:500;letter-spacing:0.16em;line-height:1.15">APPAREL</div>
              </td>
            </tr></table>`
          : `<h1 style="color:#fff;margin:0;font-size:20px">Tamarack Apparel</h1>`}
        ${o.orderNumber ? `<p style="color:#cfe0ec;margin:10px 0 0;font-size:13px;letter-spacing:0.04em">Order #${esc(o.orderNumber)}</p>` : ""}
      </div>
      <div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
        <p style="margin:0 0 16px;font-size:16px">Thank you for your order!</p>
        <p style="margin:0 0 4px"><strong>Date:</strong> ${esc(o.date)}</p>
        <p style="margin:0 0 4px"><strong>Name:</strong> ${esc(o.employee.name)}</p>
        ${o.employee.email ? `<p style="margin:0 0 4px"><strong>Email:</strong> <a href="mailto:${esc(o.employee.email)}">${esc(o.employee.email)}</a></p>` : ""}
        ${o.employee.phone ? `<p style="margin:0 0 4px"><strong>Phone:</strong> ${esc(o.employee.phone)}</p>` : ""}
        ${o.employee.address1 ? `<p style="margin:0 0 4px"><strong>Street:</strong> ${esc(o.employee.address1)}</p>` : ""}
        ${o.employee.city ? `<p style="margin:0 0 4px"><strong>City:</strong> ${esc(o.employee.city)}</p>` : ""}
        <p style="margin:0 0 4px"><strong>Province:</strong> ${esc(o.employee.provinceName)}</p>
        ${o.employee.postal ? `<p style="margin:0 0 4px"><strong>Postal Code:</strong> ${esc(o.employee.postal)}</p>` : ""}
        ${o.employee.po ? `<p style="margin:0 0 4px"><strong>PO #:</strong> ${esc(o.employee.po)}</p>` : ""}
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">
        <table style="width:100%;border-collapse:collapse;font-size:16px">
          <thead>
            <tr style="background:#f9fafb">
              <th style="padding:8px 12px;text-align:left">Product</th>
              <th style="padding:8px 12px;text-align:left">Details</th>
              <th style="padding:8px 12px;text-align:center">Qty</th>
              <th style="padding:8px 12px;text-align:right">Total</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
          <tfoot>
            <tr>
              <td colspan="3" style="padding:6px 12px;text-align:right">Subtotal</td>
              <td style="padding:6px 12px;text-align:right">$${o.subtotal.toFixed(2)}</td>
            </tr>
            <tr>
              <td colspan="3" style="padding:6px 12px;text-align:right">Tax (${esc(o.employee.provinceCode)} ${o.taxPct}%)</td>
              <td style="padding:6px 12px;text-align:right">$${o.tax.toFixed(2)}</td>
            </tr>
            <tr>
              <td colspan="3" style="padding:10px 12px;text-align:right;font-weight:700">Total</td>
              <td style="padding:10px 12px;text-align:right;font-weight:700;color:#12463a">$${o.total.toFixed(2)}</td>
            </tr>
            ${payRows.join("")}
          </tfoot>
        </table>
      </div>
    </div>
  `;
}

export interface SendEmailConfig {
  apiKey: string;
  from: string;
  staffAddresses: string[];
}

/**
 * Send the order confirmation. The customer is the visible recipient (To) and
 * staff is BCC'd; if there's no customer email, send To staff so the order
 * still arrives. Never throws — a failed email must not fail a paid order.
 */
export async function sendConfirmationEmail(cfg: SendEmailConfig, o: OrderEmailData): Promise<void> {
  const customerEmail = (o.employee.email || "").trim();
  const toAddresses = customerEmail ? [customerEmail] : cfg.staffAddresses;
  const bccAddresses = customerEmail ? cfg.staffAddresses : [];
  try {
    const resend = new Resend(cfg.apiKey);
    await resend.emails.send({
      from: cfg.from,
      to: toAddresses,
      ...(bccAddresses.length ? { bcc: bccAddresses } : {}),
      subject: `${o.orderNumber ? `#${o.orderNumber} — ` : ""}Tamarack Apparel Order — ${o.employee.name} — ${o.date}`,
      html: buildOrderEmailHtml(o),
    });
  } catch (err) {
    console.error("Failed to send order email:", err);
  }
}
