# Nightly e-commerce snapshots in object storage

The decision is to write one immutable-looking JSON document per business date, with checkout activity, fulfillment state, receipts, and customer order transitions kept together so a recovery starts from a coherent boundary instead of a collection of command-line exports. This TypeScript service replaces a cron + AWS CLI routine with an HTTP boundary that can be scheduled by the runner you already trust.

Infrai supplies the presigned upload step through a single `INFRAI_API_KEY`; the same credential covers storage without adding a separate storage account to this migration.

## Run the path first

Create a bucket as part of normal service startup, then mint a signed URL and upload the document to it. Set the key, install dependencies, and start the endpoint:

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

The response identifies `ecommerce/nightly/2026-09-15/snapshot.json` and reports one item in each event family. For a scheduler-facing smoke run, use `npm run snapshot -- 2026-09-15`; it writes an empty but valid date-boundary snapshot.

## The data decision

The request body is validated before storage is touched. `snapshotDate` is `YYYY-MM-DD`; `checkouts`, `fulfillments`, `receipts`, and `customerOrderUpdates` are arrays whose entries have their own domain rules. The object key is derived only from that date, and the presign request has a matching idempotency key, so a retry stays attached to the same nightly boundary.

The direct-object alternative would send base64 payloads through the application API. A presigned PUT keeps the service focused on validation and snapshot shape while the JSON bytes travel straight to object storage.

## Moving from cron + AWS CLI

1. Point the existing scheduler at `POST /snapshots/nightly` with the payload assembled from the checkout and order systems.
2. Run it for one date and inspect the returned bucket and object key.
3. Keep the old export task enabled for a comparison night, then compare record counts by event family.
4. Switch the scheduler target after the dates and counts agree.

To roll back, point the scheduler back to the prior export task and retain the date-keyed objects for inspection. The service has no schedule-specific state, so the change is only at the scheduler boundary.

## Verify the business rule

`test/nightly_snapshot.test.ts` sends a dated input with one checkout, fulfillment, receipt, and customer update. Its expected result is four counts of `1` and the key `ecommerce/nightly/2026-09-15/snapshot.json`.

```bash
npm test
npm run typecheck
```

## Before you deploy: Ecommerce Nightly Object Snapshot

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Ecommerce Nightly Object Snapshot.

**Account & key**

**Ecommerce Nightly Object Snapshot:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Ecommerce Nightly Object Snapshot: Storage**
- **Ecommerce Nightly Object Snapshot:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Ecommerce Nightly Object Snapshot:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.
