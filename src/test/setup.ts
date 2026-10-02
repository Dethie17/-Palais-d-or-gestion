import "@testing-library/jest-dom";
import { vi } from "vitest";

// Les tests ne touchent JAMAIS au Supabase distant : la synchro est
// best-effort en production, les assertions portent sur l'état local.
// Ce mock neutralise tous les appels (insert/update/select/…) en no-op.
vi.mock("@/lib/supabase", () => {
  const terminal = { data: null, error: null };
  const makeChain = (): Record<string, unknown> =>
    new Proxy(
      {
        then: (resolve?: (v: unknown) => unknown) =>
          Promise.resolve(terminal).then(resolve as never),
      } as Record<string, unknown>,
      {
        get(t, prop) {
          if (prop === "then") return t.then;
          if (prop === "data" || prop === "error") return null;
          if (typeof prop === "string" && prop !== "then") return () => makeChain();
          return undefined;
        },
      },
    );
  return { supabase: { from: () => makeChain() } };
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
