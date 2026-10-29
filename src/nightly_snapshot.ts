import { z } from "zod";
import { ensureSnapshotBucket, infrai } from "./infrai_storage";

const checkoutSchema = z.object({
  checkoutId: z.string().min(1),
  orderId: z.string().min(1),
  totalCents: z.number().int().nonnegative()
});

const fulfillmentSchema = z.object({
  orderId: z.string().min(1),
  status: z.enum(["pending", "shipped", "delivered"]),
  trackingNumber: z.string().min(1).optional()
});

const receiptSchema = z.object({
  receiptId: z.string().min(1),
  orderId: z.string().min(1),
  issuedAt: z.string().datetime()
});

const customerOrderUpdateSchema = z.object({
  customerId: z.string().min(1),
  orderId: z.string().min(1),
  state: z.enum(["placed", "paid", "fulfilled", "refunded"])
});

export const nightlySnapshotRequestSchema = z.object({
  snapshotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkouts: z.array(checkoutSchema),
  fulfillments: z.array(fulfillmentSchema),
  receipts: z.array(receiptSchema),
  customerOrderUpdates: z.array(customerOrderUpdateSchema)
});

export type NightlySnapshotRequest = z.infer<typeof nightlySnapshotRequestSchema>;

export function snapshotKeyFor(snapshotDate: string): string {
  return `ecommerce/nightly/${snapshotDate}/snapshot.json`;
}

export function buildNightlySnapshot(input: NightlySnapshotRequest) {
  return {
    snapshotDate: input.snapshotDate,
    checkouts: input.checkouts,
    fulfillments: input.fulfillments,
    receipts: input.receipts,
    customerOrderUpdates: input.customerOrderUpdates,
    counts: {
      checkouts: input.checkouts.length,
      fulfillments: input.fulfillments.length,
      receipts: input.receipts.length,
      customerOrderUpdates: input.customerOrderUpdates.length
    }
  };
}

export async function uploadNightlySnapshot(input: NightlySnapshotRequest, bucket: string) {
  await ensureSnapshotBucket(bucket);
  const key = snapshotKeyFor(input.snapshotDate);
  const document = buildNightlySnapshot(input);
  const signed = await infrai.storage.object.presign(bucket, key, {
    op: "put",
    expires_seconds: 900,
    content_type: "application/json",
    idempotency_key: `nightly-snapshot-${input.snapshotDate}`
  });
  const upload = await fetch(signed.url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(document)
  });
  if (!upload.ok) throw new Error("Snapshot upload was not accepted");
  return { bucket, key, counts: document.counts };
}
