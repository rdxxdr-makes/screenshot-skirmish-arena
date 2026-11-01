import { mulberry32, clamp } from "./util";
import type { WeaponId } from "./weapons";

export type Platform = { x: number; y: number; w: number; h: number };
export type Palm = { x: number; y: number; scale: number; flip: boolean };
export type Boulder = { x: number; y: number; r: number };
export type Tuft = { x: number; y: number };
export type Stipple = { x: number; y: number; r: number };
export type Crate = { id: string; x: number; y: number; weapon: WeaponId; consumed: boolean };
export type SpawnPoint = { x: number; y: number };

export type Terrain = {
  seed: number;
  worldW: number;
  worldH: number;
  platforms: Platform[];
  palms: Palm[];
  boulders: Boulder[];
  tufts: Tuft[];
  stipples: Stipple[];
  crates: Crate[];
  spawns: SpawnPoint[];
  jungleFar: Palm[];
  jungleMid: Palm[];
};

export const WORLD_W = 3400;
export const WORLD_H = 1500;
const CAVE_FLOOR_Y = 1395;

type TopBlock = { x: number; w: number; top: number };

function addStipples(rng: () => number, out: Stipple[], p: Platform) {
  const count = clamp(Math.round((p.w * p.h) / 900), 10, 240);
  for (let i = 0; i < count; i++) {
    out.push({
      x: p.x + rng() * p.w,
      y: p.y + 10 + rng() * Math.min(p.h - 10, 160),
      r: 1 + rng() * 2.2,
    });
  }
}

function addTufts(rng: () => number, out: Tuft[], p: Platform) {
  for (let x = p.x + 6; x < p.x + p.w - 4; x += 18 + rng() * 26) {
    out.push({ x, y: p.y });
  }
}

export function genTerrain(seed: number): Terrain {
  const rng = mulberry32(seed);
  const platforms: Platform[] = [];
  const stipples: Stipple[] = [];
  const tufts: Tuft[] = [];
  const groundTops: TopBlock[] = [];

  // Ground chunks with crevice gaps exposing the cave floor below.
  let x = 0;
  while (x < WORLD_W) {
    const w = 300 + rng() * 320;
    const gap = rng() < 0.17 && x > 420 && x < WORLD_W - 620;
    if (gap) {
      x += 150 + rng() * 120;
      continue;
    }
    const top = 1120 + rng() * 150;
    platforms.push({ x, y: top, w, h: WORLD_H + 600 - top });
    groundTops.push({ x, w, top });
    x += w;
  }

  // Cave floor spanning the whole world (visible inside crevices).
  const cave: Platform = { x: -300, y: CAVE_FLOOR_Y, w: WORLD_W + 600, h: WORLD_H + 600 - CAVE_FLOOR_Y };
  platforms.push(cave);

  // Floating rock islands, spread across the map.
  const islands: Platform[] = [];
  const islandCount = 9;
  for (let i = 0; i < islandCount; i++) {
    const w = 180 + rng() * 220;
    const h = 44 + rng() * 30;
    const ix = clamp(
      140 + (i / islandCount) * (WORLD_W - 420) + (rng() - 0.5) * 200,
      120,
      WORLD_W - w - 80,
    );
    const iy = 540 + rng() * 440;
    islands.push({ x: ix, y: iy, w, h });
  }
  // Two high ledges reachable by jetpack.
  islands.push({ x: 420 + rng() * 380, y: 300 + rng() * 110, w: 160 + rng() * 90, h: 38 });
  islands.push({ x: WORLD_W - 1000 + rng() * 500, y: 320 + rng() * 130, w: 160 + rng() * 90, h: 38 });
  platforms.push(...islands);

  for (const p of platforms) addStipples(rng, stipples, p);
  for (const p of platforms) addTufts(rng, tufts, p);

  // Decorations: palms and boulders sitting on tops.
  const palms: Palm[] = [];
  const boulders: Boulder[] = [];
  for (let i = 0; i < 3 && i < groundTops.length; i++) {
    const t = groundTops[Math.floor(rng() * groundTops.length)];
    palms.push({ x: t.x + 40 + rng() * (t.w - 80), y: t.top, scale: 0.9 + rng() * 0.5, flip: rng() < 0.5 });
  }
  for (let i = 0; i < 3; i++) {
    const isl = islands[Math.floor(rng() * islands.length)];
    palms.push({ x: isl.x + 30 + rng() * (isl.w - 60), y: isl.y, scale: 0.7 + rng() * 0.4, flip: rng() < 0.5 });
  }
  for (let i = 0; i < 6; i++) {
    const t = groundTops[Math.floor(rng() * groundTops.length)];
    const r = 14 + rng() * 14;
    boulders.push({ x: t.x + 30 + rng() * (t.w - 60), y: t.top - r * 0.55, r });
  }
  for (let i = 0; i < 3; i++) {
    const isl = islands[Math.floor(rng() * islands.length)];
    const r = 10 + rng() * 10;
    boulders.push({ x: isl.x + 30 + rng() * (isl.w - 60), y: isl.y - r * 0.55, r });
  }

  // Weapon crates on islands and ground.
  const crateWeapons: WeaponId[] = ["rifle", "shotgun", "rifle", "shotgun", "rifle", "shotgun", "rifle"];
  const crates: Crate[] = [];
  for (let i = 0; i < crateWeapons.length; i++) {
    const p = i < 4 ? islands[Math.floor(rng() * islands.length)] : groundTops[Math.floor(rng() * groundTops.length)];
    crates.push({
      id: `crate-${i}`,
      x: p.x + 24 + rng() * Math.max(20, p.w - 48),
      y: p.y,
      weapon: crateWeapons[i],
      consumed: false,
    });
  }

  // Spawn points spread across ground and islands.
  const spawns: SpawnPoint[] = [];
  for (let i = 0; i < 6; i++) {
    const t = groundTops[Math.floor((i / 6) * groundTops.length)];
    spawns.push({ x: t.x + 40 + rng() * (t.w - 80), y: t.top });
  }
  for (let i = 0; i < 4; i++) {
    const isl = islands[Math.floor(rng() * islands.length)];
    spawns.push({ x: isl.x + 40 + rng() * (isl.w - 80), y: isl.y });
  }

  // Distant jungle silhouettes for parallax.
  const jungleFar: Palm[] = [];
  const jungleMid: Palm[] = [];
  for (let i = 0; i < 26; i++) {
    jungleFar.push({ x: rng() * WORLD_W * 1.2, y: 1130 + rng() * 140, scale: 0.8 + rng() * 0.7, flip: rng() < 0.5 });
  }
  for (let i = 0; i < 20; i++) {
    jungleMid.push({ x: rng() * WORLD_W * 1.2, y: 1210 + rng() * 90, scale: 1 + rng() * 0.8, flip: rng() < 0.5 });
  }

  return {
    seed,
    worldW: WORLD_W,
    worldH: WORLD_H,
    platforms,
    palms,
    boulders,
    tufts,
    stipples,
    crates,
    spawns,
    jungleFar,
    jungleMid,
  };
}

export function pointHitsTerrain(t: Terrain, x: number, y: number): boolean {
  for (const p of t.platforms) {
    if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) return true;
  }
  return false;
}

/** True when the straight segment a→b is free of terrain. */
export function lineOfSight(t: Terrain, ax: number, ay: number, bx: number, by: number): boolean {
  const dist = Math.hypot(bx - ax, by - ay);
  const steps = Math.max(2, Math.ceil(dist / 26));
  for (let i = 1; i < steps; i++) {
    const s = i / steps;
    if (pointHitsTerrain(t, ax + (bx - ax) * s, ay + (by - ay) * s)) return false;
  }
  return true;
}
