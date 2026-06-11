import { vi } from "vitest";

/**
 * Minimal chainable PostgREST query-builder mock.
 *
 * Every chain method (select/insert/update/delete/eq/or/gte/lte/order/limit)
 * is a vi.fn() that returns the same builder, so any call order works. The
 * builder is awaitable (it has a `then`) and `.single()`/`.maybeSingle()`
 * resolve to the same fixed `result` — letting one builder stand in for both
 * "await the chain" and "await .single()" styles used across the db layer.
 *
 * Spy on a specific step with `builder.insert`, `builder.delete`, etc.
 */
export type QueryResult = { data?: unknown; error?: unknown; count?: number | null };

export interface QueryBuilderMock {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  ilike: ReturnType<typeof vi.fn>;
  or: ReturnType<typeof vi.fn>;
  gte: ReturnType<typeof vi.fn>;
  lte: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  then: (resolve: (v: QueryResult) => unknown, reject?: (e: unknown) => unknown) => Promise<unknown>;
}

export function queryBuilder(result: QueryResult): QueryBuilderMock {
  const builder = {} as QueryBuilderMock;
  const chain = ["select", "insert", "update", "delete", "eq", "ilike", "or", "gte", "lte", "order", "limit"] as const;
  for (const m of chain) {
    builder[m] = vi.fn(() => builder);
  }
  builder.single = vi.fn(() => Promise.resolve(result));
  builder.maybeSingle = vi.fn(() => Promise.resolve(result));
  builder.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

/** A fake Supabase client whose `.from()` returns the given builder and whose
 *  `.rpc()` resolves to `rpcResult` (override per test as needed). */
export function fakeClient(builder: QueryBuilderMock, rpcResult: QueryResult = { data: null, error: null }) {
  return {
    from: vi.fn(() => builder),
    rpc: vi.fn(() => Promise.resolve(rpcResult)),
  };
}
