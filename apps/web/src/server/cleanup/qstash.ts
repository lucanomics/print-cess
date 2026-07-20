import { Client, Receiver } from "@upstash/qstash";

import type { CleanupScheduler } from "../contracts";

export class QStashCleanupScheduler implements CleanupScheduler {
  readonly #client: Client;

  public constructor(
    private readonly callbackUrl: string,
    token = process.env.QSTASH_TOKEN,
  ) {
    if (!token) throw new Error("QStash token is required in external adapter mode");
    this.#client = new Client({ token });
  }

  public async schedule(sessionId: string, dueAt: number): Promise<void> {
    const seconds = Math.max(1, Math.ceil((dueAt - Date.now()) / 1000));
    await this.#client.publishJSON({
      url: this.callbackUrl,
      body: { sessionId },
      delay: seconds,
      retries: 3,
      deduplicationId: `pc-cleanup-v1-${sessionId}-${dueAt}`,
    });
  }
}

export async function verifyQStashRequest(request: Request, body: string): Promise<boolean> {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!currentSigningKey || !nextSigningKey) return false;
  const signature = request.headers.get("upstash-signature");
  if (!signature) return false;
  const receiver = new Receiver({ currentSigningKey, nextSigningKey });
  return receiver.verify({ signature, body, url: request.url });
}
