export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateRoomCode(length = 6): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

export function normalizeRoomCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

export function isValidRoomCode(raw: string): boolean {
  const code = normalizeRoomCode(raw);
  return code.length === 6 && [...code].every((c) => CODE_ALPHABET.includes(c));
}

const TROOPER_NAMES = [
  "Rex", "Dax", "Milo", "Juno", "Piper", "Bolt", "Cobra", "Havoc", "Nitro", "Sable",
  "Rusty", "Echo", "Falcon", "Grit", "Hopper", "Iris", "Jax", "Kilo", "Loki", "Mango",
];

export function randomTrooperName(): string {
  const name = TROOPER_NAMES[Math.floor(Math.random() * TROOPER_NAMES.length)];
  return `${name}-${Math.floor(10 + Math.random() * 90)}`;
}
