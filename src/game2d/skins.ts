export type Headgear = "helmet" | "cap" | "beret" | "gasmask" | "visor" | "bandana";

export type Skin = {
  id: number;
  name: string;
  color: string;
  dark: string;
  headgear: Headgear;
};

/** Ten distinct trooper slots: unique uniform color + unique headgear. */
export const SKINS: Skin[] = [
  { id: 0, name: "Volt", color: "#a7f34b", dark: "#6ba41f", headgear: "helmet" },
  { id: 1, name: "Rusty", color: "#ffac57", dark: "#c47420", headgear: "beret" },
  { id: 2, name: "Lynx", color: "#bd91ff", dark: "#7e53c9", headgear: "visor" },
  { id: 3, name: "Blaze", color: "#ff755e", dark: "#c93b28", headgear: "bandana" },
  { id: 4, name: "Frost", color: "#7dd9f5", dark: "#3a9cc4", headgear: "gasmask" },
  { id: 5, name: "Aero", color: "#54e4d4", dark: "#1fa294", headgear: "cap" },
  { id: 6, name: "Terra", color: "#85d685", dark: "#4a9c4b", headgear: "helmet" },
  { id: 7, name: "Medic", color: "#ff8fba", dark: "#d24f80", headgear: "cap" },
  { id: 8, name: "Neon", color: "#ff7bd4", dark: "#cf3ea3", headgear: "beret" },
  { id: 9, name: "Solar", color: "#ffd45d", dark: "#d19c1d", headgear: "gasmask" },
];

export function getSkin(id: number): Skin {
  return SKINS[((id % SKINS.length) + SKINS.length) % SKINS.length];
}
