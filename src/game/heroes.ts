export type Hero = {
  id: string;
  name: string;
  role: string;
  color: string;
  accent: string;
  ability: string;
  ultimate: string;
  abilityDescription: string;
  ultimateDescription: string;
  initials: string;
  stats: { power: number; speed: number; defense: number };
};

export const heroes: Hero[] = [
  { id: "volt", name: "Voltara", role: "ARC RUNNER", color: "#a7f34b", accent: "#e7ff97", ability: "ELECTRICITY DASH", ultimate: "STORM BREAKER", abilityDescription: "Zip forward and shock nearby rivals.", ultimateDescription: "Unleash a chain storm across the arena.", initials: "VT", stats: { power: 3, speed: 5, defense: 2 } },
  { id: "titan", name: "Titan Forge", role: "IRON VANGUARD", color: "#ffac57", accent: "#ffe0a0", ability: "SHIELD WALL", ultimate: "FORTRESS MODE", abilityDescription: "Brace up and restore your shield.", ultimateDescription: "Blast all nearby rivals with a seismic guard pulse.", initials: "TF", stats: { power: 3, speed: 2, defense: 5 } },
  { id: "shadow", name: "Shadow Lynx", role: "NIGHT STALKER", color: "#bd91ff", accent: "#ead7ff", ability: "PHASE SHIFT", ultimate: "DARK MIRROR", abilityDescription: "Slip out of sight and evade damage.", ultimateDescription: "Strike every rival from the shadows.", initials: "SL", stats: { power: 4, speed: 4, defense: 2 } },
  { id: "blaze", name: "Blaze Nova", role: "WILDFIRE ACE", color: "#ff755e", accent: "#ffbf75", ability: "FIRE BURST", ultimate: "SUPERNOVA", abilityDescription: "Pop a fiery burst around you.", ultimateDescription: "Scorch every rival in the blast radius.", initials: "BN", stats: { power: 5, speed: 3, defense: 2 } },
  { id: "frost", name: "Frost Warden", role: "GLACIAL SENTINEL", color: "#7dd9f5", accent: "#ccf4ff", ability: "ICE SLOW FIELD", ultimate: "WHITEOUT", abilityDescription: "Chill the arena and slow rivals.", ultimateDescription: "Freeze and damage every rival on the island.", initials: "FW", stats: { power: 3, speed: 3, defense: 4 } },
  { id: "aero", name: "Aero Wing", role: "SKY DANCER", color: "#54e4d4", accent: "#c5fff1", ability: "AERIAL LEAP", ultimate: "JETSTREAM", abilityDescription: "Vault ahead with a burst of air.", ultimateDescription: "Dive through the arena and strike all rivals.", initials: "AW", stats: { power: 3, speed: 5, defense: 2 } },
  { id: "terra", name: "Terra Core", role: "QUAKE MAKER", color: "#85d685", accent: "#d4f3a4", ability: "GROUND SLAM", ultimate: "FAULT LINE", abilityDescription: "Stagger close rivals with a ground slam.", ultimateDescription: "Crack the arena and strike every rival.", initials: "TC", stats: { power: 4, speed: 2, defense: 4 } },
  { id: "medic", name: "Pulse Medic", role: "FIELD HEALER", color: "#ff8fba", accent: "#ffd4e4", ability: "HEALING WAVE", ultimate: "SECOND WIND", abilityDescription: "Restore a portion of your health.", ultimateDescription: "Restore your health and shield completely.", initials: "PM", stats: { power: 2, speed: 4, defense: 3 } },
  { id: "neon", name: "Neon Phantom", role: "MIRAGE MAKER", color: "#ff7bd4", accent: "#ffcdf2", ability: "DECOY CLONE", ultimate: "PHANTOM SWARM", abilityDescription: "Confuse nearby rivals and gain a shield.", ultimateDescription: "Send a decoy wave through the arena.", initials: "NP", stats: { power: 3, speed: 4, defense: 3 } },
  { id: "solar", name: "Solar Guard", role: "STAR SENTINEL", color: "#ffd45d", accent: "#fff3a0", ability: "ENERGY BEAM", ultimate: "DAYBREAK", abilityDescription: "Fire a focused energy beam at a rival.", ultimateDescription: "Channel a blast into every rival in sight.", initials: "SG", stats: { power: 5, speed: 2, defense: 3 } },
];

export const WEAPON = { magSize: 10, reserveMax: 160, reloadSeconds: 1.2, fireInterval: 0.17, boltSpeed: 26 };

export type PickupType = "shield" | "ammo" | "health";

export type Pickup = {
  id: string;
  type: PickupType;
  x: number;
  z: number;
  label: string;
};

export const startingPickups: Pickup[] = [
  { id: "arc-cell", type: "shield", x: -6, z: -3, label: "SHIELD CELL" },
  { id: "supply-drop", type: "ammo", x: 5.2, z: -5.3, label: "AMMO CACHE" },
  { id: "med-kit", type: "health", x: 6.3, z: 4.8, label: "VITAL KIT" },
  { id: "cell-east", type: "shield", x: -10.5, z: 6.4, label: "SHIELD CELL" },
  { id: "cache-west", type: "ammo", x: -11.2, z: -6.8, label: "AMMO CACHE" },
  { id: "kit-north", type: "health", x: -2.2, z: -11.5, label: "VITAL KIT" },
  { id: "cache-south", type: "ammo", x: 10.8, z: 8.9, label: "AMMO CACHE" },
];

export type FighterPing = { x: number; z: number; health: number; color: string; name: string; alive: boolean };

export type ArenaStats = {
  health: number;
  shield: number;
  ammo: number;
  reserve: number;
  reloading: boolean;
  ultimate: number;
  abilitySeconds: number;
  alive: number;
  kills: number;
  zoneSeconds: number;
  zoneRadius: number;
  elapsed: number;
  playerX: number;
  playerZ: number;
  fighters: FighterPing[];
};

export const initialArenaStats = (): ArenaStats => ({
  health: 100,
  shield: 75,
  ammo: WEAPON.magSize,
  reserve: 90,
  reloading: false,
  ultimate: 0,
  abilitySeconds: 0,
  alive: 9,
  kills: 0,
  zoneSeconds: 16,
  zoneRadius: 17.5,
  elapsed: 0,
  playerX: 0,
  playerZ: 9,
  fighters: [],
});

export function applyDamage(stats: ArenaStats, rawDamage: number, bypassShield = false): ArenaStats {
  if (bypassShield) return { ...stats, health: Math.max(0, stats.health - rawDamage) };
  const shieldDamage = Math.min(stats.shield, rawDamage);
  return {
    ...stats,
    shield: stats.shield - shieldDamage,
    health: Math.max(0, stats.health - (rawDamage - shieldDamage)),
  };
}

export function countLivingBots(bots: { health: number }[]): number {
  return bots.filter((bot) => bot.health > 0).length;
}
