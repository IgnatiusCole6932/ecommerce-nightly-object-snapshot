import { createServer } from "node:http";
import { InfraiError } from "./infrai_storage";
import { nightlySnapshotRequestSchema, uploadNightlySnapshot } from "./nightly_snapshot";

const bucket = process.env.SNAPSHOT_BUCKET ?? "ecommerce-nightly-snapshots";
const port = Number(process.env.PORT ?? 3000);

async function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  let text = "";
  for await (const chunk of request) text += chunk;
  return JSON.parse(text);
}

createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/snapshots/nightly") {
    response.writeHead(404).end();
    return;
  }
  try {
    const parsed = nightlySnapshotRequestSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "Invalid nightly snapshot request" }));
      return;
    }
    const result = await uploadNightlySnapshot(parsed.data, bucket);
    response.writeHead(201, { "Content-Type": "application/json" });
    response.end(JSON.stringify(result));
  } catch (error) {
    const status = error instanceof InfraiError && error.status >= 400 && error.status < 500
      ? error.status
      : 502;
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: error instanceof Error ? error.message : "Snapshot failed" }));
  }
}).listen(port, () => {
  console.log(`Nightly snapshot service listening on ${port}`);
});
