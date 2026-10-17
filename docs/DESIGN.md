# BOX BOX design language (the Balatro study)

How this was made: I read what is published about Balatro's feel (Blake Crosley's breakdown of its feedback, the TouchArcade interview with its creator) and combined it with my own knowledge of the game. The web sources were thin on UI detail, so the rules below are my reading of the game, not leaked specs. Treat the numbers as tuned-by-eye starting points.

## What Balatro actually does

1. **The table is alive.** The background is never flat. A slow marbled swirl fills the screen and changes colour with the situation (calm green for a normal round, red and purple for a boss). Everything sits on that moving surface, so even a still menu feels like it is breathing.
2. **Few, fat, rounded shapes.** Panels are rounded rectangles with a thick dark outline, a slightly lighter inner rim, and a hard drop shadow below. Nothing is thin. Nothing is a bare rectangle with a 1px line.
3. **Colour is a language.** Blue means chips, red means mult, gold means money, orange means go, green means safe or bought, purple means special. The same hue always means the same thing, so you read colour before you read words.
4. **Sparse by default.** The main screen shows the few things that matter at huge size. Detail lives behind a hover or a tap and appears as a small card. Text is short and keywords are coloured chips.
5. **Everything has weight and reacts.** Cards float on a sine bob, tilt toward the cursor, rise on hover with a shadow that grows underneath, and sink when pressed. Anything that changes (a number, a price, a counter) wobbles with an overshoot scale and a decaying rotation. This "juice up" is the single most copied trick.
6. **Chains build.** Scoring is a sequence, not a result: each contribution pops a coloured bubble over the thing that caused it, each pop is a rising pitch, and the screen shake and flash scale with how big the total is.
7. **Buttons are objects.** Flat saturated colour, a darker lip underneath, white caps with a drop shadow. They lift on hover, sink on press, and every press has a sound. Primary action is the biggest and the warmest colour on screen.
8. **Transitions are choreography.** Panels drop in with a bounce, staggered a few frames apart. Cash-out lists itemise one row at a time with a tick for each. Nothing just appears.
9. **Sound is foley plus pitch.** Short, soft, pitched effects. A tick on hover, a thunk on press, a chime that climbs as a combo builds, a low rumble for something big. Never a harsh buzz.
10. **One typeface, two sizes, always shadowed.** Hierarchy comes from size, colour and position, not from font variety.

## How that becomes BOX BOX

| Balatro idea | BOX BOX version |
| --- | --- |
| Swirl table | Low-res pixel swirl canvas behind every screen, tinted per screen (Car is blueprint blue, Money is gold-green, Rules is violet). Reacts to events (a win warms it, a crisis reddens it). |
| Rounded fat panels | `.panel` gets stepped (pixel) rounded corners, a 3px outline, an inner rim and a hard offset shadow. Panels have a header plate that sticks out like a tab. |
| Colour language | Cash gold, cap room teal, time (hours) blue, board and mood green or red, danger red, research purple, go orange. Defined once as tokens and used by every stat. |
| Sparse, progressive | Long pages are split into sub-tabs. Help text folds away. Rows align on a strict grid with the name left, the number right, actions last. |
| Juice | `Num` wobbles on change, panels pop in staggered, buttons lift and sink, cards tilt with the cursor, tab changes slide. |
| Chains | Weekend results, the podium and the car reveal count up in steps with rising pitch. |
| Buttons as objects | One button system: primary (orange), go (green), info (blue), danger (red), quiet (slate). Lip, lift, sink, sound. |
| Foley sound | Synthesized `tick`, `thunk`, `swish`, `pop`, `climb(n)`, `deny`. All code, no files. |
| CRT | Soft scanlines and vignette on top, switchable in Settings. |

## Rules for anything new

- Use tokens, never raw hex, in screen CSS.
- One primary button per panel.
- Numbers go through `Num`, so they react.
- If a panel has more than about six rows or two paragraphs, fold or split it.
- Text lines use the shared row grid (`.row`), so labels, values and buttons align.
- Every interactive thing needs a hover, a pressed state and a sound.
