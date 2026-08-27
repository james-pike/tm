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
  employee: {
    name: string;
    email?: string;
    phone?: string;
    department?: string;
    provinceName: string;
    provinceCode: string;
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

const COLOR_NAMES: Record<string, string> = {
  "#00703c": "Green", "#1a1a18": "Black", "#ffffff": "White",
  "#2c3e50": "Navy", "#94a3b8": "Silver", "#4a4a4a": "Charcoal",
  "#8d5f18": "Bronze", "#c0392b": "Red", "#6b3fa0": "Purple",
  "#C97B0C": "Royal", "#b8b8b8": "Grey Heather", "#7dd3fc": "Light Blue",
  "#6b8bb0": "Solace Blue", "#8a5d3b": "Carhartt Brown",
  "#6e6e6e": "Grey", "#ff6600": "Safety Orange",
};
const colorName = (hex: string) => COLOR_NAMES[hex] || hex;

export function esc(s: string | undefined | null): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  po: "Purchase order / invoice",
  giftcard: "Gift card",
  giftcard_card: "Gift card + credit card",
  card: "Credit card",
};

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
      <div style="background:#2D4841;padding:18px 24px;border-radius:8px 8px 0 0">
        <div style="font-family:sans-serif;color:#fff;font-size:20px;font-weight:700;letter-spacing:0.03em;line-height:1.15">TAMARACK <span style="color:#AECBC3;font-weight:400;letter-spacing:0.14em">APPAREL</span></div>
        ${o.orderNumber ? `<p style="color:#AECBC3;margin:10px 0 0;font-size:13px;letter-spacing:0.04em">Order #${esc(o.orderNumber)}</p>` : ""}
      </div>
      <div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
        ${o.orderNumber ? `<p style="margin:0 0 4px"><strong>Order #:</strong> ${esc(o.orderNumber)}</p>` : ""}
        <p style="margin:0 0 4px"><strong>Date:</strong> ${esc(o.date)}</p>
        <p style="margin:0 0 4px"><strong>Employee:</strong> ${esc(o.employee.name)}</p>
        ${o.employee.email ? `<p style="margin:0 0 4px"><strong>Email:</strong> <a href="mailto:${esc(o.employee.email)}">${esc(o.employee.email)}</a></p>` : ""}
        ${o.employee.phone ? `<p style="margin:0 0 4px"><strong>Phone:</strong> ${esc(o.employee.phone)}</p>` : ""}
        ${o.employee.department ? `<p style="margin:0 0 4px"><strong>Location:</strong> ${esc(o.employee.department)}</p>` : ""}
        <p style="margin:0 0 4px"><strong>Province:</strong> ${esc(o.employee.provinceName)}</p>
        ${o.employee.po ? `<p style="margin:0 0 4px"><strong>PO #:</strong> ${esc(o.employee.po)}</p>` : ""}
        <p style="margin:0 0 4px"><strong>Payment:</strong> ${esc(PAYMENT_LABEL[o.payment.method])}</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">
        <table style="width:100%;border-collapse:collapse;font-size:14px">
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
              <td style="padding:10px 12px;text-align:right;font-weight:700;color:#1B6551">$${o.total.toFixed(2)}</td>
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
      subject: `Tamarack Apparel — Order${o.orderNumber ? ` #${o.orderNumber}` : ""} — ${o.employee.name}`,
      html: buildOrderEmailHtml(o),
    });
  } catch (err) {
    console.error("Failed to send order email:", err);
  }
}
