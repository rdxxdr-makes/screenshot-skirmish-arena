import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { ArenaStats, FighterPing, Hero, Pickup } from "./heroes";
import { heroes, initialArenaStats, startingPickups, WEAPON, applyDamage } from "./heroes";

export type ControlInput = {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  sprint: boolean;
  jumpQueued: boolean;
  shooting: boolean;
  joystick: { x: number; y: number };
};

export type GameActions = {
  fire: () => void;
  useAbility: () => void;
  useUltimate: () => void;
  reload: () => void;
};

type HeroMotion = { speed: number; attack: number; flash: number };
const freshMotion = (): HeroMotion => ({ speed: 0, attack: -9999, flash: 0 });

type Fighter = {
  id: string;
  heroId: string;
  name: string;
  color: string;
  accent: string;
  isPlayer: boolean;
  x: number;
  z: number;
  y: number;
  vy: number;
  yaw: number;
  health: number;
  slow: number;
  targetId: string | null;
  roamX: number;
  roamZ: number;
  roamAt: number;
  nextShot: number;
  nextMelee: number;
};

type Bolt = { active: boolean; x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; owner: string; damage: number; hostile: boolean };
type Impact = { active: boolean; x: number; z: number; t: number; big: boolean };

const BOLT_POOL = 40;
const IMPACT_POOL = 16;
const ZONE_GRACE = 16;
const ZONE_FROM = 17.5;
const ZONE_TO = 5;
const ZONE_SHRINK_SECONDS = 85;
const PLAYER_SPEED = 6.2;
const SPRINT_MULT = 1.5;
const JUMP_VELOCITY = 7.4;
const GRAVITY = 20;
const BOT_SPEED = 3.1;
const BOT_AGGRO = 14;

function heroById(id: string): Hero {
  return heroes.find((hero) => hero.id === id) ?? heroes[0]!;
}

function createFighters(playerHero: Hero): Fighter[] {
  const fighters: Fighter[] = [];
  const base = Math.PI * 0.5;
  let slot = 0;
  for (const item of heroes) {
    const isPlayer = item.id === playerHero.id;
    const angle = base + (slot / heroes.length) * Math.PI * 2;
    const radius = isPlayer ? 9 : 12.5;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    fighters.push({
      id: isPlayer ? "player" : `bot-${item.id}`,
      heroId: item.id,
      name: isPlayer ? "You" : item.name,
      color: item.color,
      accent: item.accent,
      isPlayer,
      x, z, y: 0, vy: 0,
      yaw: Math.atan2(-x, -z),
      health: 100, slow: 0,
      targetId: null,
      roamX: x, roamZ: z, roamAt: 0, nextShot: 0, nextMelee: 0,
    });
    slot++;
  }
  return fighters;
}

const freshBolts = (): Bolt[] => Array.from({ length: BOLT_POOL }, () => ({ active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, owner: "", damage: 0, hostile: false }));
const freshImpacts = (): Impact[] => Array.from({ length: IMPACT_POOL }, () => ({ active: false, x: 0, z: 0, t: 0, big: false }));

// ---------- Distinct hero model ----------

type HeroLook = {
  head: "visor" | "crown" | "hood" | "horned" | "bubble" | "helm";
  weapon: "blaster" | "cannon" | "staff" | "hammer" | "blade" | "orb";
  pads: boolean;
  cape: "none" | "cape" | "wings";
  bulk: number;
  tall: number;
  antenna: boolean;
};

const LOOKS: Record<string, HeroLook> = {
  volt: { head: "visor", weapon: "blaster", pads: false, cape: "none", bulk: 0.92, tall: 0.97, antenna: true },
  titan: { head: "horned", weapon: "hammer", pads: true, cape: "none", bulk: 1.24, tall: 1.07, antenna: false },
  shadow: { head: "hood", weapon: "blade", pads: false, cape: "cape", bulk: 0.94, tall: 0.96, antenna: false },
  blaze: { head: "crown", weapon: "cannon", pads: true, cape: "none", bulk: 1.06, tall: 1.0, antenna: false },
  frost: { head: "helm", weapon: "staff", pads: true, cape: "none", bulk: 1.0, tall: 1.02, antenna: false },
  aero: { head: "bubble", weapon: "blade", pads: false, cape: "wings", bulk: 0.88, tall: 0.94, antenna: true },
  terra: { head: "horned", weapon: "hammer", pads: true, cape: "none", bulk: 1.18, tall: 1.05, antenna: false },
  medic: { head: "bubble", weapon: "staff", pads: false, cape: "none", bulk: 0.98, tall: 0.99, antenna: false },
  neon: { head: "crown", weapon: "orb", pads: false, cape: "cape", bulk: 0.95, tall: 0.98, antenna: true },
  solar: { head: "helm", weapon: "staff", pads: true, cape: "none", bulk: 1.04, tall: 1.03, antenna: true },
};

function HeroModel({ hero, scale = 1, bob = false, spin = false, motion }: {
  hero: Hero;
  scale?: number;
  bob?: boolean;
  spin?: boolean;
  motion?: React.RefObject<HeroMotion>;
}) {
  const look = LOOKS[hero.id] ?? LOOKS["volt"]!;
  const group = useRef<THREE.Group>(null);
  const leftLeg = useRef<THREE.Group>(null);
  const rightLeg = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);
  const muzzle = useRef<THREE.Mesh>(null);
  const orbRef = useRef<THREE.Mesh>(null);
  const suit = useMemo(() => new THREE.MeshStandardMaterial({ color: hero.color, roughness: 0.48, metalness: 0.18, flatShading: true, emissive: hero.color, emissiveIntensity: 0 }), [hero.color]);
  const trim = useMemo(() => new THREE.MeshStandardMaterial({ color: hero.accent, emissive: hero.accent, emissiveIntensity: 0.55, roughness: 0.35 }), [hero.accent]);
  const dark = useMemo(() => new THREE.MeshStandardMaterial({ color: "#22333d", roughness: 0.7, flatShading: true }), []);

  useFrame((state, delta) => {
    const node = group.current;
    if (!node) return;
    const t = state.clock.elapsedTime;
    const m = motion?.current;
    const speed = m ? m.speed : 0;
    const stride = Math.min(1, speed / 6);
    const swing = Math.sin(t * (5 + speed * 1.7)) * 0.9 * stride;
    if (leftLeg.current) leftLeg.current.rotation.x = swing;
    if (rightLeg.current) rightLeg.current.rotation.x = -swing;
    if (leftArm.current) leftArm.current.rotation.x = -swing * 0.65;
    if (rightArm.current) {
      const since = m ? performance.now() - m.attack : 99999;
      const recoil = since < 200 ? -(1 - since / 200) * 1.15 : 0;
      rightArm.current.rotation.x = swing * 0.65 + recoil;
      if (muzzle.current) muzzle.current.visible = since < 90;
    }
    if (spin) node.rotation.y += delta * 0.45;
    const baseY = bob ? 0.1 + Math.sin(t * 2.2) * 0.07 : 0;
    node.position.y = baseY + (m ? Math.abs(Math.sin(t * (5 + speed * 1.7))) * stride * 0.08 : 0);
    if (m && m.flash > 0) {
      m.flash = Math.max(0, m.flash - delta * 3.4);
      suit.emissiveIntensity = m.flash * 0.9;
    } else if (m) suit.emissiveIntensity = 0;
    if (orbRef.current) {
      orbRef.current.rotation.y += delta * 2;
      orbRef.current.position.y = 1.32 + Math.sin(t * 2.6) * 0.09;
    }
  });

  const bulk = look.bulk;
  const hipY = 0.78;
  return (
    <group ref={group} scale={scale}>
      {/* legs */}
      <group ref={leftLeg} position={[-0.16 * bulk, hipY, 0]}>
        <mesh position={[0, -0.36, 0]} castShadow material={suit}>
          <capsuleGeometry args={[0.13, 0.46, 3, 5]} />
        </mesh>
        <mesh position={[0, -0.68, 0.06]} material={dark}>
          <boxGeometry args={[0.2, 0.12, 0.32]} />
        </mesh>
      </group>
      <group ref={rightLeg} position={[0.16 * bulk, hipY, 0]}>
        <mesh position={[0, -0.36, 0]} castShadow material={suit}>
          <capsuleGeometry args={[0.13, 0.46, 3, 5]} />
        </mesh>
        <mesh position={[0, -0.68, 0.06]} material={dark}>
          <boxGeometry args={[0.2, 0.12, 0.32]} />
        </mesh>
      </group>
      {/* torso */}
      <mesh position={[0, 1.22 * look.tall, 0]} castShadow material={suit}>
        <capsuleGeometry args={[0.33 * bulk, 0.6, 4, 6]} />
      </mesh>
      <mesh position={[0, 1.32 * look.tall, 0.3 * bulk]} material={trim}>
        <boxGeometry args={[0.2, 0.2, 0.06]} />
      </mesh>
      {look.pads && (
        <>
          <mesh position={[-0.44 * bulk, 1.5 * look.tall, 0]} castShadow material={dark}>
            <icosahedronGeometry args={[0.18, 0]} />
          </mesh>
          <mesh position={[0.44 * bulk, 1.5 * look.tall, 0]} castShadow material={dark}>
            <icosahedronGeometry args={[0.18, 0]} />
          </mesh>
        </>
      )}
      {/* arms */}
      <group ref={leftArm} position={[-0.48 * bulk, 1.44 * look.tall, 0]}>
        <mesh position={[0, -0.3, 0]} castShadow material={suit}>
          <capsuleGeometry args={[0.11, 0.42, 3, 5]} />
        </mesh>
      </group>
      <group ref={rightArm} position={[0.48 * bulk, 1.44 * look.tall, 0]}>
        <mesh position={[0, -0.3, 0]} castShadow material={suit}>
          <capsuleGeometry args={[0.11, 0.42, 3, 5]} />
        </mesh>
        <WeaponMesh look={look} hero={hero} muzzleRef={muzzle} />
      </group>
      {/* head */}
      <HeadMesh look={look} hero={hero} suit={suit} trim={trim} />
      {look.cape === "cape" && (
        <mesh position={[0, 1.1 * look.tall, -0.34]} material={trim}>
          <coneGeometry args={[0.46, 1.0, 5, 1]} />
        </mesh>
      )}
      {look.cape === "wings" && (
        <>
          <mesh position={[-0.42, 1.5 * look.tall, -0.3]} rotation={[0, 0.5, 0.7]} material={trim}>
            <tetrahedronGeometry args={[0.42, 0]} />
          </mesh>
          <mesh position={[0.42, 1.5 * look.tall, -0.3]} rotation={[0, -0.5, -0.7]} material={trim}>
            <tetrahedronGeometry args={[0.42, 0]} />
          </mesh>
        </>
      )}
      {look.weapon === "orb" && (
        <mesh ref={orbRef} position={[-0.5, 1.32, 0.24]} material={trim}>
          <icosahedronGeometry args={[0.16, 0]} />
        </mesh>
      )}
    </group>
  );
}

function WeaponMesh({ look, hero, muzzleRef }: { look: HeroLook; hero: Hero; muzzleRef: React.RefObject<THREE.Mesh | null> }) {
  const metal = useMemo(() => new THREE.MeshStandardMaterial({ color: "#2c3f4a", roughness: 0.42, metalness: 0.55, flatShading: true }), []);
  const glow = useMemo(() => new THREE.MeshStandardMaterial({ color: hero.accent, emissive: hero.accent, emissiveIntensity: 1.1, roughness: 0.3 }), [hero.accent]);
  if (look.weapon === "blaster") {
    return (
      <group position={[0, -0.58, 0.14]}>
        <mesh material={metal}><boxGeometry args={[0.09, 0.13, 0.4]} /></mesh>
        <mesh position={[0, 0.02, 0.28]} rotation={[Math.PI / 2, 0, 0]} material={metal}><cylinderGeometry args={[0.035, 0.035, 0.2, 6]} /></mesh>
        <mesh position={[0, 0.02, 0.4]} material={glow}><boxGeometry args={[0.05, 0.05, 0.06]} /></mesh>
        <mesh ref={muzzleRef} position={[0, 0.02, 0.5]} visible={false} material={glow}>
          <sphereGeometry args={[0.11, 6, 5]} />
        </mesh>
      </group>
    );
  }
  if (look.weapon === "cannon") {
    return (
      <group position={[0, -0.56, 0.16]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} material={metal}><cylinderGeometry args={[0.08, 0.1, 0.56, 7]} /></mesh>
        <mesh position={[0, 0, 0.3]} rotation={[Math.PI / 2, 0, 0]} material={glow}><torusGeometry args={[0.1, 0.025, 4, 10]} /></mesh>
        <mesh ref={muzzleRef} position={[0, 0, 0.36]} visible={false} material={glow}>
          <sphereGeometry args={[0.13, 6, 5]} />
        </mesh>
      </group>
    );
  }
  if (look.weapon === "staff") {
    return (
      <group position={[0, -0.5, 0.08]} rotation={[0.25, 0, 0]}>
        <mesh material={metal}><cylinderGeometry args={[0.032, 0.032, 1.15, 5]} /></mesh>
        <mesh position={[0, 0.64, 0]} material={glow}><icosahedronGeometry args={[0.13, 0]} /></mesh>
        <mesh ref={muzzleRef} position={[0, 0.8, 0]} visible={false} material={glow}>
          <sphereGeometry args={[0.12, 6, 5]} />
        </mesh>
      </group>
    );
  }
  if (look.weapon === "hammer") {
    return (
      <group position={[0, -0.52, 0.05]} rotation={[0.5, 0, 0]}>
        <mesh material={metal}><cylinderGeometry args={[0.035, 0.035, 0.78, 5]} /></mesh>
        <mesh position={[0, 0.42, 0]} material={metal}><boxGeometry args={[0.4, 0.2, 0.2]} /></mesh>
        <mesh position={[0, 0.42, 0.11]} material={glow}><boxGeometry args={[0.34, 0.06, 0.03]} /></mesh>
        <mesh ref={muzzleRef} position={[0, 0.42, 0.2]} visible={false} material={glow}>
          <sphereGeometry args={[0.12, 6, 5]} />
        </mesh>
      </group>
    );
  }
  if (look.weapon === "blade") {
    return (
      <group position={[0, -0.52, 0.1]} rotation={[0.45, 0, 0]}>
        <mesh material={metal}><boxGeometry args={[0.07, 0.16, 0.12]} /></mesh>
        <mesh position={[0, 0.1, 0.3]} material={glow}><boxGeometry args={[0.045, 0.05, 0.72]} /></mesh>
        <mesh ref={muzzleRef} position={[0, 0.1, 0.68]} visible={false} material={glow}>
          <sphereGeometry args={[0.09, 6, 5]} />
        </mesh>
      </group>
    );
  }
  // orb carrier: empty hand, orb floats separately
  return null;
}

function HeadMesh({ look, hero, suit, trim }: { look: HeroLook; hero: Hero; suit: THREE.Material; trim: THREE.Material }) {
  const y = 1.82;
  if (look.head === "visor") {
    return (
      <group position={[0, y, 0]}>
        <mesh castShadow material={suit}><icosahedronGeometry args={[0.31, 1]} /></mesh>
        <mesh position={[0, 0.02, 0.26]} material={trim}><boxGeometry args={[0.36, 0.1, 0.08]} /></mesh>
        {look.antenna && (
          <>
            <mesh position={[0.16, 0.36, 0]} material={trim}><cylinderGeometry args={[0.014, 0.014, 0.3, 4]} /></mesh>
            <mesh position={[0.16, 0.53, 0]} material={trim}><sphereGeometry args={[0.045, 5, 4]} /></mesh>
          </>
        )}
      </group>
    );
  }
  if (look.head === "crown") {
    return (
      <group position={[0, y, 0]}>
        <mesh castShadow material={suit}><icosahedronGeometry args={[0.3, 1]} /></mesh>
        <mesh position={[0, 0.02, 0.25]} material={trim}><boxGeometry args={[0.3, 0.07, 0.07]} /></mesh>
        <mesh position={[0, 0.32, 0]} rotation={[Math.PI / 2, 0, 0]} material={trim}><torusGeometry args={[0.24, 0.035, 4, 10]} /></mesh>
        <mesh position={[0, 0.46, 0]} material={trim}><coneGeometry args={[0.07, 0.16, 5]} /></mesh>
      </group>
    );
  }
  if (look.head === "hood") {
    return (
      <group position={[0, y, 0]}>
        <mesh castShadow material={suit}><icosahedronGeometry args={[0.29, 1]} /></mesh>
        <mesh position={[0, 0.12, -0.05]} material={trim}><coneGeometry args={[0.4, 0.62, 6]} /></mesh>
        <mesh position={[-0.09, -0.02, 0.24]} material={trim}><boxGeometry args={[0.07, 0.05, 0.04]} /></mesh>
        <mesh position={[0.09, -0.02, 0.24]} material={trim}><boxGeometry args={[0.07, 0.05, 0.04]} /></mesh>
      </group>
    );
  }
  if (look.head === "horned") {
    return (
      <group position={[0, y + 0.04, 0]}>
        <mesh castShadow material={suit}><boxGeometry args={[0.52, 0.5, 0.48]} /></mesh>
        <mesh position={[0, 0.04, 0.25]} material={trim}><boxGeometry args={[0.4, 0.09, 0.06]} /></mesh>
        <mesh position={[-0.34, 0.2, 0]} rotation={[0, 0, 0.8]} material={trim}><coneGeometry args={[0.07, 0.3, 5]} /></mesh>
        <mesh position={[0.34, 0.2, 0]} rotation={[0, 0, -0.8]} material={trim}><coneGeometry args={[0.07, 0.3, 5]} /></mesh>
      </group>
    );
  }
  if (look.head === "bubble") {
    return (
      <group position={[0, y, 0]}>
        <mesh castShadow material={suit}><sphereGeometry args={[0.32, 10, 8]} /></mesh>
        <mesh position={[0, 0.03, 0.24]} material={trim}><boxGeometry args={[0.34, 0.12, 0.1]} /></mesh>
        {look.antenna && (
          <>
            <mesh position={[-0.16, 0.38, 0]} material={trim}><cylinderGeometry args={[0.014, 0.014, 0.28, 4]} /></mesh>
            <mesh position={[-0.16, 0.54, 0]} material={trim}><sphereGeometry args={[0.045, 5, 4]} /></mesh>
          </>
        )}
      </group>
    );
  }
  // helm
  return (
    <group position={[0, y, 0]}>
      <mesh castShadow material={suit}><cylinderGeometry args={[0.28, 0.3, 0.44, 7]} /></mesh>
      <mesh position={[0, 0.02, 0.26]} material={trim}><boxGeometry args={[0.38, 0.1, 0.08]} /></mesh>
      <mesh position={[0, 0.28, 0]} material={trim}><boxGeometry args={[0.08, 0.12, 0.4]} /></mesh>
      {look.antenna && (
        <>
          <mesh position={[0.2, 0.34, -0.06]} material={trim}><cylinderGeometry args={[0.014, 0.014, 0.26, 4]} /></mesh>
          <mesh position={[0.2, 0.49, -0.06]} material={trim}><sphereGeometry args={[0.04, 5, 4]} /></mesh>
        </>
      )}
    </group>
  );
}

// ---------- Environment (existing look preserved) ----------

function HoverPad({ position, color, size = 1 }: { position: [number, number, number]; color: string; size?: number }) {
  const ring = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (ring.current) ring.current.rotation.y += delta * 0.65;
  });
  return (
    <group position={position}>
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[1.08 * size, 1.12 * size, 0.16, 7]} />
        <meshStandardMaterial color="#243e4b" flatShading roughness={0.88} />
      </mesh>
      <mesh ref={ring} position={[0, 0.15, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.85 * size, 0.035 * size, 5, 20]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.15} />
      </mesh>
    </group>
  );
}

function LowTree({ position, tone = 0 }: { position: [number, number, number]; tone?: number }) {
  const tones = ["#456d50", "#5e8060", "#718257"];
  return (
    <group position={position}>
      <mesh position={[0, 0.8, 0]}>
        <cylinderGeometry args={[0.12, 0.2, 1.6, 5]} />
        <meshStandardMaterial color="#765c45" flatShading />
      </mesh>
      <mesh position={[0, 1.7, 0]}>
        <coneGeometry args={[0.8, 1.65, 6]} />
        <meshStandardMaterial color={tones[tone % tones.length]!} flatShading roughness={1} />
      </mesh>
      <mesh position={[0, 2.52, 0]}>
        <coneGeometry args={[0.55, 1.18, 6]} />
        <meshStandardMaterial color={tones[(tone + 1) % tones.length]!} flatShading roughness={1} />
      </mesh>
    </group>
  );
}

function SupplyCrate({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.55, 0]} castShadow>
        <boxGeometry args={[1.15, 1.05, 1.05]} />
        <meshStandardMaterial color="#ed9d4e" flatShading roughness={0.72} />
      </mesh>
      <mesh position={[0, 0.56, 0.54]}>
        <boxGeometry args={[0.16, 0.8, 0.04]} />
        <meshStandardMaterial color="#ffe1a0" flatShading />
      </mesh>
      <mesh position={[0, 0.56, -0.54]}>
        <boxGeometry args={[0.16, 0.8, 0.04]} />
        <meshStandardMaterial color="#ffe1a0" flatShading />
      </mesh>
    </group>
  );
}

function WorldEnvironment({ arena = false }: { arena?: boolean }) {
  const rocks: [number, number, number, number][] = [
    [-11.5, 0.4, -6.5, 1.15], [-10.5, 0.45, 5, 1.5], [11.2, 0.38, -4.9, 1.05], [10.4, 0.42, 7, 1.45], [-3.8, 0.4, 11.4, 0.92], [4.1, 0.5, -11.2, 1.28],
  ];
  return (
    <>
      <color attach="background" args={["#122735"]} />
      <fog attach="fog" args={["#122735", 38, 66]} />
      <hemisphereLight args={["#c7ecff", "#42593e", 1.25]} />
      <ambientLight intensity={0.42} />
      <directionalLight position={[8, 16, 11]} intensity={2.1} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
      <pointLight position={[-9, 9, -4]} color="#9eff62" intensity={30} distance={31} />
      <pointLight position={[8, 7, 9]} color="#47d9ec" intensity={24} distance={29} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.62, 0]} receiveShadow>
        <circleGeometry args={[20, 20]} />
        <meshStandardMaterial color="#317653" flatShading roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.93, 0]}>
        <cylinderGeometry args={[19.9, 17.5, 0.72, 16]} />
        <meshStandardMaterial color="#1e7383" flatShading roughness={0.72} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.3, 0]}>
        <cylinderGeometry args={[17.65, 15.5, 0.35, 16]} />
        <meshStandardMaterial color="#335369" flatShading roughness={1} />
      </mesh>
      {rocks.map(([x, y, z, scale], i) => (
        <mesh key={`rock-${i}`} position={[x, y, z]} scale={[scale, scale * 0.72, scale * 0.94]} castShadow>
          <dodecahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color={i % 2 ? "#82918a" : "#697e79"} flatShading roughness={1} />
        </mesh>
      ))}
      {arena && <ArenaProps />}
      {!arena && (
        <>
          <LowTree position={[-12, 0, -9]} tone={0} />
          <LowTree position={[12.5, 0, 8]} tone={1} />
          <LowTree position={[11, 0, -9]} tone={2} />
          <SupplyCrate position={[-8, -0.55, -9]} />
        </>
      )}
    </>
  );
}

function ArenaProps() {
  return (
    <>
      <LowTree position={[-12, -0.55, -9]} tone={1} />
      <LowTree position={[12.2, -0.55, 7.4]} tone={0} />
      <LowTree position={[10.9, -0.55, -9.2]} tone={2} />
      <LowTree position={[-10.3, -0.55, 9.5]} tone={1} />
      <LowTree position={[2.4, -0.55, 12.4]} tone={0} />
      <SupplyCrate position={[-7, -0.55, -8]} />
      <SupplyCrate position={[8.4, -0.55, -7.4]} />
      <SupplyCrate position={[7.4, -0.55, 8.5]} />
      <mesh position={[-8.9, 0.22, 0.7]} rotation={[0.2, 0.5, -0.1]}>
        <dodecahedronGeometry args={[0.8, 0]} />
        <meshStandardMaterial color="#8c9790" flatShading />
      </mesh>
      <mesh position={[9.1, 0.28, -1.4]} rotation={[0.1, 0.2, 0.2]}>
        <dodecahedronGeometry args={[0.95, 0]} />
        <meshStandardMaterial color="#687c7b" flatShading />
      </mesh>
    </>
  );
}

function DangerZone({ radiusRef }: { radiusRef: React.RefObject<number> }) {
  const ring = useRef<THREE.Mesh>(null);
  const fill = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const radius = Math.max(4, radiusRef.current ?? ZONE_FROM);
    if (ring.current) {
      ring.current.scale.set(radius, radius, 1);
      const material = ring.current.material as THREE.MeshBasicMaterial;
      material.opacity = 0.44 + Math.sin(clock.elapsedTime * 3.1) * 0.14;
    }
    if (fill.current) fill.current.scale.set(radius, radius, 1);
  });
  return (
    <>
      <mesh ref={fill} position={[0, -0.38, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1, 48]} />
        <meshBasicMaterial color="#ec6048" transparent opacity={0.075} depthWrite={false} />
      </mesh>
      <mesh ref={ring} position={[0, -0.24, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1, 0.028, 6, 64]} />
        <meshBasicMaterial color="#ff7257" transparent depthWrite={false} />
      </mesh>
    </>
  );
}

function PickupOrb({ pickup }: { pickup: Pickup }) {
  const orb = useRef<THREE.Mesh>(null);
  const color = pickup.type === "shield" ? "#82ecff" : pickup.type === "ammo" ? "#ffe06d" : "#a9f178";
  useFrame(({ clock }) => {
    if (orb.current) {
      orb.current.position.y = 0.8 + Math.sin(clock.elapsedTime * 2.2 + pickup.x) * 0.12;
      orb.current.rotation.y += 0.013;
    }
  });
  return (
    <group position={[pickup.x, 0, pickup.z]}>
      <mesh ref={orb} position={[0, 0.8, 0]}>
        <icosahedronGeometry args={[0.38, 1]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.95} flatShading />
      </mesh>
      <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.48, 0.045, 5, 18]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.7} />
      </mesh>
    </group>
  );
}

function HeroShowcase({ selectedId }: { selectedId: string }) {
  return (
    <group>
      {heroes.map((item, index) => {
        const selected = item.id === selectedId;
        const angle = (index / heroes.length) * Math.PI * 2;
        const position: [number, number, number] = selected ? [0, 0.3, 7.4] : [Math.cos(angle) * 8.4, 0.06, Math.sin(angle) * 8.4];
        return (
          <group key={item.id} position={position}>
            <HoverPad position={[0, -0.35, 0]} color={item.color} size={selected ? 1.2 : 0.72} />
            <HeroModel hero={item} scale={selected ? 1.18 : 0.82} bob={selected} spin={!selected} />
          </group>
        );
      })}
    </group>
  );
}

// ---------- Pools ----------

const BOLT_DIR = new THREE.Vector3();
const BOLT_AXIS = new THREE.Vector3(0, 1, 0);

function BoltLayer({ pool }: { pool: React.RefObject<Bolt[]> }) {
  const meshes = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(() => {
    const list = pool.current;
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      const bolt = list[i]!;
      const mesh = meshes.current[i];
      if (!mesh) continue;
      if (!bolt.active) { mesh.visible = false; continue; }
      mesh.visible = true;
      mesh.position.set(bolt.x, bolt.y, bolt.z);
      BOLT_DIR.set(bolt.vx, bolt.vy, bolt.vz).normalize();
      mesh.quaternion.setFromUnitVectors(BOLT_AXIS, BOLT_DIR);
      const material = mesh.material as THREE.MeshBasicMaterial;
      material.color.set(bolt.hostile ? "#ff8266" : "#fff1a0");
    }
  });
  return (
    <>
      {Array.from({ length: BOLT_POOL }, (_, i) => (
        <mesh key={i} ref={(node) => { meshes.current[i] = node; }} visible={false}>
          <capsuleGeometry args={[0.06, 0.4, 3, 6]} />
          <meshBasicMaterial color="#fff1a0" />
        </mesh>
      ))}
    </>
  );
}

function ImpactLayer({ pool }: { pool: React.RefObject<Impact[]> }) {
  const meshes = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(() => {
    const list = pool.current;
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      const impact = list[i]!;
      const mesh = meshes.current[i];
      if (!mesh) continue;
      if (!impact.active) { mesh.visible = false; continue; }
      mesh.visible = true;
      const growth = 0.4 + impact.t * (impact.big ? 7 : 3.4);
      mesh.position.set(impact.x, 0.25, impact.z);
      mesh.scale.set(growth, growth, growth);
      const material = mesh.material as THREE.MeshBasicMaterial;
      material.opacity = Math.max(0, 0.85 - impact.t * 2.4);
    }
  });
  return (
    <>
      {Array.from({ length: IMPACT_POOL }, (_, i) => (
        <mesh key={i} ref={(node) => { meshes.current[i] = node; }} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
          <torusGeometry args={[1, 0.05, 5, 22]} />
          <meshBasicMaterial color="#ffe06d" transparent depthWrite={false} />
        </mesh>
      ))}
    </>
  );
}

// ---------- Fighters ----------

function FighterModel({ fighter, hero, motion, bind }: {
  fighter: Fighter;
  hero: Hero;
  motion: React.RefObject<HeroMotion>;
  bind: (group: THREE.Group | null, fill: THREE.Mesh | null) => void;
}) {
  const group = useRef<THREE.Group>(null);
  const fill = useRef<THREE.Mesh>(null);
  useEffect(() => {
    bind(group.current, fill.current);
    return () => bind(null, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <group ref={group} position={[fighter.x, 0, fighter.z]} rotation-y={fighter.yaw}>
      <HeroModel hero={hero} motion={motion} />
      <group position={[0, 2.52, 0]}>
        <mesh>
          <boxGeometry args={[1.14, 0.085, 0.06]} />
          <meshBasicMaterial color="#17242c" />
        </mesh>
        <mesh ref={fill} position={[0, 0, 0.045]}>
          <boxGeometry args={[1.06, 0.05, 0.05]} />
          <meshBasicMaterial color={hero.color} />
        </mesh>
      </group>
    </group>
  );
}

function ReadySignal() {
  const { gl } = useThree();
  const done = useRef(false);
  useFrame(() => {
    if (done.current) return;
    done.current = true;
    gl.domElement.parentElement?.setAttribute("data-scene-ready", "true");
  });
  return null;
}

// ---------- Arena simulation ----------

function ArenaWorld({ hero, phase, paused, input, actionsRef, onStats, onNotice, onEnd, matchId }: {
  hero: Hero;
  phase: "home" | "select" | "playing" | "ended";
  paused: boolean;
  input: React.RefObject<ControlInput>;
  actionsRef: React.RefObject<GameActions | null>;
  onStats: (stats: ArenaStats) => void;
  onNotice: (text: string) => void;
  onEnd: (result: "win" | "loss", placement: number) => void;
  matchId: number;
}) {
  const playerNode = useRef<THREE.Group>(null);
  const shieldBubble = useRef<THREE.Mesh>(null);
  const nodeMap = useRef(new Map<string, { group: THREE.Group; fill: THREE.Mesh }>());
  const motions = useRef(new Map<string, HeroMotion>());
  const fighters = useRef<Fighter[]>(createFighters(hero));
  const bolts = useRef<Bolt[]>(freshBolts());
  const impacts = useRef<Impact[]>(freshImpacts());
  const zoneRadius = useRef(ZONE_FROM);
  const stats = useRef<ArenaStats>(initialArenaStats());
  const lastHud = useRef(0);
  const lastFire = useRef(-1);
  const abilityCooldown = useRef(0);
  const invisibleUntil = useRef(0);
  const reloadUntil = useRef(0);
  const pickups = useRef<Pickup[]>(startingPickups.map((item) => ({ ...item })));
  const [visiblePickups, setVisiblePickups] = useState<Pickup[]>(startingPickups);
  const mouseAim = useRef<THREE.Vector3 | null>(null);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const aimHit = useMemo(() => new THREE.Vector3(), []);
  const aimDir = useMemo(() => new THREE.Vector3(), []);
  const tmpDir = useMemo(() => new THREE.Vector3(), []);
  const target = useMemo(() => new THREE.Vector3(), []);
  const cameraLook = useMemo(() => new THREE.Vector3(), []);
  const { camera, gl } = useThree();

  const bindFighter = (id: string) => (group: THREE.Group | null, fill: THREE.Mesh | null) => {
    if (group && fill) nodeMap.current.set(id, { group, fill });
    else nodeMap.current.delete(id);
  };

  const motionOf = (id: string): HeroMotion => {
    let motion = motions.current.get(id);
    if (!motion) { motion = freshMotion(); motions.current.set(id, motion); }
    return motion;
  };

  const aliveBots = () => fighters.current.filter((f) => !f.isPlayer && f.health > 0).length;

  const spawnImpact = (x: number, z: number, big: boolean) => {
    const slot = impacts.current.find((entry) => !entry.active) ?? impacts.current[0]!;
    slot.active = true;
    slot.x = x;
    slot.z = z;
    slot.t = 0;
    slot.big = big;
  };

  const spawnBolt = (owner: Fighter, tx: number, ty: number, tz: number, speed: number, damage: number, hostile: boolean, jitter: number) => {
    const slot = bolts.current.find((entry) => !entry.active);
    if (!slot) return;
    const y = owner.y + 1.35;
    tmpDir.set(tx - owner.x, ty - y, tz - owner.z);
    if (tmpDir.lengthSq() < 0.001) tmpDir.set(0, 0, -1);
    tmpDir.normalize();
    tmpDir.x += (Math.random() - 0.5) * jitter;
    tmpDir.y += (Math.random() - 0.5) * jitter * 0.4;
    tmpDir.z += (Math.random() - 0.5) * jitter;
    tmpDir.normalize();
    slot.active = true;
    slot.x = owner.x + tmpDir.x * 0.6;
    slot.y = y + tmpDir.y * 0.6;
    slot.z = owner.z + tmpDir.z * 0.6;
    slot.vx = tmpDir.x * speed;
    slot.vy = tmpDir.y * speed;
    slot.vz = tmpDir.z * speed;
    slot.life = 1.6;
    slot.owner = owner.id;
    slot.damage = damage;
    slot.hostile = hostile;
  };

  const eliminate = (victim: Fighter, killerId: string) => {
    victim.health = 0;
    spawnImpact(victim.x, victim.z, true);
    const killer = fighters.current.find((f) => f.id === killerId);
    if (killer?.isPlayer) {
      stats.current.kills += 1;
      stats.current.ultimate = Math.min(100, stats.current.ultimate + 30);
      onNotice(`You eliminated ${victim.name}!`);
    } else {
      onNotice(`${killer ? killer.name : "The storm"} eliminated ${victim.name}`);
    }
    stats.current.alive = aliveBots();
    if (stats.current.alive === 0 && stats.current.health > 0) onEnd("win", 1);
  };

  const applyBoltHit = (victim: Fighter, bolt: Bolt) => {
    if (victim.isPlayer) {
      stats.current = applyDamage(stats.current, bolt.damage);
      onNotice("You took a hit!");
      if (stats.current.health <= 0) onEnd("loss", aliveBots() + 1);
      return;
    }
    victim.health = Math.max(0, victim.health - bolt.damage);
    if (victim.health === 0) {
      eliminate(victim, bolt.owner);
    } else if (bolt.owner === "player") {
      stats.current.ultimate = Math.min(100, stats.current.ultimate + 5);
    }
  };

  const fire = () => {
    if (phase !== "playing" || paused) return;
    const now = performance.now();
    const player = fighters.current.find((f) => f.isPlayer)!;
    if (stats.current.reloading) { onNotice("Reloading..."); return; }
    if (now - lastFire.current < WEAPON.fireInterval * 1000) return;
    if (stats.current.ammo < 1) { onNotice("Out of ammo — press R to reload"); return; }
    lastFire.current = now;
    stats.current.ammo -= 1;
    motionOf("player").attack = now;
    // gentle aim assist toward a fighter close to the aim line
    let aimX: number, aimZ: number;
    if (mouseAim.current) { aimX = mouseAim.current.x; aimZ = mouseAim.current.z; }
    else { aimX = player.x + Math.sin(player.yaw) * 10; aimZ = player.z + Math.cos(player.yaw) * 10; }
    aimDir.set(aimX - player.x, 0, aimZ - player.z).normalize();
    let assisted: Fighter | undefined;
    let bestDot = 0.94;
    for (const bot of fighters.current) {
      if (bot.isPlayer || bot.health <= 0) continue;
      tmpDir.set(bot.x - player.x, 0, bot.z - player.z).normalize();
      const dot = tmpDir.dot(aimDir);
      if (dot > bestDot && Math.hypot(bot.x - player.x, bot.z - player.z) < 32) { bestDot = dot; assisted = bot; }
    }
    if (assisted) spawnBolt(player, assisted.x, assisted.y + 1.1, assisted.z, WEAPON.boltSpeed, 15 + heroById(assisted.heroId).stats.power * 2, false, 0);
    else spawnBolt(player, player.x + aimDir.x * 12, player.y + 1.1, player.z + aimDir.z * 12, WEAPON.boltSpeed, 15 + hero.stats.power * 2, false, 0);
    spawnImpact(assisted ? assisted.x : player.x + aimDir.x * 8, assisted ? assisted.z : player.z + aimDir.z * 8, false);
  };

  const reload = () => {
    if (phase !== "playing" || paused) return;
    if (stats.current.reloading || stats.current.reserve <= 0 || stats.current.ammo >= WEAPON.magSize) return;
    stats.current.reloading = true;
    reloadUntil.current = performance.now() + WEAPON.reloadSeconds * 1000;
    onNotice("Reloading...");
  };

  const useAbility = () => {
    if (phase !== "playing" || paused || abilityCooldown.current > 0) return;
    abilityCooldown.current = 7;
    const player = fighters.current.find((f) => f.isPlayer)!;
    const nearby = fighters.current.filter((bot) => !bot.isPlayer && bot.health > 0 && Math.hypot(bot.x - player.x, bot.z - player.z) < 6.2);
    const forward = tmpDir.set(Math.sin(player.yaw), 0, Math.cos(player.yaw));
    switch (hero.id) {
      case "volt": case "aero": {
        player.x = THREE.MathUtils.clamp(player.x + forward.x * 4.2, -15, 15);
        player.z = THREE.MathUtils.clamp(player.z + forward.z * 4.2, -15, 15);
        for (const bot of nearby) { bot.health = Math.max(0, bot.health - 28); motionOf(bot.id).flash = 1; if (bot.health === 0) eliminate(bot, "player"); }
        onNotice(hero.id === "volt" ? "Electricity dash!" : "Aerial leap!");
        break;
      }
      case "titan": case "shadow": case "neon": {
        stats.current.shield = Math.min(100, stats.current.shield + (hero.id === "titan" ? 46 : 30));
        if (hero.id === "shadow") invisibleUntil.current = performance.now() + 2400;
        if (hero.id === "neon") for (const bot of nearby) bot.slow = 2.5;
        onNotice(hero.id === "titan" ? "Shield wall up!" : hero.id === "shadow" ? "Phase shift!" : "Decoy clone deployed!");
        break;
      }
      case "blaze": case "terra": case "frost": {
        for (const bot of nearby) {
          bot.health = Math.max(0, bot.health - (hero.id === "blaze" ? 38 : 27));
          motionOf(bot.id).flash = 1;
          if (hero.id === "frost") bot.slow = 4.2;
          if (bot.health === 0) eliminate(bot, "player");
        }
        onNotice(hero.id === "blaze" ? "Fire burst!" : hero.id === "frost" ? "Ice field!" : "Ground slam!");
        break;
      }
      case "medic": {
        stats.current.health = Math.min(100, stats.current.health + 38);
        onNotice("Healing wave! +38 health");
        break;
      }
      case "solar": {
        let nearest: Fighter | undefined;
        let closest = 18;
        for (const bot of fighters.current) {
          if (bot.isPlayer || bot.health <= 0) continue;
          const distance = Math.hypot(bot.x - player.x, bot.z - player.z);
          if (distance < closest) { closest = distance; nearest = bot; }
        }
        if (nearest) {
          spawnBolt(player, nearest.x, nearest.y + 1.1, nearest.z, 40, 55, false, 0);
          onNotice("Energy beam!");
        } else onNotice("Energy beam — no rival in range");
        break;
      }
    }
  };

  const useUltimate = () => {
    if (phase !== "playing" || paused || stats.current.ultimate < 100) return;
    stats.current.ultimate = 0;
    const player = fighters.current.find((f) => f.isPlayer)!;
    if (hero.id === "medic") {
      stats.current.health = 100;
      stats.current.shield = 100;
    } else {
      const range = hero.id === "solar" || hero.id === "shadow" ? 18 : 10;
      for (const bot of fighters.current) {
        if (bot.isPlayer || bot.health <= 0) continue;
        if (Math.hypot(bot.x - player.x, bot.z - player.z) < range) {
          bot.health = Math.max(0, bot.health - 45);
          motionOf(bot.id).flash = 1;
          if (bot.health === 0) eliminate(bot, "player");
        }
      }
    }
    onNotice(hero.ultimate);
  };

  useEffect(() => {
    if (!actionsRef.current) return;
    actionsRef.current.fire = fire;
    actionsRef.current.useAbility = useAbility;
    actionsRef.current.useUltimate = useUltimate;
    actionsRef.current.reload = reload;
  });

  // new match state
  useEffect(() => {
    fighters.current = createFighters(hero);
    motions.current.clear();
    bolts.current = freshBolts();
    impacts.current = freshImpacts();
    pickups.current = startingPickups.map((item) => ({ ...item }));
    setVisiblePickups(pickups.current);
    stats.current = initialArenaStats();
    zoneRadius.current = ZONE_FROM;
    abilityCooldown.current = 0;
    invisibleUntil.current = 0;
    reloadUntil.current = 0;
    lastFire.current = -1;
    mouseAim.current = null;
    nodeMap.current.forEach(({ group, fill }) => {
      group.visible = true;
      fill.scale.set(1, 1, 1);
      fill.position.x = 0;
    });
    onStats({ ...stats.current });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  // mouse aim + click-to-fire on the canvas
  useEffect(() => {
    const canvas = gl.domElement;
    const aimAt = (event: PointerEvent) => {
      if (phase !== "playing" || paused) return;
      const rect = canvas.getBoundingClientRect();
      const pointer = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      if (raycaster.ray.intersectPlane(plane, aimHit)) mouseAim.current = aimHit.clone();
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 0) return;
      aimAt(event);
      if (phase === "playing" && !paused) input.current.shooting = true;
    };
    const up = () => { input.current.shooting = false; };
    const context = (event: MouseEvent) => event.preventDefault();
    canvas.addEventListener("pointermove", aimAt);
    canvas.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    canvas.addEventListener("contextmenu", context);
    return () => {
      canvas.removeEventListener("pointermove", aimAt);
      canvas.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      canvas.removeEventListener("contextmenu", context);
    };
  }, [gl, camera, raycaster, plane, aimHit, phase, paused, input]);

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const playing = phase === "playing";
    const player = fighters.current.find((f) => f.isPlayer)!;

    if (playing && !paused) {
      const now = performance.now();
      const controls = input.current;
      stats.current.elapsed += dt;

      // storm
      const shrinkT = Math.max(0, stats.current.elapsed - ZONE_GRACE);
      zoneRadius.current = Math.max(ZONE_TO, ZONE_FROM - (shrinkT / ZONE_SHRINK_SECONDS) * (ZONE_FROM - ZONE_TO));
      stats.current.zoneRadius = zoneRadius.current;
      stats.current.zoneSeconds = stats.current.elapsed < ZONE_GRACE
        ? Math.ceil(ZONE_GRACE - stats.current.elapsed)
        : Math.max(0, Math.ceil(ZONE_SHRINK_SECONDS - shrinkT));

      // player movement (camera relative)
      const fwd = (controls.up ? 1 : 0) - (controls.down ? 1 : 0) - controls.joystick.y;
      const strafe = (controls.right ? 1 : 0) - (controls.left ? 1 : 0) + controls.joystick.x;
      camera.getWorldDirection(FORWARD);
      FORWARD.y = 0;
      FORWARD.normalize();
      RIGHT.crossVectors(FORWARD, camera.up).normalize();
      direction.set(0, 0, 0).addScaledVector(FORWARD, fwd).addScaledVector(RIGHT, strafe);
      const moving = direction.lengthSq() > 0.01;
      if (moving) {
        direction.normalize();
        const speed = PLAYER_SPEED * (hero.id === "aero" ? 1.2 : 1) * (controls.sprint ? SPRINT_MULT : 1);
        player.x += direction.x * speed * dt;
        player.z += direction.z * speed * dt;
      }
      // jump
      if (controls.jumpQueued && player.y <= 0.01) { player.vy = JUMP_VELOCITY; controls.jumpQueued = false; }
      controls.jumpQueued = false;
      if (player.y > 0 || player.vy !== 0) {
        player.vy -= GRAVITY * dt;
        player.y = Math.max(0, player.y + player.vy * dt);
        if (player.y === 0) player.vy = 0;
      }
      // circular arena clamp
      const radial = Math.hypot(player.x, player.z);
      if (radial > 15.5) { player.x *= 15.5 / radial; player.z *= 15.5 / radial; }
      motionOf("player").speed = moving ? PLAYER_SPEED * (controls.sprint ? SPRINT_MULT : 1) : 0;
      // facing: toward mouse aim, else movement direction
      if (mouseAim.current) {
        tmpDir.set(mouseAim.current.x - player.x, 0, mouseAim.current.z - player.z);
        if (tmpDir.lengthSq() > 0.05) player.yaw = Math.atan2(tmpDir.x, tmpDir.z);
      } else if (moving) {
        player.yaw = Math.atan2(direction.x, direction.z);
      }

      // hold to fire
      if (controls.shooting) fire();

      // reload completion
      if (stats.current.reloading && now > reloadUntil.current) {
        const need = WEAPON.magSize - stats.current.ammo;
        const take = Math.min(need, stats.current.reserve);
        stats.current.ammo += take;
        stats.current.reserve -= take;
        stats.current.reloading = false;
      }

      abilityCooldown.current = Math.max(0, abilityCooldown.current - dt);
      stats.current.abilitySeconds = Math.ceil(abilityCooldown.current);

      // bots
      for (const bot of fighters.current) {
        if (bot.isPlayer || bot.health <= 0) continue;
        const seen = performance.now() < invisibleUntil.current;
        // pick target
        let targetFighter: Fighter | undefined;
        let closest = BOT_AGGRO;
        for (const other of fighters.current) {
          if (other.id === bot.id || other.health <= 0) continue;
          if (other.isPlayer && seen) continue;
          const distance = Math.hypot(other.x - bot.x, other.z - bot.z);
          if (distance < closest) { closest = distance; targetFighter = other; }
        }
        let tx: number, tz: number;
        if (targetFighter) { tx = targetFighter.x; tz = targetFighter.z; }
        else {
          if (now > bot.roamAt || Math.hypot(bot.roamX - bot.x, bot.roamZ - bot.z) < 0.8) {
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * Math.max(4, zoneRadius.current - 3);
            bot.roamX = Math.cos(angle) * radius;
            bot.roamZ = Math.sin(angle) * radius;
            bot.roamAt = now + 3200 + Math.random() * 2600;
          }
          tx = bot.roamX; tz = bot.roamZ;
        }
        // storm avoidance overrides
        const distCenter = Math.hypot(bot.x, bot.z);
        if (distCenter > zoneRadius.current - 1.5) { tx = bot.x * 0.15; tz = bot.z * 0.15; }
        const dx = tx - bot.x;
        const dz = tz - bot.z;
        const distance = Math.hypot(dx, dz);
        if (distance > 0.05) bot.yaw = Math.atan2(dx, dz);
        let botSpeed = bot.slow > 0 ? 1.3 : BOT_SPEED;
        let walked = false;
        const keepRange = targetFighter ? 2.1 : 0.6;
        if (distance > keepRange) {
          const step = Math.min(distance, botSpeed * dt);
          bot.x += (dx / distance) * step;
          bot.z += (dz / distance) * step;
          walked = true;
          const botRadial = Math.hypot(bot.x, bot.z);
          if (botRadial > 15.5) { bot.x *= 15.5 / botRadial; bot.z *= 15.5 / botRadial; }
        }
        motionOf(bot.id).speed = walked ? botSpeed : 0;
        bot.slow = Math.max(0, bot.slow - dt);
        if (targetFighter) {
          if (closest < 2.3 && now > bot.nextMelee) {
            bot.nextMelee = now + 1100;
            motionOf(bot.id).attack = now;
            if (targetFighter.isPlayer) {
              stats.current = applyDamage(stats.current, 9);
              onNotice("A rival landed a hit!");
              if (stats.current.health <= 0) onEnd("loss", aliveBots() + 1);
            } else {
              targetFighter.health = Math.max(0, targetFighter.health - 9);
              if (targetFighter.health === 0) eliminate(targetFighter, bot.id);
            }
          } else if (closest < 12.5 && now > bot.nextShot) {
            bot.nextShot = now + 1500 + Math.random() * 900;
            motionOf(bot.id).attack = now;
            const power = heroById(bot.heroId).stats.power;
            spawnBolt(bot, targetFighter.x, targetFighter.y + 1.1, targetFighter.z, 13, 9 + power, true, 0.09);
          }
        }
      }

      // bolts
      for (const bolt of bolts.current) {
        if (!bolt.active) continue;
        bolt.life -= dt;
        bolt.x += bolt.vx * dt;
        bolt.y += bolt.vy * dt;
        bolt.z += bolt.vz * dt;
        let hit: Fighter | undefined;
        for (const f of fighters.current) {
          if (f.health <= 0 || f.id === bolt.owner) continue;
          if ((f.x - bolt.x) ** 2 + (f.z - bolt.z) ** 2 < 0.85 && Math.abs(bolt.y - (f.y + 1.05)) < 1.25) { hit = f; break; }
        }
        if (hit) {
          bolt.active = false;
          motionOf(hit.id).flash = 1;
          spawnImpact(hit.x, hit.z, false);
          applyBoltHit(hit, bolt);
        } else if (bolt.life <= 0 || bolt.y < 0.05 || Math.hypot(bolt.x, bolt.z) > 21) {
          bolt.active = false;
        }
      }

      // impacts
      for (const impact of impacts.current) {
        if (!impact.active) continue;
        impact.t += dt;
        if (impact.t > 0.5) impact.active = false;
      }

      // storm damage
      for (const f of fighters.current) {
        if (f.health <= 0) continue;
        if (Math.hypot(f.x, f.z) > zoneRadius.current) {
          if (f.isPlayer) {
            stats.current = applyDamage(stats.current, dt * 8, true);
            if (stats.current.health <= 0) onEnd("loss", aliveBots() + 1);
          } else {
            f.health -= dt * 10;
            if (f.health <= 0) eliminate(f, "storm");
          }
        }
      }

      // pickups (player only)
      const remaining: Pickup[] = [];
      for (const item of pickups.current) {
        if (Math.hypot(item.x - player.x, item.z - player.z) < 1.5) {
          if (item.type === "shield") stats.current.shield = Math.min(100, stats.current.shield + 35);
          if (item.type === "ammo") stats.current.reserve = Math.min(WEAPON.reserveMax, stats.current.reserve + 40);
          if (item.type === "health") stats.current.health = Math.min(100, stats.current.health + 35);
          onNotice(`${item.label} collected`);
        } else remaining.push(item);
      }
      if (remaining.length !== pickups.current.length) {
        pickups.current = remaining;
        setVisiblePickups(remaining);
      }

      if (stats.current.ultimate >= 100 && stats.current.ultimate - dt * 0 < 100) { /* charged */ }

      // sync world nodes
      nodeMap.current.forEach((entry, id) => {
        const fighter = fighters.current.find((f) => f.id === id);
        if (!fighter) return;
        entry.group.visible = fighter.health > 0;
        entry.group.position.set(fighter.x, fighter.y, fighter.z);
        entry.group.rotation.y = fighter.yaw;
        const ratio = Math.max(0, fighter.health) / 100;
        entry.fill.scale.x = ratio;
        entry.fill.position.x = -(1.06 * (1 - ratio)) / 2;
      });
      if (shieldBubble.current) shieldBubble.current.visible = stats.current.shield > 0;

      // HUD sync (throttled)
      if (now - lastHud.current > 120) {
        lastHud.current = now;
        const pings: FighterPing[] = fighters.current.map((f) => ({ x: f.x, z: f.z, health: f.health, color: f.color, name: f.name, alive: f.health > 0 }));
        onStats({ ...stats.current, playerX: player.x, playerZ: player.z, fighters: pings });
      }
    }

    // player world transform (all phases)
    if (playerNode.current && (phase === "playing" || phase === "ended")) {
      playerNode.current.position.set(player.x, player.y, player.z);
      playerNode.current.rotation.y = player.yaw;
    }

    // camera
    if (phase === "home") {
      cameraLook.set(0, 0.8, 0);
      target.set(0, 7.5, 15);
    } else if (phase === "select") {
      cameraLook.set(0, 0.9, 1.5);
      target.set(0, 10.5, 24.5);
    } else {
      cameraLook.set(player.x, 0.9, player.z - 1.2);
      target.copy(cameraLook).add(CAMERA_OFFSET);
    }
    camera.position.lerp(target, 1 - Math.exp(-3.4 * dt));
    camera.lookAt(cameraLook);
  });

  const player = fighters.current.find((f) => f.isPlayer)!;

  return (
    <>
      <ReadySignal />
      <WorldEnvironment arena={phase === "playing" || phase === "ended"} />
      {(phase === "playing" || phase === "ended") && <DangerZone radiusRef={zoneRadius} />}
      {phase === "select" ? (
        <HeroShowcase selectedId={hero.id} />
      ) : (
        <>
          {(phase === "playing" || phase === "ended") ? (
            <>
              {fighters.current.map((fighter) => (
                <FighterModel
                  key={`${matchId}-${fighter.id}`}
                  fighter={fighter}
                  hero={heroById(fighter.heroId)}
                  motion={motionRefFor(fighter.id, motions)}
                  bind={bindFighter(fighter.id)}
                />
              ))}
              <mesh ref={shieldBubble} position={[player.x, 1.25, player.z]} visible={false}>
                <sphereGeometry args={[0.95, 12, 8]} />
                <meshBasicMaterial color="#76deef" transparent opacity={0.14} side={THREE.DoubleSide} />
              </mesh>
              {visiblePickups.map((pickup) => <PickupOrb key={pickup.id} pickup={pickup} />)}
              <BoltLayer pool={bolts} />
              <ImpactLayer pool={impacts} />
            </>
          ) : (
            <group ref={playerNode} position={[0, 0.1, 0]}>
              <HeroModel hero={hero} bob spin />
            </group>
          )}
        </>
      )}
    </>
  );
}

function motionRefFor(id: string, motions: React.RefObject<Map<string, HeroMotion>>): React.RefObject<HeroMotion> {
  // lightweight wrapper ref so each FighterModel reads its own motion object
  const wrapper = { current: null as HeroMotion | null } as React.RefObject<HeroMotion>;
  Object.defineProperty(wrapper, "current", {
    get: () => {
      let motion = motions.current?.get(id);
      if (!motion) {
        motion = freshMotion();
        motions.current?.set(id, motion);
      }
      return motion!;
    },
  });
  return wrapper;
}

const FORWARD = new THREE.Vector3(0, 0, -1);
const RIGHT = new THREE.Vector3(1, 0, 0);
const direction = new THREE.Vector3();
const CAMERA_OFFSET = new THREE.Vector3(0, 17, 22);

export function GameWorld({ hero, phase, paused, input, actionsRef, onStats, onNotice, onEnd }: {
  hero: Hero;
  phase: "home" | "select" | "playing" | "ended";
  paused: boolean;
  input: React.RefObject<ControlInput>;
  actionsRef: React.RefObject<GameActions | null>;
  onStats: (stats: ArenaStats) => void;
  onNotice: (text: string) => void;
  onEnd: (result: "win" | "loss", placement: number) => void;
}) {
  const [matchId, setMatchId] = useState(0);
  useEffect(() => {
    if (phase === "playing") setMatchId((current) => current + 1);
  }, [phase]);
  return (
    <div className="h-full w-full">
      <Canvas shadows camera={{ position: [0, 18, 25], fov: 44 }} dpr={[1, 1.5]} gl={{ antialias: true }} style={{ touchAction: "none" }}>
        <ArenaWorld
          hero={hero}
          phase={phase}
          paused={paused}
          input={input}
          actionsRef={actionsRef}
          onStats={onStats}
          onNotice={onNotice}
          onEnd={onEnd}
          matchId={matchId}
        />
      </Canvas>
    </div>
  );
}
