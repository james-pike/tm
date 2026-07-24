/**
 * Gift-card balance helpers over the Turso (libSQL) `gift_cards` table.
 *
 * Each employee is allotted a gift card (~$250). An order can be paid by:
 *   - gift card alone (if the balance covers the total), or
 *   - gift card + credit card (gift covers up to its balance, card covers the
 *     rest), or
 *   - credit card alone, or
 *   - PO / invoice (no payment captured — the existing flow).
 *
 * Deductions use a guarded UPDATE (`balance >= ?`) so two concurrent orders
 * can't overspend the same card.
 */
import type { Client } from "@libsql/client";

export interface GiftCard {
  code: string;
  balance: number;
  initialBalance: number;
  active: boolean;
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

export async function getGiftCard(db: Client, code: string): Promise<GiftCard | null> {
  const c = normalizeCode(code);
  if (!c) return null;
  const r = await db.execute({
    sql: "SELECT code, balance, initial_balance, active FROM gift_cards WHERE code = ?",
    args: [c],
  });
  const row = r.rows[0] as any;
  if (!row) return null;
  return {
    code: String(row.code),
    balance: Number(row.balance) || 0,
    initialBalance: Number(row.initial_balance) || 0,
    active: Number(row.active) === 1,
  };
}

/**
 * How much this gift card can contribute to an order total: min(balance, total),
 * rounded to cents. Returns 0 for missing/inactive cards.
 */
export function giftContribution(card: GiftCard | null, total: number): number {
  if (!card || !card.active || card.balance <= 0) return 0;
  return Math.min(Math.round(card.balance * 100), Math.round(total * 100)) / 100;
}

/**
 * Atomically deduct `amount` from a card. Returns true only if the card had
 * enough balance (guarded UPDATE). Deduct AFTER a card payment succeeds (in the
 * webhook) so a failed card charge never eats gift-card balance; for a
 * gift-card-only order, deduct at submit time.
 */
export async function deductGiftCard(db: Client, code: string, amount: number): Promise<boolean> {
  const c = normalizeCode(code);
  const cents = Math.round(amount * 100);
  if (!c || cents <= 0) return false;
  const r = await db.execute({
    sql: `UPDATE gift_cards
          SET balance = ROUND(balance - ?, 2), updated_at = datetime('now')
          WHERE code = ? AND active = 1 AND ROUND(balance * 100) >= ?`,
    args: [amount, c, cents],
  });
  return (r.rowsAffected ?? 0) > 0;
}
