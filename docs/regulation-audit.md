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

## Still not built (on the KNOWN_GAPS list)
- **tunnelBank, twinChassis**: "two chassis, pick after practice" has no second tree. Only the area multiplier works.
- **openBooks, transparentPaddock**: "publish a dial every third race, copy what rivals disclosed". The dials went away with the old R&D, so nothing is published or copied.
- **enginePackages, grenadeEra**: "a pool of engine modes that destroy the engine" has no pool. Only the power multiplier works.
- Rules that exist only as format-choice trait overlays (sixWheels pit crew effects, wingsBanned tow tactics, fuelIsMoney fuel budget) are cosmetic rather than systems.
