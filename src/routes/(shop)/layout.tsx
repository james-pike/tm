import { component$, Slot, useContext } from "@builder.io/qwik";
import { useLocation, useNavigate, routeLoader$, routeAction$, zod$, z } from "@builder.io/qwik-city";
import { createClient } from "@libsql/client";
import { ProductCatalog } from "../../components/product-catalog/product-catalog";
import { Approvals } from "../../components/approvals/approvals";
import { getLoginType, LoginTypeContext, useLogout } from "../layout";
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
    // The TM-<n> number is the order's position within all 'tamarack' orders by
    // id (matches cm-admin: 1st tamarack order = TM-1), or the persisted
    // order_no when present — NOT the raw DB row id.
    const r = await db.execute(
      `SELECT o.id, o.emp_name, o.emp_dept, o.po_number, o.items, o.total, o.created_at, o.order_no,
              (SELECT COUNT(*) FROM orders x WHERE x.vendor='tamarack' AND x.id <= o.id) AS seq
       FROM orders o
       WHERE o.vendor='tamarack' AND o.status='awaiting_authorization'
       ORDER BY o.created_at DESC`,
    );
    return r.rows.map((row: any) => {
      const n = row.order_no ?? row.seq ?? row.id;
      const items = (JSON.parse(row.items || "[]") as any[]).map((it) => ({
        ...it,
        // Resolve hex colours to their name (e.g. "#1a1a18" -> "Black").
        color: typeof it.color === "string" && it.color.startsWith("#") ? colorName(it.color, "en") : it.color,
      }));
      return {
        id: Number(row.id),
        orderNumber: `TM-${Number(n)}`,
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

// Approve: flip awaiting_authorization -> pending (the order becomes a real,
// fulfillable order). Guarded so it only acts on an order still awaiting.
export const useApproveOrder = routeAction$(
  async ({ id }, { cookie, env, fail }) => {
    if (getLoginType(cookie) !== "authorizer") return fail(403, { message: "Not authorized" });
    try {
      const db = dbFromEnv(env);
      await db.execute({
        sql: "UPDATE orders SET status='pending', updated_at=datetime('now') WHERE id=? AND vendor='tamarack' AND status='awaiting_authorization'",
        args: [id],
      });
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
  const approve = useApproveOrder();
  const deny = useDenyOrder();
  const logout = useLogout();

  if (loginType.value === "authorizer") {
    return (
      <div class="apparel-page dot-pattern">
        <Approvals orders={pending.value} approve={approve} deny={deny} logout={logout} />
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
