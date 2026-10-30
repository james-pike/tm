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
  approval?: boolean; // "as needed/approved" item — flagged for manual approval
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
  /** When true, the email reads as a "received, pending approval" acknowledgment
   *  rather than a placed-order confirmation (used while an order waits for the
   *  authorizer to approve it). */
  pendingApproval?: boolean;
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

export function buildOrderEmailHtml(o: OrderEmailData, opts: { intro?: string } = {}): string {
  const itemRows = o.items.map((i) =>
    `<tr>
      <td style="padding:6px 12px;border-bottom:1px solid #eee">${esc(i.name)}${i.code ? ` <span style="color:#000;font-weight:600;font-size:14px">${esc(i.code)}</span>` : i.sku ? ` <span style="color:#000;font-weight:600;font-size:14px">(${esc(i.sku)})</span>` : ""}${i.approval ? ` <span style="display:inline-block;margin-left:6px;padding:1px 6px;border-radius:3px;background:#fdecc8;color:#8a5a00;font-size:11px;font-weight:700;white-space:nowrap">NEEDS APPROVAL</span>` : ""}</td>
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
      <!-- Banner adopts cm's Outlook-safe format: a bgcolor <table> (Outlook
           ignores CSS background on a <div>) with a prominent Order # line. -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#12463a" style="background-color:#12463a;border-radius:8px 8px 0 0;-webkit-print-color-adjust:exact;print-color-adjust:exact">
        <tr>
          <td bgcolor="#12463a" style="background-color:#12463a;padding:20px 24px;-webkit-print-color-adjust:exact;print-color-adjust:exact">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="vertical-align:middle">
                ${o.logoUrl
                  // Hosted PNG with fixed size. If Outlook blocks images, the
                  // styled alt text keeps the header branded (white on green).
                  ? `<img src="${esc(o.logoUrl)}" alt="Tamarack Apparel" width="203" height="35" style="display:block;width:203px;height:35px;border:0;outline:none;text-decoration:none;color:#ffffff;font-family:sans-serif;font-size:20px;font-weight:700;line-height:35px">`
                  : `<h1 style="color:#ffffff;margin:0;font-size:20px">Tamarack Apparel</h1>`}
              </td>
            </tr>
            ${o.orderNumber ? `<tr>
              <td style="padding:6px 0 0">
                <p style="color:#ffffff;margin:0;font-size:19px;font-weight:600;letter-spacing:0.04em">Order #${esc(o.orderNumber)}</p>
              </td>
            </tr>` : ""}
            </table>
          </td>
        </tr>
      </table>
      <div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
        <p style="margin:0 0 16px;font-size:16px">${opts.intro ?? (o.pendingApproval
          ? "We've received your order — it's now pending approval. You'll be contacted once it's approved."
          : "Thank you for your order!")}</p>
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
export async function sendConfirmationEmail(
  cfg: SendEmailConfig,
  o: OrderEmailData,
  opts: { intro?: string } = {},
): Promise<void> {
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
      html: buildOrderEmailHtml(o, opts),
    });
  } catch (err) {
    console.error("Failed to send order email:", err);
  }
}

/** The authorizer's "approval needed" email: the order, then the approval box. */
export function buildApprovalRequestHtml(o: OrderEmailData, approveUrl: string): string {
  // Sits BELOW the order. Built from bgcolor tables (not div backgrounds) so
  // the yellow box and the green button both show in Outlook.
  const banner = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:12px auto 0;font-family:sans-serif">
    <tr><td bgcolor="#fdecc8" style="background-color:#fdecc8;padding:14px 18px;border-radius:8px;color:#8a5a00;font-size:14px">
      <strong>Approval needed.</strong> This order is on hold until you approve it.
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px"><tr>
        <td bgcolor="#12463a" style="background-color:#12463a;border-radius:6px">
          <a href="${esc(approveUrl)}" style="display:inline-block;padding:9px 16px;border:1px solid #12463a;border-radius:6px;color:#ffffff;text-decoration:none;font-weight:700;font-family:sans-serif;font-size:14px">Review &amp; approve</a>
        </td>
      </tr></table>
    </td></tr>
  </table>`;
  return buildOrderEmailHtml(o, {
    intro: "The following order has been submitted for your review.",
  }) + banner;
}

/**
 * Notify the order authorizer that a new order needs approval. Sends the order
 * summary with a banner + a link to log in and approve/deny. Never throws — a
 * failed notice must not fail the order.
 */
export async function sendApprovalRequestEmail(
  cfg: { apiKey: string; from: string; to: string[] },
  o: OrderEmailData,
  approveUrl: string,
): Promise<string | null> {
  if (!cfg.to.length) return null;
  const employeeEmail = (o.employee.email || "").trim();
  try {
    const resend = new Resend(cfg.apiKey);
    const { data, error } = await resend.emails.send({
      from: cfg.from,
      to: cfg.to,
      // The employee's address rides on Resend as the reply-to (we don't store
      // it). On approval we read it back from Resend to send their confirmation.
      ...(employeeEmail ? { replyTo: employeeEmail } : {}),
      subject: `Approval needed${o.orderNumber ? ` — Order ${o.orderNumber}` : ""} — ${o.employee.name}`,
      html: buildApprovalRequestHtml(o, approveUrl),
    });
    if (error) console.error("Approval-request email rejected by Resend:", error);
    return data?.id ?? null;
  } catch (err) {
    console.error("Failed to send approval-request email:", err);
    return null;
  }
}

/** Opening line of the employee's email, sent once the authorizer approves. */
export const APPROVED_INTRO = "Thank you for your order! It has been approved and sent for processing.";

/**
 * Read the employee's contact details back from the authorizer's approval
 * email on Resend: the email from its reply-to, the phone from its body.
 * Resend keeps emails for 30 days, so an older approval returns nothing.
 */
export async function fetchApprovalContact(
  apiKey: string,
  emailId: string,
): Promise<{ email?: string; phone?: string }> {
  try {
    const { data, error } = await new Resend(apiKey).emails.get(emailId);
    if (error || !data) {
      console.warn("Could not fetch approval email from Resend:", error);
      return {};
    }
    const email = (data.reply_to || [])[0]?.trim() || undefined;
    const m = /<strong>Phone:<\/strong>\s*([^<]+)</.exec(data.html || "");
    const phone = m ? unesc(m[1].trim()) : undefined;
    return { email, phone };
  } catch (err) {
    console.error("Failed to fetch approval email from Resend:", err);
    return {};
  }
}

function unesc(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0*39;/g, "'").replace(/&amp;/g, "&");
}
