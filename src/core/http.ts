import { AppError, toAppError } from './errors';

type JsonInit = {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  /** Number of retries after the first attempt. */
  retries?: number;
  signal?: AbortSignal;
};

const DEFAULT_TIMEOUT = 12_000;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Links an external AbortSignal to our own timeout controller so a caller
 * cancelling (e.g. a superseded search) aborts the in-flight request too.
 */
function linkedController(external: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const onAbort = () => controller.abort();
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener('abort', onAbort);
  }

  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      external?.removeEventListener('abort', onAbort);
    },
  };
}

/**
 * fetch + JSON with timeout, bounded retry and HTTP-status -> AppError mapping.
 * 4xx (other than 429) never retries; there is no point and it wastes time.
 */
export async function fetchJson<T>(url: string, init: JsonInit = {}): Promise<T> {
  const {
    method = 'GET',
    headers = {},
    body,
    timeoutMs = DEFAULT_TIMEOUT,
    retries = 1,
    signal,
  } = init;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const { signal: linked, dispose } = linkedController(signal, timeoutMs);

    try {
      const res = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json', ...headers } : headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: linked,
      });

      if (!res.ok) {
        if (res.status === 429) {
          const retryAfter = Number(res.headers.get('retry-after')) || 0;
          throw new AppError('rate_limited', 'Too many requests. Give it a moment.', {
            detail: `HTTP 429${retryAfter ? ` retry-after=${retryAfter}s` : ''}`,
          });
        }
        if (res.status === 404 || res.status === 410) {
          throw new AppError('track_unavailable', 'This track is unavailable.', {
            detail: `HTTP ${res.status}`,
          });
        }
        if (res.status >= 400 && res.status < 500) {
          throw new AppError('source_unavailable', 'No playback source available.', {
            detail: `HTTP ${res.status}`,
            retryable: false,
          });
        }
        throw new AppError('source_unavailable', 'The source is unavailable right now.', {
          detail: `HTTP ${res.status}`,
        });
      }

      return (await res.json()) as T;
    } catch (e) {
      lastError = e;

      // A caller-initiated abort is not a failure to retry -- rethrow at once.
      if (signal?.aborted) throw toAppError(e, 'timeout');

      const err = toAppError(e);
      if (!err.retryable || attempt === retries) throw err;

      // Exponential backoff with a little jitter.
      await sleep(400 * 2 ** attempt + Math.random() * 200);
    } finally {
      dispose();
    }
  }

  throw toAppError(lastError);
}

/** HEAD-style reachability probe used when picking a stream resolver endpoint. */
export async function probe(url: string, timeoutMs = 6000): Promise<boolean> {
  const { signal, dispose } = linkedController(undefined, timeoutMs);
  try {
    const res = await fetch(url, { method: 'GET', signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    dispose();
  }
}
