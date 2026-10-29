/**
 * One idempotency key per distinct order request. Retrying the same request (double tap,
 * network retry, page reload mid-submit) reuses the key, so the server returns the
 * original order instead of creating a duplicate. Changing the request gets a new key.
 */
const STORAGE_KEY = "lahab.checkout.idempotency";

interface Stored {
  request: string;
  key: string;
}

function read(): Stored | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

let memory: Stored | null = null;

export function idempotencyKeyFor(request: unknown): string {
  const fingerprint = JSON.stringify(request);
  const stored = read() ?? memory;
  if (stored && stored.request === fingerprint) return stored.key;
  const next = { request: fingerprint, key: crypto.randomUUID() };
  memory = next;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode: the in-memory copy still covers retries on this page.
  }
  return next.key;
}

export function clearIdempotencyKey() {
  memory = null;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
