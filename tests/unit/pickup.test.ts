import { cooldownRemaining, elapsed, pickupPhase, retryAfterSeconds } from "~/features/pickup/pickup";

const now = Date.parse("2026-10-29T18:00:00Z");
const order = (status: string, arrival = "not_arrived", extra: { notify_count?: number; created_at?: string } = {}) => ({
  status: status as never,
  created_at: extra.created_at ?? "2026-10-29T17:30:00Z",
  pickup_details: { vehicle_plate: "12345", vehicle_color: null, arrival_status: arrival, last_notified_at: null, notify_count: extra.notify_count ?? 0 },
});

describe("pickup phase mirrors the server rules", () => {
  test.each([
    ["pending", "not_arrived", "not_confirmed"],
    ["confirmed", "not_arrived", "can_notify"],
    ["preparing", "not_arrived", "can_notify"],
    ["ready", "arrived", "notified"],
    ["ready", "acknowledged", "acknowledged"],
    ["completed", "handed_over", "handed_over"],
    ["cancelled", "not_arrived", "closed"],
  ])("%s / %s → %s", (status, arrival, expected) => {
    expect(pickupPhase(order(status, arrival), now)).toBe(expected);
  });

  test("orders older than 12 hours expire", () => {
    expect(pickupPhase(order("ready", "not_arrived", { created_at: "2026-10-29T05:00:00Z" }), now)).toBe("expired");
  });

  test("the per-order cap stops further presses", () => {
    expect(pickupPhase(order("ready", "arrived", { notify_count: 5 }), now)).toBe("limit");
  });
});

test("cooldown is 60 seconds from the last notification", () => {
  expect(cooldownRemaining(null, now)).toBe(0);
  expect(cooldownRemaining("2026-10-29T17:59:30Z", now)).toBe(30_000);
  expect(cooldownRemaining("2026-10-29T17:58:00Z", now)).toBe(0);
});

test("retry-after is read from the server error detail", () => {
  expect(retryAfterSeconds({ message: "lahab.notify_cooldown", details: '{"retry_after_seconds": 41.2}' })).toBe(42);
  expect(retryAfterSeconds({ message: "lahab.notify_cooldown", details: "" })).toBeNull();
  expect(retryAfterSeconds({ details: "not json" })).toBeNull();
});

test("elapsed time formats minutes and hours", () => {
  expect(elapsed("2026-10-29T17:55:55Z", now)).toBe("4:05");
  expect(elapsed("2026-10-29T16:57:50Z", now)).toBe("1:02:10");
  expect(elapsed("2026-10-29T18:05:00Z", now)).toBe("0:00");
});
