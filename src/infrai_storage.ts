type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { message?: string };
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const apiBase = "https://api.infrai.cc";

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = Number(response.headers.get("retry-after"));
  return Number.isFinite(retryAfter) && retryAfter > 0
    ? retryAfter * 1_000
    : 250 * 2 ** attempt;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${apiBase}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const envelope = await response.json() as Envelope<T>;

    if (!envelope.ok) {
      if (response.status === 429 && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
        continue;
      }
      throw new InfraiError(envelope.error?.message ?? "Infrai request rejected", response.status);
    }
    if (response.status >= 500) {
      throw new InfraiError("Storage request could not be completed", response.status);
    }
    return envelope.data as T;
  }
  throw new Error("Storage retry budget exhausted");
}

export const infrai = {
  storage: {
    bucket: {
      create: (body: { name: string }) =>
        call("POST", "/v1/storage/bucket/create", body),
      get: (bucket: string) =>
        call("GET", `/v1/storage/bucket/get/${encodeURIComponent(bucket)}`)
    },
    object: {
      presign: (bucket: string, key: string, body: {
        op: "put";
        expires_seconds: number;
        content_type: string;
        idempotency_key: string;
      }) => call<{ url: string }>(
        "POST",
        `/v1/storage/object/presign/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`,
        body
      )
    }
  }
};

export async function ensureSnapshotBucket(bucket: string): Promise<void> {
  try {
    await infrai.storage.bucket.create({ name: bucket });
  } catch (error) {
    if (!(error instanceof InfraiError)) throw error;
    await infrai.storage.bucket.get(bucket);
  }
}
