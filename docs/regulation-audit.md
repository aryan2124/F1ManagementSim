# Regulation audit: does each rule do what it says?

Method: every flag a module in `src/career/modules.ts` can emit was traced to live code that reads it for the player's own career. The old R&D system (`rnd.ts`) now only runs for AI teams, so a flag read only there counts as unbuilt for the player. The repo has 18 modules, not 20.

A guard test, `tests/regulations.test.ts`, now fails if any flag has no live reader, unless it is on the KNOWN_GAPS list with a reason. New rules can no longer say something that nothing does.

## Found and fixed in this pass
- **Attack zones** (the one that started this): the sim ignored the flag. Now 2 to 3 zones per circuit from the longest straights, boost refused outside a zone, zones drawn on the map, BOOST button shows the zone state, AI boosts on zone entry, zone boost helps passing.
- **areaMult** (grenadeEra, energyAuction, twinChassis, kitLibrary, openCooling and others): only the old R&D read it. Now it scales what the player's tree parts give, per car area, through `refreshMods`.
- **upgradeQuota** (freedomAuction 3, kitLibrary 5): only the old R&D read it. Now the tree refuses a new build once the season's quota is built or in the factory.
- **customerParts**: income per finished project was only paid in the old R&D. Now paid when a tree part finishes building.

## Checked and already working
twoRaceWeekend and allSprints, refuelling, fixedStop, relay, draft, tyrePool, batterySwap, weatherCard, driverWeight, openCooling (reliability), the cost auditor (monthly fines in `loopholes.ts`), talentCap, ballast, handicapStart, stop windows, defence tokens, standing restarts, stage racing, checkpoint cuts, two-heat, open radio, radio quota, aggregate quali, single shot.

## Built after the first audit pass
- **Grenade era (enginePackages):** a pool of 6 grenade runs per team per season. A run is a whole weekend: more power, less engine reliability. The player switches it on in the Engine Mode panel, AI teams spend theirs by a rule of thumb, and the pool refills each year. Runs are booked after the race.
- **Twin chassis (tunnelBank):** car A and car B are the two chassis. After practice the player picks one for both cars, free, the only change the parc ferme allows. New parts cost 30 percent more.
- **Transparent paddock (openBooks):** every third round is a disclosure weekend. The player publishes one fitted part, truthfully or as a decoy, and may copy one rival disclosure (which may be a decoy). A truthful disclosure lets a rival gain, a decoy makes a copying rival lose, and the stewards fine a decoy one time in four.

## Still not built
- Rules that exist only as format-choice trait overlays (sixWheels pit crew effects, wingsBanned tow tactics, fuelIsMoney fuel budget) are cosmetic rather than systems.

The KNOWN_GAPS list in the guard test is now empty.
