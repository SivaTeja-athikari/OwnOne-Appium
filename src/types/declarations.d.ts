declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module '*.css' {
  const content: string;
  export default content;
}

declare module 'node:test' {
  export function describe(name: string, fn: () => void | Promise<void>): void;
  export function it(name: string, fn: () => void | Promise<void>): void;
  export function beforeEach(fn: () => void | Promise<void>): void;
  export function afterEach(fn: () => void | Promise<void>): void;
}

declare module 'node:assert' {
  interface Assert {
    (value: unknown, message?: string | Error): void;
    strictEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    deepStrictEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    throws(block: () => unknown, error?: unknown, message?: string | Error): void;
    doesNotThrow(block: () => unknown, message?: string | Error): void;
    rejects(block: () => Promise<unknown>, error?: unknown, message?: string | Error): Promise<void>;
  }
  const assert: Assert;
  export default assert;
}
