import { useState } from "react";

/** useState that remembers its value between visits (filters, sort order). Falls back quietly where storage is blocked. */
export function usePersist<T extends string>(key: string, init: T): [T, (v: T) => void] {
  const k = `bb.f.${key}`;
  const [v, setV] = useState<T>(() => {
    try { return (localStorage.getItem(k) as T | null) ?? init; } catch { return init; }
  });
  return [v, (n: T) => { setV(n); try { localStorage.setItem(k, n); } catch { /* storage blocked */ } }];
}
