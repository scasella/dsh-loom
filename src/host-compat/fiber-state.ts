/** Numeric values of Cordis 4.0.5's published, compile-time-only FiberState enum. */
export const FiberState = Object.freeze({
  PENDING: 0,
  LOADING: 1,
  ACTIVE: 2,
  FAILED: 3,
  DISPOSED: 4,
  UNLOADING: 5,
} as const)

/** One state published by the installed Cordis Fiber. */
export type FiberState = typeof FiberState[keyof typeof FiberState]
