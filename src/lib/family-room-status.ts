import { familyRoomIsPartial } from "./orderSummary";

export type FamilyRoomStatus = { kind: "full" | "partial" | "none"; text: string };

/**
 * What to show owner/client about the family room of a studio booking.
 * - slots filled  -> booked (all session hours = "full", fewer = "partial", with the booked hours)
 * - slots empty but `family_room_booked_at` set -> the answer came back "not booked" -> "none"
 * - both empty -> null (nothing decided yet, show nothing)
 */
export function familyRoomStatus(
  b: { family_room_slots?: string | null; family_room_booked_at?: string | null; start_time?: string; end_time?: string },
): FamilyRoomStatus | null {
  const slots = (b.family_room_slots ?? "").trim();
  if (slots) {
    const partial = b.start_time && b.end_time ? familyRoomIsPartial(slots, String(b.start_time), String(b.end_time)) : false;
    return partial
      ? { kind: "partial", text: `נקבע חלקית — רק בשעות: ${slots}` }
      : { kind: "full", text: `נקבע לשעות: ${slots}` };
  }
  if (b.family_room_booked_at) return { kind: "none", text: "לא נקבע" };
  return null;
}
