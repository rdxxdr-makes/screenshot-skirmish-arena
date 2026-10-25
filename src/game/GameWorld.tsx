import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { ArenaStats, Hero, Pickup } from "./heroes";
import { applyDamage, countLivingBots, heroes, initialArenaStats, startingPickups } from "./heroes";

type Bot = { id: string; name: string; color: string; x: number; z: number; health: number; yaw: number; slow: number };
type ControlInput = { up: boolean; down: boolean; left: boolean; right: boolean; shooting: boolean; joystick: { x: number; y: number } };
export type GameActions = { useAbility: () => void; useUltimate: () => void; fire: () => void };

const INITIAL_BOTS: Bot[] = [
  { id: "bot-a", name: "Rift", color: "#fd865f", x: -8.5, z: -1.4, health: 100, yaw: 0, slow: 0 },
  { id: "bot-b", name: "Glitch", color: "#d18eff", x: 7.5, z: 1.2, health: 100, yaw: 0, slow: 0 },
  { id: "bot-c", name: "Knockout", color: "#68dadd", x: 1.4, z: -9.2, health: 100, yaw: 0, slow: 0 },
];
const FORWARD = new THREE.Vector3(0, 0, -1);
const RIGHT = new THREE.Vector3(1, 0, 0);
const CAMERA_OFFSET = new THREE.Vector3(0, 18, 25);
const CAMERA_LOOK = new THREE.Vector3();

function HeroFigure({ color, accent, scale = 1, bob = false }: { color: string; accent: string; scale?: number; bob?: boolean }) {
  const group = useRef<THREE.Group>(null);
  const cape = useRef<THREE.Mesh>(null);
  useFrame((state, delta) => {
    const node = group.current;
    if (!node) return;
    node.rotation.y += delta * 0.42;
    if (bob) node.position.y = 0.14 + Math.sin(state.clock.elapsedTime * 2.2) * 0.12;
    if (cape.current) cape.current.rotation.z = Math.sin(state.clock.elapsedTime * 1.8) * 0.06;
  });
  const suit = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.18, flatShading: true }), [color]);
  const light = useMemo(() => new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.45, roughness: 0.35 }), [accent]);
  return (
    <group ref={group} scale={scale}>
      <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.72, 0.035, 5, 22]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.1} />
      </mesh>
      <mesh position={[0, 1.1, 0]} castShadow material={suit}>
        <capsuleGeometry args={[0.37, 0.75, 4, 7]} />
      </mesh>
      <mesh position={[0, 1.88, 0]} castShadow material={suit}>
        <icosahedronGeometry args={[0.37, 1]} />
      </mesh>
      <mesh position={[0, 1.9, 0.33]} material={light}>
        <boxGeometry args={[0.3, 0.07, 0.05]} />
      </mesh>
      <mesh position={[-0.48, 1.15, 0]} rotation={[0, 0, -0.18]} castShadow material={suit}>
        <capsuleGeometry args={[0.13, 0.49, 3, 5]} />
      </mesh>
      <mesh position={[0.48, 1.15, 0]} rotation={[0, 0, 0.18]} castShadow material={suit}>
        <capsuleGeometry args={[0.13, 0.49, 3, 5]} />
      </mesh>
      <mesh position={[-0.21, 0.38, 0]} rotation={[0, 0, -0.06]} material={suit}>
        <capsuleGeometry args={[0.15, 0.55, 3, 5]} />
      </mesh>
      <mesh position={[0.21, 0.38, 0]} rotation={[0, 0, 0.06]} material={suit}>
        <capsuleGeometry args={[0.15, 0.55, 3, 5]} />
      </mesh>
      <mesh ref={cape} position={[0, 1.05, -0.35]} material={light}>
        <coneGeometry args={[0.5, 1.05, 5, 1]} />
      </mesh>
    </group>
  );
}

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

function HeroShowcase({ heroes, hero }: { heroes: Hero[]; hero: Hero }) {
  const selectedIndex = Math.max(0, heroes.findIndex(({ id }) => id === hero.id));
  return (
    <group>
      {heroes.map((item, index) => {
        const angle = (index / heroes.length) * Math.PI * 2 + Math.PI / 8;
        const radius = index === selectedIndex ? 5.5 : 9.6;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const isPicked = index === selectedIndex;
        return (
          <group key={item.id} position={[x, isPicked ? 0.32 : 0.06, z]}>
            <HoverPad position={[0, -0.35, 0]} color={item.color} size={isPicked ? 1.24 : 0.68} />
            <HeroFigure color={item.color} accent={item.accent} scale={isPicked ? 1.1 : 0.55} bob={isPicked} />
          </group>
        );
      })}
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
        <meshStandardMaterial color={tones[tone % tones.length]} flatShading roughness={1} />
      </mesh>
      <mesh position={[0, 2.52, 0]}>
        <coneGeometry args={[0.55, 1.18, 6]} />
        <meshStandardMaterial color={tones[(tone + 1) % tones.length]} flatShading roughness={1} />
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
  const ground = useRef<THREE.Mesh>(null);
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
      <mesh ref={ground} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.62, 0]} receiveShadow>
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

function DangerZone({ radius }: { radius: number }) {
  const ring = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ring.current) {
      const material = ring.current.material as THREE.MeshBasicMaterial;
      material.opacity = 0.44 + Math.sin(clock.elapsedTime * 3.1) * 0.14;
    }
  });
  return (
    <>
      <mesh position={[0, -0.38, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[radius, 48]} />
        <meshBasicMaterial color="#ec6048" transparent opacity={0.075} depthWrite={false} />
      </mesh>
      <mesh ref={ring} position={[0, -0.24, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[radius, 0.11, 6, 56]} />
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
      <pointLight position={[0, 0.7, 0]} color={color} intensity={2} distance={3} />
    </group>
  );
}

function BotModel({ bot, groupRef }: { bot: Bot; groupRef: (node: THREE.Group | null) => void }) {
  return (
    <group ref={groupRef} position={[bot.x, 0, bot.z]} rotation-y={bot.yaw}>
      <mesh position={[0, 1.04, 0]} castShadow>
        <capsuleGeometry args={[0.32, 0.68, 4, 6]} />
        <meshStandardMaterial color={bot.color} flatShading roughness={0.55} />
      </mesh>
      <mesh position={[0, 1.78, 0]} castShadow>
        <icosahedronGeometry args={[0.31, 1]} />
        <meshStandardMaterial color={bot.color} flatShading roughness={0.42} />
      </mesh>
      <mesh position={[0, 1.82, 0.29]}>
        <boxGeometry args={[0.25, 0.06, 0.05]} />
        <meshStandardMaterial color="#ecfff8" emissive="#ecfff8" emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[-0.4, 1.1, 0]} rotation={[0, 0, -0.12]}>
        <capsuleGeometry args={[0.12, 0.46, 3, 5]} />
        <meshStandardMaterial color={bot.color} flatShading />
      </mesh>
      <mesh position={[0.4, 1.1, 0]} rotation={[0, 0, 0.12]}>
        <capsuleGeometry args={[0.12, 0.46, 3, 5]} />
        <meshStandardMaterial color={bot.color} flatShading />
      </mesh>
      <mesh position={[0, 2.15, 0]}>
        <boxGeometry args={[1.25, 0.07, 0.08]} />
        <meshBasicMaterial color="#192934" />
      </mesh>
      <mesh position={[-0.6 + (Math.max(0, bot.health) / 100) * 0.6, 2.16, 0.02]}>
        <boxGeometry args={[(Math.max(0, bot.health) / 100) * 1.2, 0.045, 0.04]} />
        <meshBasicMaterial color="#c1fb77" />
      </mesh>
    </group>
  );
}

function ArenaWorld({ hero, phase, input, actionsRef, onStats, onNotice, onEnd }: {
  hero: Hero;
  phase: "home" | "select" | "playing" | "ended";
  input: React.RefObject<ControlInput>;
  actionsRef: React.RefObject<GameActions | null>;
  onStats: (stats: ArenaStats) => void;
  onNotice: (text: string) => void;
  onEnd: (result: "win" | "loss") => void;
}) {
  const player = useRef<THREE.Group>(null);
  const botMeshes = useRef(new Map<string, THREE.Group>());
  const botData = useRef<Bot[]>(INITIAL_BOTS.map((bot) => ({ ...bot })));
  const playerPosition = useRef(new THREE.Vector3(0, 0, 5));
  const mouseAim = useRef<THREE.Vector3 | null>(null);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const target = useMemo(() => new THREE.Vector3(), []);
  const direction = useMemo(() => new THREE.Vector3(), []);
  const aimScratch = useMemo(() => new THREE.Vector3(), []);
  const stats = useRef<ArenaStats>(initialArenaStats());
  const lastHud = useRef(0);
  const lastAttack = useRef(0);
  const lastFire = useRef(-1);
  const abilityCooldown = useRef(0);
  const ultimateReady = useRef(false);
  const slowBots = useRef(0);
  const invisibleUntil = useRef(0);
  const pickups = useRef<Pickup[]>(startingPickups.map((item) => ({ ...item })));
  const [visiblePickups, setVisiblePickups] = useState(startingPickups);
  const [dangerRadius, setDangerRadius] = useState(17.5);
  const mobile = useMemo(() => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches, []);
  const { camera, gl } = useThree();

  const inflict = (targetBot: Bot, damage: number) => {
    if (targetBot.health <= 0) return;
    targetBot.health = Math.max(0, targetBot.health - damage);
    stats.current.ultimate = Math.min(100, stats.current.ultimate + 8);
    if (targetBot.health === 0) {
      stats.current.alive = countLivingBots(botData.current);
      onNotice(`${targetBot.name} is out!`);
      if (stats.current.alive === 0) onEnd("win");
    }
  };

  const nearestBot = (range: number) => {
    let nearest: Bot | undefined;
    let closestDistance = range;
    for (const bot of botData.current) {
      if (bot.health <= 0) continue;
      const distance = Math.hypot(bot.x - playerPosition.current.x, bot.z - playerPosition.current.z);
      if (distance < closestDistance) { closestDistance = distance; nearest = bot; }
    }
    return nearest;
  };

  const fire = () => {
    if (phase !== "playing" || stats.current.ammo < 1) return;
    const chosen = nearestBot(16);
    if (chosen) {
      const botDirection = new THREE.Vector3(chosen.x - playerPosition.current.x, 0, chosen.z - playerPosition.current.z).normalize();
      const aim = mouseAim.current
        ? new THREE.Vector3(mouseAim.current.x - playerPosition.current.x, 0, mouseAim.current.z - playerPosition.current.z).normalize()
        : botDirection;
      if (aim.dot(botDirection) > 0.3) inflict(chosen, hero.id === "solar" ? 25 : 20);
      else onNotice("Adjust your aim toward a rival");
    }
    stats.current.ammo -= 1;
    lastFire.current = performance.now();
    if (!chosen) onNotice("No rival in range");
  };

  const useAbility = () => {
    if (phase !== "playing" || abilityCooldown.current > 0) return;
    abilityCooldown.current = 7;
    const playerNode = player.current;
    const nearby = botData.current.filter((bot) => bot.health > 0 && Math.hypot(bot.x - playerPosition.current.x, bot.z - playerPosition.current.z) < 6.2);
    const forward = playerNode ? new THREE.Vector3(Math.sin(playerNode.rotation.y), 0, Math.cos(playerNode.rotation.y)) : new THREE.Vector3(0, 0, -1);
    switch (hero.id) {
      case "volt": case "aero":
        playerPosition.current.addScaledVector(forward, 4.2);
        playerPosition.current.x = THREE.MathUtils.clamp(playerPosition.current.x, -15, 15);
        playerPosition.current.z = THREE.MathUtils.clamp(playerPosition.current.z, -15, 15);
        for (const bot of nearby) inflict(bot, 28);
        onNotice(hero.id === "volt" ? "Electricity dash!" : "Aerial leap!");
        break;
      case "titan": case "shadow": case "neon":
        stats.current.shield = Math.min(100, stats.current.shield + (hero.id === "titan" ? 46 : 30));
        if (hero.id === "shadow") invisibleUntil.current = performance.now() + 2100;
        for (const bot of nearby) if (hero.id === "neon") bot.slow = 2.5;
        onNotice(hero.id === "titan" ? "Shield wall up!" : hero.id === "shadow" ? "Phase shift!" : "Decoy clone deployed!");
        break;
      case "blaze": case "terra": case "frost":
        for (const bot of nearby) { inflict(bot, hero.id === "blaze" ? 38 : 27); if (hero.id === "frost") bot.slow = 4.2; }
        onNotice(hero.id === "blaze" ? "Fire burst!" : hero.id === "frost" ? "Ice field!" : "Ground slam!");
        break;
      case "medic":
        stats.current.health = Math.min(100, stats.current.health + 38);
        onNotice("Healing wave! +38 health");
        break;
      case "solar": {
        const bot = nearestBot(18);
        if (bot) inflict(bot, 55);
        onNotice(bot ? "Energy beam!" : "Energy beam — no rival in range");
        break;
      }
    }
    onStats({ ...stats.current });
  };

  const useUltimate = () => {
    if (phase !== "playing" || stats.current.ultimate < 100) return;
    stats.current.ultimate = 0;
    ultimateReady.current = false;
    if (hero.id === "medic") {
      stats.current.health = 100;
      stats.current.shield = 100;
    } else {
      const range = hero.id === "solar" || hero.id === "shadow" ? 18 : 10;
      for (const bot of botData.current) {
        if (bot.health > 0 && Math.hypot(bot.x - playerPosition.current.x, bot.z - playerPosition.current.z) < range) inflict(bot, 45);
      }
    }
    onNotice(hero.ultimate);
    onStats({ ...stats.current });
  };

  useEffect(() => {
    if (!actionsRef.current) return;
    actionsRef.current.fire = fire;
    actionsRef.current.useAbility = useAbility;
    actionsRef.current.useUltimate = useUltimate;
  });

  useEffect(() => {
    if (phase !== "playing") return;
    botData.current = INITIAL_BOTS.map((bot) => ({ ...bot }));
    pickups.current = startingPickups.map((item) => ({ ...item }));
    setVisiblePickups(pickups.current);
    stats.current = initialArenaStats();
    playerPosition.current.set(0, 0, 5);
    abilityCooldown.current = 0;
    ultimateReady.current = false;
    slowBots.current = 0;
    invisibleUntil.current = 0;
    lastAttack.current = 0;
    lastFire.current = -1;
    setDangerRadius(17.5);
    onStats({ ...stats.current });
  }, [phase, onStats]);

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const playing = phase === "playing";
    if (!player.current) return;
    const playerNode = player.current;
    if (playing) {
      const controls = input.current;
      const fwd = (controls.up ? 1 : 0) - (controls.down ? 1 : 0) - controls.joystick.y;
      const strafe = (controls.right ? 1 : 0) - (controls.left ? 1 : 0) + controls.joystick.x;
      camera.getWorldDirection(FORWARD);
      FORWARD.y = 0;
      FORWARD.normalize();
      RIGHT.crossVectors(FORWARD, camera.up).normalize();
      direction.set(0, 0, 0).addScaledVector(FORWARD, fwd).addScaledVector(RIGHT, strafe);
      if (direction.lengthSq() > 0.01) {
        direction.normalize();
        playerPosition.current.addScaledVector(direction, dt * (hero.id === "aero" ? 7.5 : 6.2));
        playerPosition.current.x = THREE.MathUtils.clamp(playerPosition.current.x, -16, 16);
        playerPosition.current.z = THREE.MathUtils.clamp(playerPosition.current.z, -16, 16);
      }
      if (mouseAim.current) {
        aimScratch.set(mouseAim.current.x - playerPosition.current.x, 0, mouseAim.current.z - playerPosition.current.z);
        if (aimScratch.lengthSq() > 0.05) playerNode.rotation.y = Math.atan2(aimScratch.x, aimScratch.z);
      } else if (direction.lengthSq() > 0.01) {
        playerNode.rotation.y = Math.atan2(direction.x, direction.z);
      }
      const firing = controls.shooting || (lastFire.current >= 0 && performance.now() - lastFire.current > 260 && performance.now() - lastFire.current < 500);
      if (firing && performance.now() - lastFire.current > 280) fire();
      stats.current.elapsed += dt;
      stats.current.zoneSeconds = Math.max(0, 62 - Math.floor(Math.max(0, stats.current.elapsed - 18) * 1.4));
      abilityCooldown.current = Math.max(0, abilityCooldown.current - dt);
      slowBots.current = Math.max(0, slowBots.current - dt);
      setDangerRadius((current) => THREE.MathUtils.lerp(current, 9.2, dt * 0.006));
      const radius = 17.5 - Math.max(0, stats.current.elapsed - 18) * 0.12;
      const outsideZone = Math.hypot(playerPosition.current.x, playerPosition.current.z) > Math.max(8.8, radius);
      if (outsideZone) {
        stats.current = applyDamage(stats.current, dt * 7, true);
        if (Math.floor(stats.current.elapsed * 2) % 2 === 0 && Math.floor((stats.current.elapsed - dt) * 2) !== Math.floor(stats.current.elapsed * 2)) onNotice("Outside the danger zone!");
      }
      for (const bot of botData.current) {
        const mesh = botMeshes.current.get(bot.id);
        if (!mesh || bot.health <= 0) { if (mesh) mesh.visible = false; continue; }
        mesh.visible = true;
        const dx = playerPosition.current.x - bot.x;
        const dz = playerPosition.current.z - bot.z;
        const distance = Math.hypot(dx, dz);
        if (distance > 1.9) {
          const speed = bot.slow > 0 ? 1.2 : 2.25;
          bot.x += (dx / Math.max(distance, 0.001)) * speed * dt;
          bot.z += (dz / Math.max(distance, 0.001)) * speed * dt;
          bot.yaw = Math.atan2(dx, dz);
          mesh.position.set(bot.x, 0, bot.z);
          mesh.rotation.y = bot.yaw;
        } else if (performance.now() - lastAttack.current > 850 && performance.now() > invisibleUntil.current) {
          stats.current = applyDamage(stats.current, 11);
          lastAttack.current = performance.now();
          onNotice("A rival landed a hit!");
        }
      }
      const remaining: Pickup[] = [];
      for (const item of pickups.current) {
        if (Math.hypot(item.x - playerPosition.current.x, item.z - playerPosition.current.z) < 1.5) {
          if (item.type === "shield") stats.current.shield = Math.min(100, stats.current.shield + 35);
          if (item.type === "ammo") stats.current.ammo = Math.min(48, stats.current.ammo + 18);
          if (item.type === "health") stats.current.health = Math.min(100, stats.current.health + 35);
          onNotice(`${item.label} collected`);
        } else remaining.push(item);
      }
      if (remaining.length !== pickups.current.length) {
        pickups.current = remaining;
        setVisiblePickups(remaining);
      }
      if (stats.current.health <= 0) onEnd("loss");
      if (stats.current.ultimate >= 100 && !ultimateReady.current) {
        ultimateReady.current = true;
        onNotice("Ultimate ready");
      }
      if (performance.now() - lastHud.current > 120) {
        onStats({ ...stats.current });
        lastHud.current = performance.now();
      }
    }
    playerNode.position.copy(playerPosition.current);
    if (phase === "home") {
      playerNode.position.set(0, 0.28, 0);
      playerNode.rotation.y += dt * 0.12;
      CAMERA_LOOK.set(0, 0.6, 0);
    } else if (phase === "select") {
      playerNode.position.set(0, -40, 0);
      CAMERA_LOOK.set(0, 0.2, 0);
    } else {
      CAMERA_LOOK.set(playerPosition.current.x, 0.7, playerPosition.current.z - 1.2);
    }
    if (phase === "select") {
      target.set(0, 11, 24);
      camera.position.lerp(target, 1 - Math.exp(-2.5 * dt));
      camera.lookAt(CAMERA_LOOK);
    } else {
      target.copy(CAMERA_LOOK).add(CAMERA_OFFSET);
      camera.position.lerp(target, 1 - Math.exp(-3.6 * dt));
      camera.lookAt(CAMERA_LOOK);
    }
  });

  const aimAtPointer = (event: { clientX: number; clientY: number }) => {
    if (phase !== "playing") return;
    const rect = gl.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const intersection = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(plane, intersection)) mouseAim.current = intersection;
  };

  return (
    <>
      <WorldEnvironment arena={phase === "playing" || phase === "ended"} />
      {(phase === "playing" || phase === "ended") && <DangerZone radius={dangerRadius} />}
      {phase === "select" ? <HeroShowcase heroes={heroes} hero={hero} /> : (
        <>
          <group ref={player} position={[0, 0, 5]}>
            <HeroFigure color={hero.color} accent={hero.accent} scale={1.07} />
            {stats.current.shield > 0 && phase === "playing" && (
              <mesh position={[0, 1.3, 0]}>
                <sphereGeometry args={[0.9, 12, 8]} />
                <meshBasicMaterial color="#76deef" transparent opacity={0.12} side={THREE.DoubleSide} />
              </mesh>
            )}
          </group>
          {botData.current.map((bot) => (
            <BotModel key={bot.id} bot={bot} groupRef={(node) => { if (node) botMeshes.current.set(bot.id, node); else botMeshes.current.delete(bot.id); }} />
          ))}
          {visiblePickups.map((pickup) => <PickupOrb key={pickup.id} pickup={pickup} />)}
        </>
      )}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.57, 0]} onPointerMove={(event) => aimAtPointer(event)} onPointerDown={(event) => aimAtPointer(event)}>
        <circleGeometry args={[16.8, 20]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </>
  );
}

export function GameWorld({ hero, phase, input, actionsRef, onStats, onNotice, onEnd }: {
  hero: Hero;
  phase: "home" | "select" | "playing" | "ended";
  input: React.RefObject<ControlInput>;
  actionsRef: React.RefObject<GameActions | null>;
  onStats: (stats: ArenaStats) => void;
  onNotice: (text: string) => void;
  onEnd: (result: "win" | "loss") => void;
}) {
  return (
    <Canvas shadows camera={{ position: [0, 18, 25], fov: 44 }} dpr={[1, 1.5]} gl={{ antialias: true }}>
      <ArenaWorld hero={hero} phase={phase} input={input} actionsRef={actionsRef} onStats={onStats} onNotice={onNotice} onEnd={onEnd} />
    </Canvas>
  );
}
