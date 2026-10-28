/**
 * run_readonly_query (DB function) appends its own `LIMIT 200` right after
 * the query text. When the model wrote its own LIMIT / ORDER BY … LIMIT, that
 * produced "… LIMIT 10 LIMIT 200" → syntax error, and the admin chat looped
 * on retries until it timed out (2026-10-28). Wrapping the query as a
 * subquery keeps the model's LIMIT intact and lets the outer LIMIT 200 apply
 * cleanly. Still starts with SELECT, so the DB-side checks are unchanged.
 */
export function wrapReadonlySql(sql: string): string {
  const q = sql.trim().replace(/;+\s*$/, "");
  return `SELECT * FROM (\n${q}\n) AS q_sub`;
}
