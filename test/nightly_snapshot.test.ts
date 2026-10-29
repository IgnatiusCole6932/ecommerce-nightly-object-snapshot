import assert from "node:assert/strict";
import test from "node:test";
import { buildNightlySnapshot, nightlySnapshotRequestSchema, snapshotKeyFor } from "../src/nightly_snapshot";

test("a nightly snapshot keeps every e-commerce event family and reports their counts", () => {
  const input = nightlySnapshotRequestSchema.parse({
    snapshotDate: "2026-09-15",
    checkouts: [{ checkoutId: "co-1", orderId: "o-1", totalCents: 4200 }],
    fulfillments: [{ orderId: "o-1", status: "shipped", trackingNumber: "trk-1" }],
    receipts: [{ receiptId: "r-1", orderId: "o-1", issuedAt: "2026-09-15T01:00:00.000Z" }],
    customerOrderUpdates: [{ customerId: "c-1", orderId: "o-1", state: "fulfilled" }]
  });

  const snapshot = buildNightlySnapshot(input);
  assert.deepEqual(snapshot.counts, {
    checkouts: 1,
    fulfillments: 1,
    receipts: 1,
    customerOrderUpdates: 1
  });
  assert.equal(snapshotKeyFor(input.snapshotDate), "ecommerce/nightly/2026-09-15/snapshot.json");
});
