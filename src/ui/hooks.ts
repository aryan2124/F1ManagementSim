import { useEffect, useState } from "react";

/** Re-render this component every `ms` milliseconds (used to poll the sim at a UI-friendly rate). */
export function useUiTick(ms: number): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((v) => v + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
  return n;
}
