import { clamp } from "./util";
import { genTerrain, lineOfSight, pointHitsTerrain, type Terrain } from "./terrain";
import { WEAPONS, type WeaponId } from "./weapons";

export const GRAVITY = 1500;
export const MOVE_SPEED = 265;
export const GROUND_ACCEL = 2300;
export const AIR_ACCEL = 950;
export const JUMP_VY = 560;
export const JET_ACCEL = 2150;
export const MAX_RISE = 430;
export const MAX_FALL = 900;
export const BOOST_MAX = 100;
export const BOOST_DRAIN = 40;
export const BOOST_REGEN = 26;
export const BOOST_REGEN_DELAY = 0.5;
export const RESPAWN_SECONDS = 3;
export const KILL_LIMIT = 10;
export const BODY_HALF_W = 11;
export const BODY_H = 42;
export const SHOULDER_Y = 24; // aim pivot above the feet

export type InputState = {
  left: boolean;
  right: boolean;
  jumpHeld: boolean;
  jumpQueued: boolean;
  down: boolean;
  fire: boolean;
  aimAngle: number;
};

export function newInput(): InputState {
  return { left: false, right: false, jumpHeld: false, jumpQueued: false, down: false, fire: false, aimAngle: 0 };
}

export type Player = {
  id: string;
  name: string;
  skin: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  aim: number;
  facing: 1 | -1;
  hp: number;
  alive: boolean;
  respawnAt: number;
  weapon: WeaponId;
  ammo: number;
  reloading: boolean;
  reloadEndsAt: number;
  lastShotAt: number;
  boost: number;
  boostLockUntil: number;
  jetting: boolean;
  onGround: boolean;
  kills: number;
  deaths: number;
  isBot: boolean;
  wpX: number;
  wpY: number;
};

export type NetPlayer = {
  id: string; name: string; skin: number;
  x: number; y: number; vx: number; vy: number;
  aim: number; facing: number;
  hp: number; alive: boolean;
  weapon: WeaponId; boost: number; kills: number; jet: boolean;
};

export type RemotePlayer = { net: NetPlayer; rx: number; ry: number; wasAlive: boolean; initialized: boolean };

export type Bullet = {
  id: string; owner: string; x: number; y: number; vx: number; vy: number; life: number; dmg: number;
};

export type Particle = {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; size: number;
  kind: "flame" | "smoke" | "spark" | "blood";
};

export type KillEvent = { killerId: string; killerName: string; victimId: string; victimName: string };
export type HitEvent = { ownerId: string; targetId: string; dmg: number; x: number; y: number };

export function createPlayer(id: string, name: string, skin: number, isBot = false): Player {
  return {
    id, name, skin,
    x: 0, y: 0, vx: 0, vy: 0,
    aim: 0, facing: 1,
    hp: 100, alive: true, respawnAt: 0,
    weapon: "pistol", ammo: WEAPONS.pistol.mag, reloading: false, reloadEndsAt: 0, lastShotAt: 0,
    boost: BOOST_MAX, boostLockUntil: 0, jetting: false,
    onGround: false, kills: 0, deaths: 0,
    isBot, wpX: 0, wpY: 0,
  };
}

export function netOf(p: Player): NetPlayer {
  return {
    id: p.id, name: p.name, skin: p.skin,
    x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10,
    vx: Math.round(p.vx), vy: Math.round(p.vy),
    aim: Math.round(p.aim * 100) / 100, facing: p.facing,
    hp: Math.round(p.hp), alive: p.alive,
    weapon: p.weapon, boost: Math.round(p.boost), kills: p.kills, jet: p.jetting,
  };
}

export function respawnPick(terrain: Terrain, avoid: { x: number; y: number }[]): { x: number; y: number } {
  let best = terrain.spawns[0];
  let bestScore = -1;
  for (const s of terrain.spawns) {
    let minDist = Infinity;
    for (const a of avoid) minDist = Math.min(minDist, Math.hypot(a.x - s.x, a.y - s.y));
    const score = avoid.length === 0 ? Math.random() : minDist;
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best;
}

export function spawnPlayer(p: Player, terrain: Terrain, avoid: { x: number; y: number }[]) {
  const s = respawnPick(terrain, avoid);
  p.x = s.x;
  p.y = s.y;
  p.vx = 0;
  p.vy = 0;
  p.hp = 100;
  p.alive = true;
  p.boost = BOOST_MAX;
  p.ammo = WEAPONS[p.weapon].mag;
  p.reloading = false;
  p.jetting = false;
}

/** Reload / respawn timers. */
export function tickTimers(p: Player, terrain: Terrain, now: number, avoid: { x: number; y: number }[]) {
  if (p.reloading && now >= p.reloadEndsAt) {
    p.reloading = false;
    p.ammo = WEAPONS[p.weapon].mag;
  }
  if (!p.alive && p.respawnAt > 0 && now >= p.respawnAt) {
    spawnPlayer(p, terrain, avoid);
    p.respawnAt = 0;
  }
}

export function startReload(p: Player, now: number) {
  const w = WEAPONS[p.weapon];
  if (p.reloading || p.ammo >= w.mag) return;
  p.reloading = true;
  p.reloadEndsAt = now + w.reload * 1000;
}

export function simulateLocal(p: Player, input: InputState, terrain: Terrain, dt: number, now: number) {
  if (!p.alive) return;
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const accel = p.onGround ? GROUND_ACCEL : AIR_ACCEL;
  if (dir !== 0) {
    p.vx += dir * accel * dt;
    if (!input.fire) p.facing = dir > 0 ? 1 : -1;
  } else if (p.onGround) {
    p.vx *= Math.max(0, 1 - 9 * dt);
  }
  p.vx = clamp(p.vx, -MOVE_SPEED, MOVE_SPEED);

  // Jump / jetpack flight.
  let jetting = false;
  if (input.jumpQueued && p.onGround) {
    p.vy = -JUMP_VY;
    p.onGround = false;
  }
  input.jumpQueued = false;
  if (input.jumpHeld && !p.onGround && p.boost > 1) {
    p.vy -= JET_ACCEL * dt;
    jetting = true;
    p.boost = Math.max(0, p.boost - BOOST_DRAIN * dt);
    p.boostLockUntil = now + BOOST_REGEN_DELAY * 1000;
    emitJetParticles(p);
  } else if (now >= p.boostLockUntil) {
    p.boost = Math.min(BOOST_MAX, p.boost + BOOST_REGEN * dt);
  }
  p.jetting = jetting;

  if (input.down) p.vy += GRAVITY * 0.9 * dt;
  p.vy += GRAVITY * dt;
  p.vy = clamp(p.vy, -MAX_RISE, MAX_FALL);

  moveAndCollide(p, terrain, dt);
}

export function moveAndCollide(p: Player, terrain: Terrain, dt: number) {
  // Horizontal
  p.x += p.vx * dt;
  for (const plat of terrain.platforms) {
    if (!boxOverlaps(plat, p.x, p.y)) continue;
    if (p.vx > 0) p.x = plat.x - BODY_HALF_W;
    else if (p.vx < 0) p.x = plat.x + plat.w + BODY_HALF_W;
    p.vx = 0;
  }
  p.x = clamp(p.x, BODY_HALF_W, terrain.worldW - BODY_HALF_W);

  // Vertical
  p.y += p.vy * dt;
  p.onGround = false;
  for (const plat of terrain.platforms) {
    if (!boxOverlaps(plat, p.x, p.y)) continue;
    if (p.vy > 0) {
      p.y = plat.y;
      p.vy = 0;
      p.onGround = true;
    } else if (p.vy < 0) {
      p.y = plat.y + plat.h + BODY_H;
      p.vy = 0;
    }
  }
}

function boxOverlaps(plat: { x: number; y: number; w: number; h: number }, px: number, py: number): boolean {
  return (
    px - BODY_HALF_W < plat.x + plat.w &&
    px + BODY_HALF_W > plat.x &&
    py - BODY_H < plat.y + plat.h &&
    py > plat.y
  );
}

let bulletSeq = 0;

export function fire(p: Player, now: number, terrain: Terrain): Bullet[] {
  if (!p.alive || p.reloading) return [];
  const w = WEAPONS[p.weapon];
  if (now - p.lastShotAt < w.interval * 1000) return [];
  if (p.ammo <= 0) {
    startReload(p, now);
    return [];
  }
  p.lastShotAt = now;
  p.ammo--;
  const sx = p.x;
  const sy = p.y - SHOULDER_Y;
  const out: Bullet[] = [];
  for (let i = 0; i < w.pellets; i++) {
    const angle = p.aim + (Math.random() - 0.5) * w.spread;
    const bx = sx + Math.cos(angle) * w.barrel;
    const by = sy + Math.sin(angle) * w.barrel;
    out.push({
      id: `b${++bulletSeq}-${Math.random().toString(36).slice(2, 7)}`,
      owner: p.id,
      x: bx, y: by,
      vx: Math.cos(angle) * w.speed + p.vx * 0.25,
      vy: Math.sin(angle) * w.speed + p.vy * 0.1,
      life: 1.4,
      dmg: w.dmg,
    });
  }
  // Muzzle spark
  pushParticle(sx + Math.cos(p.aim) * (w.barrel + 4), sy + Math.sin(p.aim) * (w.barrel + 4), "spark", 0.12);
  return out;
}

export type TargetBox = { id: string; x: number; y: number };

/** Advances bullets; returns hits (each target applies its own damage). */
export function stepBullets(
  bullets: Bullet[],
  terrain: Terrain,
  dt: number,
  targets: TargetBox[],
): { hits: HitEvent[]; alive: Bullet[] } {
  const hits: HitEvent[] = [];
  const alive: Bullet[] = [];
  for (const b of bullets) {
    b.life -= dt;
    if (b.life <= 0) continue;
    const steps = Math.max(1, Math.ceil((Math.hypot(b.vx, b.vy) * dt) / 14));
    let consumed = false;
    for (let s = 0; s < steps && !consumed; s++) {
      b.x += (b.vx * dt) / steps;
      b.y += (b.vy * dt) / steps;
      if (pointHitsTerrain(terrain, b.x, b.y)) {
        pushParticle(b.x, b.y, "spark", 0.15);
        consumed = true;
        break;
      }
      for (const t of targets) {
        if (t.id === b.owner) continue;
        if (Math.abs(t.x - b.x) <= BODY_HALF_W + 3 && b.y >= t.y - BODY_H - 3 && b.y <= t.y + 3) {
          hits.push({ ownerId: b.owner, targetId: t.id, dmg: b.dmg, x: b.x, y: b.y });
          pushParticle(b.x, b.y, "blood", 0.3);
          consumed = true;
          break;
        }
      }
    }
    if (!consumed) alive.push(b);
  }
  return { hits, alive };
}

/** Applies damage on the owning client; returns a KillEvent when the victim dies. */
export function applyDamage(p: Player, dmg: number, killerId: string, killerName: string, now: number): KillEvent | null {
  if (!p.alive) return null;
  p.hp = Math.max(0, p.hp - dmg);
  if (p.hp <= 0) {
    p.alive = false;
    p.deaths++;
    p.respawnAt = now + RESPAWN_SECONDS * 1000;
    return { killerId, killerName, victimId: p.id, victimName: p.name };
  }
  return null;
}

export function pushParticle(x: number, y: number, kind: Particle["kind"], life = 0.5, particles?: Particle[]) {
  const count = kind === "blood" ? 5 : kind === "spark" ? 3 : 1;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = kind === "smoke" ? 20 + Math.random() * 30 : kind === "flame" ? 40 + Math.random() * 50 : 80 + Math.random() * 140;
    particles?.push({
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - (kind === "smoke" ? 30 : 0),
      life, maxLife: life,
      size: kind === "smoke" ? 4 + Math.random() * 5 : 2 + Math.random() * 2.5,
      kind,
    });
  }
}

function emitJetParticles(p: Player) {
  jetEmit.push({ x: p.x - p.facing * 12, y: p.y - 8 });
}

/** Jet flame emission is collected per frame by the render loop. */
export const jetEmit: { x: number; y: number }[] = [];

export function drainJetEmit(particles: Particle[]) {
  for (const e of jetEmit) {
    particles.push({
      x: e.x + (Math.random() - 0.5) * 6,
      y: e.y + Math.random() * 4,
      vx: (Math.random() - 0.5) * 30,
      vy: 60 + Math.random() * 60,
      life: 0.22, maxLife: 0.22, size: 3 + Math.random() * 3, kind: "flame",
    });
    particles.push({
      x: e.x + (Math.random() - 0.5) * 10,
      y: e.y + 10 + Math.random() * 10,
      vx: (Math.random() - 0.5) * 20,
      vy: 30 + Math.random() * 30,
      life: 0.55, maxLife: 0.55, size: 5 + Math.random() * 6, kind: "smoke",
    });
  }
  jetEmit.length = 0;
}

export function stepParticles(particles: Particle[], dt: number) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const q = particles[i];
    q.life -= dt;
    if (q.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    q.x += q.vx * dt;
    q.y += q.vy * dt;
    if (q.kind === "smoke") {
      q.vy -= 14 * dt;
      q.size += 8 * dt;
    } else if (q.kind === "blood" || q.kind === "spark") {
      q.vy += 500 * dt;
    }
  }
}

export function lerpRemote(r: RemotePlayer, dt: number) {
  if (!r.initialized) {
    r.rx = r.net.x;
    r.ry = r.net.y;
    r.initialized = true;
  }
  const t = 1 - Math.exp(-14 * dt);
  r.rx += (r.net.x - r.rx) * t;
  r.ry += (r.net.y - r.ry) * t;
}

/** Bots: chase, keep distance, aim with error, jetpack to gain height. */
export function botThink(
  bot: Player,
  terrain: Terrain,
  target: { x: number; y: number; alive: boolean } | null,
  dt: number,
  now: number,
): InputState {
  const input = newInput();
  if (!bot.alive) return input;
  if (!target || !target.alive) {
    if (bot.wpX === 0 || Math.hypot(bot.wpX - bot.x, bot.wpY - bot.y) < 60) {
      const s = terrain.spawns[Math.floor(Math.random() * terrain.spawns.length)];
      bot.wpX = s.x;
      bot.wpY = s.y;
    }
    return steerTo(bot, terrain, bot.wpX, bot.wpY, dt, input, false);
  }
  const dx = target.x - bot.x;
  const dy = target.y - bot.y;
  const dist = Math.hypot(dx, dy);
  // Keep mid distance.
  if (dist > 340) return steerTo(bot, terrain, target.x, target.y, dt, input, dy < -70);
  if (dist < 130) {
    input.left = dx > 0;
    input.right = dx < 0;
  }
  if (dy < -70 && bot.onGround) input.jumpQueued = true;
  if (dy < -140 && bot.boost > 30) input.jumpHeld = true;
  bot.aim = Math.atan2(target.y - 22 - (bot.y - SHOULDER_Y), target.x - bot.x) + Math.sin(now / 260) * 0.05;
  if (dist < 760 && lineOfSight(terrain, bot.x, bot.y - SHOULDER_Y, target.x, target.y - 22)) input.fire = true;
  return input;
}

function steerTo(
  bot: Player,
  terrain: Terrain,
  tx: number,
  ty: number,
  dt: number,
  input: InputState,
  climb: boolean,
): InputState {
  const dx = tx - bot.x;
  input.left = dx < -30;
  input.right = dx > 30;
  if (climb && bot.onGround) input.jumpQueued = true;
  if (climb && !bot.onGround && bot.boost > 30) input.jumpHeld = true;
  if (bot.onGround && Math.abs(bot.vx) < 20 && (input.left || input.right)) {
    // Stuck against a wall — hop.
    input.jumpQueued = true;
    bot.wpX = bot.x + (Math.random() - 0.5) * 400;
    bot.wpY = bot.y;
    void dt;
    void terrain;
  }
  bot.aim = input.right ? 0 : Math.PI;
  return input;
}

export { genTerrain };
