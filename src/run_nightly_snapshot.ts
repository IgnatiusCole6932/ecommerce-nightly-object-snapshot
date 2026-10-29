import { nightlySnapshotRequestSchema, uploadNightlySnapshot } from "./nightly_snapshot";

const snapshotDate = process.argv[2] ?? new Date().toISOString().slice(0, 10);
const bucket = process.env.SNAPSHOT_BUCKET ?? "ecommerce-nightly-snapshots";
const input = nightlySnapshotRequestSchema.parse({
  snapshotDate,
  checkouts: [],
  fulfillments: [],
  receipts: [],
  customerOrderUpdates: []
});

const result = await uploadNightlySnapshot(input, bucket);
console.log(JSON.stringify(result));
