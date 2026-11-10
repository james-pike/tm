import { component$, Slot, useContext } from "@builder.io/qwik";
import { useLocation, useNavigate, routeLoader$, routeAction$, zod$, z } from "@builder.io/qwik-city";
import { createClient } from "@libsql/client";
import { ProductCatalog } from "../../components/product-catalog/product-catalog";
import { Approvals } from "../../components/approvals/approvals";
import { getLoginType, LoginTypeContext, PROVINCE_TAX, PROVINCE_NAMES } from "../layout";
import { APPROVED_INTRO, fetchApprovalContact, sendConfirmationEmail } from "../../lib/orders";
import type { OrderEmailData, OrderItem } from "../../lib/orders";
import { colorName } from "../apparel/products";

// ONE shared shell for the whole shop: the catalog at "/" and each product at
// "/<sku>/". The sidebar + header live inside ProductCatalog and stay mounted as
// a single instance across the catalog ↔ product navigation, so there is no
// layout shift and no styling divergence between the two views. On a product
// route the routed <Slot/> (the product detail) renders in ProductCatalog's main
// column instead of the grid.
//
// The order authorizer (a separate login — see useLogin) sees the approvals
// area here instead of the storefront.
//
// No server auth guard here: unauthenticated visitors are blocked client-side by
// the login overlay (root layout locks scroll + covers the screen until login).

const dbFromEnv = (env: { get(k: string): string | undefined }) =>
  createClient({
    url: env.get("TURSO_URL") || env.get("VITE_TURSO_URL") || "",
    authToken: env.get("TURSO_AUTH_TOKEN") || env.get("VITE_TURSO_AUTH_TOKEN") || undefined,
  });

export interface PendingOrder {
  id: number;
  orderNumber: string;
  empName: string;
  empDept: string;
  po: string;
  total: number;
  items: { name: string; sku?: string; color?: string; size?: string; quantity: number; price: number }[];
  createdAt: string;
}

// Orders awaiting the authorizer's approval. Only queried for the authorizer
// login; everyone else gets an empty list (and never sees order data).
export const usePendingApprovals = routeLoader$<PendingOrder[]>(async ({ cookie, env }) => {
  if (getLoginType(cookie) !== "authorizer") return [];
  try {
    const db = dbFromEnv(env);
    // These are unapproved requests — they have no TM number yet (it's assigned
    // on approval as order_no), so they show as "New request".
    const r = await db.execute(
      `SELECT o.id, o.emp_name, o.emp_dept, o.po_number, o.items, o.total, o.created_at, o.order_no
       FROM orders o
       WHERE o.vendor='tamarack' AND o.status='awaiting_authorization'
       ORDER BY o.created_at DESC`,
    );
    return r.rows.map((row: any) => {
      const items = (JSON.parse(row.items || "[]") as any[]).map((it) => ({
        ...it,
        // Resolve hex colours to their name (e.g. "#1a1a18" -> "Black").
        color: typeof it.color === "string" && it.color.startsWith("#") ? colorName(it.color, "en") : it.color,
      }));
      return {
        id: Number(row.id),
        orderNumber: row.order_no ? `TM-${Number(row.order_no)}` : "New request",
        empName: String(row.emp_name || ""),
        empDept: String(row.emp_dept || ""),
        po: String(row.po_number || ""),
        total: Number(row.total) || 0,
        items,
        createdAt: String(row.created_at || ""),
      };
    });
  } catch (e) {
    console.error("Failed to load pending approvals:", e);
    return [];
  }
});

export interface DecisionRow {
  id: number;
  orderNumber: string; // TM-<n> for approved; "" for denied (never numbered)
  empName: string;
  empDept: string;
  total: number;
  decision: "approved" | "denied";
  at: string; // updated_at (when the decision was made)
  items: { name: string; sku?: string; color?: string; size?: string; quantity: number; price: number }[];
}

// Recent approve/deny decisions, so the authorizer can see what they've actioned.
// Approved = it got a persistent order_no; denied = status 'rejected'. Auto-
// revalidates after each approve/deny, so a just-actioned order appears here.
export const useDecisionHistory = routeLoader$<DecisionRow[]>(async ({ cookie, env }) => {
  if (getLoginType(cookie) !== "authorizer") return [];
  try {
    const db = dbFromEnv(env);
    const r = await db.execute(
      `SELECT id, emp_name, emp_dept, total, status, order_no, updated_at, items
       FROM orders
       WHERE vendor='tamarack' AND (status='rejected' OR order_no IS NOT NULL)
       ORDER BY updated_at DESC
       LIMIT 40`,
    );
    return r.rows.map((row: any) => ({
      id: Number(row.id),
      orderNumber: row.order_no ? `TM-${Number(row.order_no)}` : "",
      empName: String(row.emp_name || ""),
      empDept: String(row.emp_dept || ""),
      total: Number(row.total) || 0,
      decision: (row.status === "rejected" ? "denied" : "approved") as "approved" | "denied",
      at: String(row.updated_at || ""),
      items: (JSON.parse(row.items || "[]") as any[]).map((it) => ({
        ...it,
        color: typeof it.color === "string" && it.color.startsWith("#") ? colorName(it.color, "en") : it.color,
      })),
    }));
  } catch (e) {
    console.error("Failed to load decision history:", e);
    return [];
  }
});

type Env = { get(k: string): string | undefined };

// Email the employee (To) + the ORDER_NOTIFY_TO list (BCC) that their order was
// approved. Their address isn't stored here: it's read back from the
// authorizer's approval email on Resend (its reply-to). If that's gone (Resend
// keeps 30 days) the email goes To the notify list instead. Never throws.
async function sendApprovedOrderEmail(env: Env, origin: string, id: number, orderNo: number) {
  try {
    const apiKey = env.get("RESEND_API_KEY") || env.get("VITE_RESEND_API_KEY");
    if (!apiKey) return;
    const db = dbFromEnv(env);
    const r = await db.execute({ sql: "SELECT * FROM orders WHERE id = ? AND vendor = 'tamarack'", args: [id] });
    const row = r.rows[0] as any;
    if (!row) return;

    // Test orders never email anyone (same rule as at checkout).
    const testPo = (env.get("TEST_NO_EMAIL_PO") || env.get("VITE_TEST_NO_EMAIL_PO") || "TEST-NOEMAIL").trim().toUpperCase();
    if (testPo && String(row.po_number || "").trim().toUpperCase() === testPo) return;

    const contact = row.approval_email_id ? await fetchApprovalContact(apiKey, String(row.approval_email_id)) : {};
    const items = JSON.parse(row.items || "[]") as OrderItem[];
    const province = String(row.province || "");
    const taxRate = PROVINCE_TAX[province] ?? 0;
    const subtotal = items.reduce((sum, i) => sum + (Number(i.price) || 0) * i.quantity, 0);
    const tax = subtotal * taxRate;

    let base = (env.get("SITE_URL") || origin).trim();
    if (base && !/^https?:\/\//i.test(base)) base = "https://" + base;
    let siteOrigin = origin;
    try { siteOrigin = new URL(base).origin; } catch { siteOrigin = origin; }

    // Order date as placed (stored in UTC), in Toronto time.
    const placed = new Date(String(row.created_at || "").replace(" ", "T") + "Z");
    const date = isNaN(placed.getTime())
      ? new Date().toLocaleDateString("en-CA")
      : placed.toLocaleDateString("en-CA", { timeZone: "America/Toronto" });

    const o: OrderEmailData = {
      orderNumber: `TM-${orderNo}`,
      date,
      logoUrl: `${siteOrigin}/email-logo-white.png`,
      employee: {
        name: String(row.emp_name || ""),
        email: contact.email,
        phone: contact.phone,
        department: String(row.emp_dept || ""),
        provinceName: PROVINCE_NAMES[province] || province,
        provinceCode: province,
        address1: String(row.ship_address || ""),
        city: String(row.ship_city || ""),
        postal: String(row.ship_postal || ""),
        po: String(row.po_number || ""),
      },
      items,
      subtotal,
      taxPct: +(taxRate * 100).toFixed(3),
      tax,
      total: Number(row.total) || +(subtotal + tax).toFixed(2),
      payment: { method: "po", giftAmount: 0, cardAmount: 0 },
    };
    const from = env.get("RESEND_FROM") || env.get("VITE_RESEND_FROM") || "Tamarack <onboarding@resend.dev>";
    const staffAddresses = (env.get("ORDER_NOTIFY_TO") || env.get("VITE_ORDER_NOTIFY_TO") || "info@tamarackapparel.ca")
      .split(",").map((a) => a.trim()).filter(Boolean);
    await sendConfirmationEmail({ apiKey, from, staffAddresses }, o, { intro: APPROVED_INTRO });
  } catch (e) {
    console.error("Failed to send approved-order email:", e);
  }
}

// Approve: flip awaiting_authorization -> pending (the order becomes a real,
// fulfillable order). Guarded so it only acts on an order still awaiting.
export const useApproveOrder = routeAction$(
  async ({ id }, { cookie, env, fail, url }) => {
    if (getLoginType(cookie) !== "authorizer") return fail(403, { message: "Not authorized" });
    try {
      const db = dbFromEnv(env);
      // Assign the next persistent TM number ON APPROVAL (gap-free, in approval
      // order). Unapproved orders have no order_no — they aren't numbered yet.
      const nx = await db.execute("SELECT COALESCE(MAX(order_no), 0) + 1 AS n FROM orders WHERE vendor='tamarack'");
      const orderNo = Number((nx.rows[0] as { n?: number } | undefined)?.n) || 1;
      const upd = await db.execute({
        sql: "UPDATE orders SET status='pending', order_no=?, updated_at=datetime('now') WHERE id=? AND vendor='tamarack' AND status='awaiting_authorization'",
        args: [orderNo, id],
      });
      // Only the click that actually approved it sends the email (a double
      // click or a second tab updates 0 rows).
      if (upd.rowsAffected === 1) await sendApprovedOrderEmail(env, url.origin, id, orderNo);
      return { success: true, id };
    } catch (e: any) {
      return fail(500, { message: e?.message || "Could not approve order" });
    }
  },
  zod$({ id: z.coerce.number().int().positive() }),
);

// Deny: flip awaiting_authorization -> rejected.
export const useDenyOrder = routeAction$(
  async ({ id }, { cookie, env, fail }) => {
    if (getLoginType(cookie) !== "authorizer") return fail(403, { message: "Not authorized" });
    try {
      const db = dbFromEnv(env);
      await db.execute({
        sql: "UPDATE orders SET status='rejected', updated_at=datetime('now') WHERE id=? AND vendor='tamarack' AND status='awaiting_authorization'",
        args: [id],
      });
      return { success: true, id };
    } catch (e: any) {
      return fail(500, { message: e?.message || "Could not deny order" });
    }
  },
  zod$({ id: z.coerce.number().int().positive() }),
);

export default component$(() => {
  const loc = useLocation();
  const nav = useNavigate();
  const loginType = useContext(LoginTypeContext);
  const pending = usePendingApprovals();
  const history = useDecisionHistory();
  const approve = useApproveOrder();
  const deny = useDenyOrder();

  if (loginType.value === "authorizer") {
    return (
      <div class="apparel-page dot-pattern">
        <Approvals orders={pending.value} history={history.value} approve={approve} deny={deny} />
      </div>
    );
  }

  return (
    <div
      class="apparel-page dot-pattern"
      onClick$={(e, el) => {
        // On a product page, clicking the outermost page margin (the greige
        // gutter around the whole route) returns to the catalog. Only fires when
        // this wrapper itself is the click target — never its content.
        if (loc.url.pathname.replace(/\/+$/, "") === "") return; // catalog home
        if (e.target === el) nav("/");
      }}
    >
      <ProductCatalog>
        <Slot />
      </ProductCatalog>
    </div>
  );
});
