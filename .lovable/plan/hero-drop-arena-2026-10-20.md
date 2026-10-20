# Hero Drop: Arena

## Build
- Replace the home placeholder with the full game experience: title screen, 10-hero selection, tutorial, and playable arena.
- Add a reusable low-poly 3D character/scene in React Three Fiber, using geometric materials and an angled third-person camera.
- Implement local combat: WASD/arrow and touch movement, aiming/shooting, hero abilities, three chasing bots, pickups, health/shield/ammo, and a shrinking danger zone.
- Add responsive HUD, minimap, cooldown/ultimate indicators, notifications, and win/lose/restart screens.
- Establish a distinct, vivid arcade-comic visual system using semantic CSS tokens.

## Technical details
- Use Three.js with React Three Fiber compatible with React 19; mount Canvas on the client-only index route.
- Keep game state local, update motion with clamped frame delta, and use DOM-based accessible HUD controls.
- Add route-specific metadata and verify the game through browser interaction and project tests/build signals.
