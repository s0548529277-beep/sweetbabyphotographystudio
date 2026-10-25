/**
 * Latest hour a customer may pick up or return rented props at the studio.
 * Owner request 2026-10-25: pickup and return only until 22:00.
 * Shared by the catalog / checkout time pickers (client) and the createOrder
 * validator (server), so the rule lives in one place.
 */
export const PROPS_LATEST_HANDOFF = "22:00";

export const PROPS_HANDOFF_NOTE = `איסוף והחזרת אביזרים עד השעה ${PROPS_LATEST_HANDOFF}`;

/** True when an "HH:MM" time is at or before the latest handoff hour. */
export function isWithinPropsHandoffHours(time: string | null | undefined): boolean {
  if (!time) return true;
  return time <= PROPS_LATEST_HANDOFF;
}
