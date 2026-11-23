/** Simple TTL + size-bounded cache so repeated questions cost no tokens or latency. */
export class TtlCache<V> {
  private readonly map = new Map<string, { value: V; expires: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
    private readonly clock: () => number = Date.now,
  ) {}

  get(key: string): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expires < this.clock()) {
      this.map.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: V): void {
    if (this.map.size >= this.maxEntries) this.map.delete(this.map.keys().next().value as string);
    this.map.set(key, { value, expires: this.clock() + this.ttlMs });
  }
}
