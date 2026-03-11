/**
 * In-Memory TTL Cache
 * Basit Map-based cache, configurable TTL ile.
 * Redis gerektirmez — tek instance deployment icin yeterli.
 */

class CacheStore {
  constructor(ttlMs) {
    this._cache = new Map();
    this._ttl = ttlMs || 5 * 60 * 1000; // default 5 dk
    this._hits = 0;
    this._misses = 0;
  }

  get(key) {
    const entry = this._cache.get(key);
    if (!entry) {
      this._misses++;
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      this._cache.delete(key);
      this._misses++;
      return null;
    }
    this._hits++;
    return entry.value;
  }

  set(key, value) {
    this._cache.set(key, { value, expiresAt: Date.now() + this._ttl });
  }

  invalidate(key) {
    if (key) {
      this._cache.delete(key);
    } else {
      this._cache.clear();
    }
  }

  stats() {
    return {
      size: this._cache.size,
      hits: this._hits,
      misses: this._misses,
      hitRate: (this._hits + this._misses) > 0
        ? Math.round(this._hits / (this._hits + this._misses) * 100) + '%'
        : 'N/A'
    };
  }
}

// Singleton instance'lar — hot path'ler icin
const fieldMappingCache = new CacheStore(5 * 60 * 1000);   // 5 dk
const processTypeCache = new CacheStore(10 * 60 * 1000);   // 10 dk
const processConfigCache = new CacheStore(10 * 60 * 1000); // 10 dk

module.exports = {
  CacheStore,
  fieldMappingCache,
  processTypeCache,
  processConfigCache
};
