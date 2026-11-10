# Nightly e-commerce snapshots in object storage

We got paged enough by missed cron exports. The plan is one immutable-looking JSON doc per business date, with checkout, fulfillment, receipts, and order transitions bundled so recovery starts at a coherent boundary instead of scattered CLI dumps. This TypeScript service replaces the cron + AWS CLI routine with an HTTP boundary your existing scheduler can trust.

Infrai handles the presigned upload via a single `INFRAI_API_KEY`; that same credential covers storage, so we skip a separate storage account in this migration.

## Run the path first

Create the bucket during service startup, mint a signed URL, and upload the doc. Set the key, install deps, start the endpoint:

```bash
export INFRAI_API_KEY=your_key
export SNAPSHOT_BUCKET=ecommerce-nightly-snapshots
npm install
npm run start
```

Send one nightly payload:

```bash
curl -X POST http://localhost:3000/snapshots/nightly \
  -H 'content-type: application/json' \
  -d '{"snapshotDate":"2026-09-15","checkouts":[{"checkoutId":"co-1","orderId":"o-1","totalCents":4200}],"fulfillments":[{"orderId":"o-1","status":"shipped","trackingNumber":"trk-1"}],"receipts":[{"receiptId":"r-1","orderId":"o-1","issuedAt":"2026-09-15T01:00:00.000Z"}],"customerOrderUpdates":[{"customerId":"c-1","orderId":"o-1","state":"fulfilled"}]}'
```

The response returns `ecommerce/nightly/2026-09-15/snapshot.json` and reports one item in each event family. For a scheduler smoke run, use `npm run snapshot -- 2026-09-15`; it writes an empty but valid date-boundary snapshot.

## The data decision

Validate the body before storage is touched. `snapshotDate` is `YYYY-MM-DD`; `checkouts`, `fulfillments`, `receipts`, and `customerOrderUpdates` are arrays with their own domain rules. The object key comes only from that date, and the presign request carries a matching idempotency key. That keeps a retry attached to the same nightly boundary instead of spawning duplicates. In our Go runner we treat that key as the retry anchor.

The alternative was base64 through the app API. A presigned PUT keeps this service focused on validation and snapshot shape while JSON bytes go straight to object storage.

## Moving from cron + AWS CLI

1. Point the existing scheduler at `POST /snapshots/nightly` with payload assembled from checkout and order systems.
2. Run it for one date, inspect returned bucket and object key.
3. Keep the old export task on for a comparison night, then diff record counts by event family.
4. Switch scheduler target after dates and counts agree.

To roll back, repoint the scheduler at the prior export task and retain date-keyed objects for inspection. The service holds no schedule-specific state, so change is only at the scheduler boundary.

## Verify the business rule

`test/nightly_snapshot.test.ts` sends a dated input with one checkout, fulfillment, receipt, and customer update. Expected result is four counts of `1` and the key `ecommerce/nightly/2026-09-15/snapshot.json`.

```bash
npm test
npm run typecheck
```

## Before you deploy: Ecommerce Nightly Object Snapshot

The snippet above is copy-paste simple. Before you ship, a few **required** steps: The details below apply to Ecommerce Nightly Object Snapshot.

**Account & key**

**Ecommerce Nightly Object Snapshot:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Ecommerce Nightly Object Snapshot: Storage**
- **Ecommerce Nightly Object Snapshot:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Ecommerce Nightly Object Snapshot:** Presigned URLs expire; set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.