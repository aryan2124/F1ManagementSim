import { GUIDANCE_LABEL, GUIDANCE_TEXT } from "../../career/guide";
import type { Guidance } from "../../career/types";

const LEVELS: Guidance[] = ["off", "hints", "full"];

/** The help level, chosen once when a career or league starts and changed only in Settings. Nothing here changes how the game plays. */
export function HelpPicker({ value, onChange }: { value: Guidance; onChange: (g: Guidance) => void }) {
  return (
    <>
      <div className="seg">
        {LEVELS.map((g) => (
          <button key={g} className={value === g ? "on" : ""} onClick={() => onChange(g)}>{GUIDANCE_LABEL[g]}</button>
        ))}
      </div>
      <p className="dim small">{GUIDANCE_TEXT[value]} You can change this later in Settings (the cog). It only changes what the screens say, never how the game plays.</p>
    </>
  );
}
