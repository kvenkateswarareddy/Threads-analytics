/** Retry with exponential backoff. Retries only when `shouldRetry` says so (default: always). */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; baseMs?: number; shouldRetry?: (err: unknown) => boolean } = {},
): Promise<T> {
  const { retries = 3, baseMs = 400, shouldRetry = () => true } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries || !shouldRetry(err)) break;
      await new Promise((r) => setTimeout(r, baseMs * 2 ** attempt));
    }
  }
  throw lastErr;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** 429 and 5xx are worth retrying; other 4xx are not. */
export const isTransient = (err: unknown) =>
  !(err instanceof HttpError) || err.status === 429 || err.status >= 500;
