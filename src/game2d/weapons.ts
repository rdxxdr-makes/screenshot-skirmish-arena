export type WeaponId = "pistol" | "rifle" | "shotgun";

export type WeaponDef = {
  id: WeaponId;
  name: string;
  dmg: number;
  interval: number; // seconds between shots
  mag: number;
  reload: number; // seconds
  speed: number; // px/s
  spread: number; // radians, full cone
  pellets: number;
  barrel: number; // muzzle distance from shoulder
  auto: boolean;
};

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistol: {
    id: "pistol", name: "SIDEARM", dmg: 20, interval: 0.26, mag: 12, reload: 1.1,
    speed: 950, spread: 0.03, pellets: 1, barrel: 20, auto: true,
  },
  rifle: {
    id: "rifle", name: "RANGER RIFLE", dmg: 13, interval: 0.1, mag: 30, reload: 1.5,
    speed: 1080, spread: 0.07, pellets: 1, barrel: 30, auto: true,
  },
  shotgun: {
    id: "shotgun", name: "BOOM GUN", dmg: 11, interval: 0.85, mag: 6, reload: 1.9,
    speed: 860, spread: 0.34, pellets: 5, barrel: 26, auto: true,
  },
};

export const WEAPON_IDS: WeaponId[] = ["pistol", "rifle", "shotgun"];
