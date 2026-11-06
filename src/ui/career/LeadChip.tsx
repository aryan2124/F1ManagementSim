import { isPromising, visibleCard } from "../../career/leadcards";
import type { Staff } from "../../career/types";

/** A lead engineer's special card, or a hint that a trainee has something. Hidden cards show only after they have fired once. */
export function LeadChip({ st }: { st: Staff }) {
  const c = visibleCard(st);
  if (c) return <p className="small"><span className="sk-chip lead">{c.name.toUpperCase()}</span> {c.text} <span className="dim">{c.flavour}</span></p>;
  if (st.card) return <p className="small"><span className="sk-chip lead secret">? ? ?</span> <span className="dim">There is something about this one nobody has seen yet.</span></p>;
  if (isPromising(st)) return <p className="small"><span className="sk-chip promising">PROMISING</span> <span className="dim">A spark. Keep him working in his area.</span></p>;
  return null;
}
