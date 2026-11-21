import type { PublicAggregateStats } from '../../shared/types';
import { sanitizePublicStats } from './publicStatsMath';

export interface PublicStatsCacheOptions {
  ttlMs?: number;
  now?: () => number;
}

export class PublicStatsCache {
  private readonly ttlMs: number;
  private readonly now: () => number;
  private cachedValue: PublicAggregateStats | null = null;
  private cachedAt = 0;
  private inflight: Promise<PublicAggregateStats> | null = null;
  private generation = 0;

  constructor(options: PublicStatsCacheOptions = {}) {
    this.ttlMs = options.ttlMs ?? 30_000;
    this.now = options.now ?? (() => Date.now());
  }

  public invalidate(): void {
    this.generation += 1;
    this.cachedValue = null;
    this.cachedAt = 0;
  }

  public async getStats(
    fetcher: () => Promise<PublicAggregateStats>
  ): Promise<PublicAggregateStats> {
    if (this.cachedValue !== null && this.now() - this.cachedAt < this.ttlMs) {
      return this.cachedValue;
    }

    if (this.inflight) {
      return this.inflight;
    }

    const requestGen = this.generation;
    const promise = (async () => {
      const raw = await fetcher();
      const sanitized = sanitizePublicStats(raw);
      if (this.generation === requestGen) {
        this.cachedValue = sanitized;
        this.cachedAt = this.now();
      }
      return sanitized;
    })();

    this.inflight = promise;
    try {
      return await promise;
    } finally {
      if (this.inflight === promise) {
        this.inflight = null;
      }
    }
  }
}
