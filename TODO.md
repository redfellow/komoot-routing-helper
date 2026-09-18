## TODO

1: [x] Add a disable/enable switch toggle to the floating popup, so a user can quickly toggle the visual changes the extension makes.

2: [x] Make the visual changes to trails actually work, I get that we made the MapLibre layer based on how Squadrats plugin has handled things, but Im not seeing any visaul changes on the map when changing trail settings via the extension. Keep testing with Brave until you can verify that changing the trail options works on the fly

Verified in Brave on the test route: S0 highlight → avoid changes trail strokes and labels immediately; visuals Off restores native styling. Automated regression coverage: `node --test test/` (11 passing).
