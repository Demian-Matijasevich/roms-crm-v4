/**
 * Rate limit in-memory por sesión.
 * No usar en flujos de tráfico alto ni con múltiples réplicas: el estado vive
 * en el proceso. Alcanza para endpoints admin del CRM (bajo volumen).
 */
import crypto from "crypto";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterMs: number };

/**
 * Chequea el bucket del `key`. Máx `max` requests por `windowMs`.
 * Devuelve `ok:false` con `retryAfterMs` si excedió.
 */
export function checkRateLimit(
  key: string,
  max = 10,
  windowMs = 60_000,
): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    // GC ocasional (evita crecer el Map indefinido en procesos long-running)
    if (buckets.size > 5000) {
      for (const [k, b] of buckets) {
        if (b.resetAt <= now) buckets.delete(k);
      }
    }
    return { ok: true, remaining: max - 1 };
  }

  if (bucket.count >= max) {
    return { ok: false, retryAfterMs: bucket.resetAt - now };
  }

  bucket.count += 1;
  return { ok: true, remaining: max - bucket.count };
}

/**
 * Idempotency key auto-generada para dedupear doble-click.
 * Combina session id + ventana de 1.5s: dos POST del mismo user en <1.5s
 * generan la misma key y el UNIQUE de wa_msg_id los rechaza.
 */
export function autoIdempotencyKey(scope: string, sessionId: string | number): string {
  const window = Math.floor(Date.now() / 1500);
  return crypto
    .createHash("sha256")
    .update(`${scope}:${sessionId}:${window}`)
    .digest("hex")
    .slice(0, 32);
}
