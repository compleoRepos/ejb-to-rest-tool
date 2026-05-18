/**
 * useSessionsCache — Shared in-memory cache for session list endpoints.
 *
 * v11.3: Performance optimization.
 * Avoids redundant fetches when multiple components (Architecture, ProjectDetail, SessionList)
 * all call the same /api/compleo/sessions or /api/agent/sessions endpoint.
 *
 * Cache TTL: 10 seconds (stale-while-revalidate pattern).
 *
 * @author Compleo
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_TTL_MS = 10_000; // 10 seconds

const cache = new Map<string, CacheEntry<any>>();
const inflight = new Map<string, Promise<any>>();

/**
 * Fetch with shared cache. Multiple callers to the same URL within TTL
 * will share a single network request and cached result.
 */
export async function fetchWithCache<T>(url: string): Promise<T> {
  const now = Date.now();
  const cached = cache.get(url);

  // Return cached data if fresh
  if (cached && (now - cached.timestamp) < CACHE_TTL_MS) {
    return cached.data as T;
  }

  // Deduplicate in-flight requests
  const existing = inflight.get(url);
  if (existing) {
    return existing as Promise<T>;
  }

  // Make the request
  const promise = fetch(url)
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then(data => {
      cache.set(url, { data, timestamp: Date.now() });
      inflight.delete(url);
      return data as T;
    })
    .catch(err => {
      inflight.delete(url);
      throw err;
    });

  inflight.set(url, promise);
  return promise;
}

/**
 * Invalidate a cached URL (e.g., after creating a new session).
 */
export function invalidateCache(url: string): void {
  cache.delete(url);
}

/**
 * Invalidate all cached URLs.
 */
export function invalidateAllCaches(): void {
  cache.clear();
}
