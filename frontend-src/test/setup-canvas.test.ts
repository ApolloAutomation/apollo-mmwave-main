/**
 * The canvas stub from setup-canvas.ts must not be a thenable. If `then` reads
 * back as the callable proxy, awaiting the context calls then(resolve, reject),
 * which never calls resolve, and the test sits until vitest's timeout.
 */

import { describe, it, expect } from "vitest";

const PENDING = Symbol("pending");

/** Resolve to the value, or to PENDING if it has not settled within a tick. */
function settleOrPending<T>(value: T): Promise<Awaited<T> | typeof PENDING> {
  return Promise.race([
    (async () => await value)(),
    new Promise<typeof PENDING>((resolve) => setTimeout(() => resolve(PENDING), 50)),
  ]);
}

describe("setup-canvas stub context", () => {
  it("does not expose a then method", () => {
    const ctx = document.createElement("canvas").getContext("2d") as any;
    expect(ctx.then).toBeUndefined();
  });

  it("settles when awaited", async () => {
    const ctx = document.createElement("canvas").getContext("2d");
    expect(await settleOrPending(ctx)).toBe(ctx);
  });

  it("settles when a value read off it is awaited", async () => {
    const ctx = document.createElement("canvas").getContext("2d") as any;
    const metrics = ctx.measureText("x");
    expect(await settleOrPending(metrics)).toBe(metrics);
  });

  it("still swallows chained calls and property reads", () => {
    const ctx = document.createElement("canvas").getContext("2d") as any;
    expect(() => ctx.beginPath().arc(0, 0, 1, 0, Math.PI).fill()).not.toThrow();
    expect(ctx.measureText("x").width).toBeDefined();
    expect(String(ctx)).toBe("[stub CanvasRenderingContext2D]");
  });
});
