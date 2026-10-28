import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GameWorld, type GameActions } from "./GameWorld";
import { heroes, initialArenaStats, type ArenaStats, type Hero } from "./heroes";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Crosshair, Heart, Info, MoveUpRight, Shield, Sparkles, Target, Trophy, Zap } from "lucide-react";

type Phase = "home" | "select" | "playing" | "ended";
type Controls = { up: boolean; down: boolean; left: boolean; right: boolean; sprint: boolean; jumpQueued: boolean; shooting: boolean; joystick: { x: number; y: number } };

const HERO_TONES: Record<string, string> = {
  volt: "text-game-volt", titan: "text-game-titan", shadow: "text-game-shadow", blaze: "text-game-blaze", frost: "text-game-frost",
  aero: "text-game-aero", terra: "text-game-terra", medic: "text-game-medic", neon: "text-game-neon", solar: "text-game-solar",
};

const initialControls = (): Controls => ({ up: false, down: false, left: false, right: false, sprint: false, jumpQueued: false, shooting: false, joystick: { x: 0, y: 0 } });

export function GameApp() {
  const [phase, setPhase] = useState<Phase>("home");
  const [hero, setHero] = useState<Hero>(heroes[0]!);
  const [stats, setStats] = useState<ArenaStats>(initialArenaStats);
  const [notification, setNotification] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [touchMode, setTouchMode] = useState(false);
  const [joystick, setJoystick] = useState({ x: 0, y: 0 });
  const input = useRef<Controls>(initialControls());
  const actionsRef = useRef<GameActions | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const joystickOrigin = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const updateTouch = () => setTouchMode(window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 720);
    updateTouch();
    window.addEventListener("resize", updateTouch);
    return () => window.removeEventListener("resize", updateTouch);
  }, []);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code.startsWith("Arrow")) event.preventDefault();
      if (event.code === "KeyW" || event.code === "ArrowUp") input.current.up = true;
      if (event.code === "KeyS" || event.code === "ArrowDown") input.current.down = true;
      if (event.code === "KeyA" || event.code === "ArrowLeft") input.current.left = true;
      if (event.code === "KeyD" || event.code === "ArrowRight") input.current.right = true;
      if (event.code === "Space") { event.preventDefault(); actionsRef.current?.fire(); }
      if (event.code === "KeyE") actionsRef.current?.useAbility();
      if (event.code === "KeyQ") actionsRef.current?.useUltimate();
      if (event.code === "Escape") setHelpOpen((open) => !open);
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === "KeyW" || event.code === "ArrowUp") input.current.up = false;
      if (event.code === "KeyS" || event.code === "ArrowDown") input.current.down = false;
      if (event.code === "KeyA" || event.code === "ArrowLeft") input.current.left = false;
      if (event.code === "KeyD" || event.code === "ArrowRight") input.current.right = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => () => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
  }, []);

  const pushNotice = useCallback((text: string) => {
    setNotification(text);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotification(""), 2100);
  }, []);
  const finishRound = useCallback((result: "win" | "loss") => setPhase(result === "win" || result === "loss" ? "ended" : "playing"), []);
  const beginRound = useCallback(() => {
    input.current = initialControls();
    setJoystick({ x: 0, y: 0 });
    setStats(initialArenaStats());
    setNotification("");
    setPhase("playing");
  }, []);

  const onJoyStart = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    joystickOrigin.current = { x: event.clientX, y: event.clientY };
  };
  const onJoyMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.buttons === 0) return;
    const dx = Math.max(-1, Math.min(1, (event.clientX - joystickOrigin.current.x) / 58));
    const dy = Math.max(-1, Math.min(1, (event.clientY - joystickOrigin.current.y) / 58));
    const next = { x: dx, y: dy };
    setJoystick(next);
    input.current.joystick = next;
  };
  const onJoyEnd = () => {
    const reset = { x: 0, y: 0 };
    setJoystick(reset);
    input.current.joystick = reset;
  };

  const currentTone = HERO_TONES[hero.id] ?? "text-primary";
  const playing = phase === "playing";
  const showingWorld = phase === "select" || playing || phase === "ended";

  return (
    <main className="game-shell game-grid relative h-[100svh] min-h-[640px] w-full overflow-hidden text-foreground selection:bg-primary/30">
      <div className="absolute inset-0 z-0">
        <GameWorld hero={hero} phase={phase} paused={helpOpen} input={input} actionsRef={actionsRef} onStats={setStats} onNotice={pushNotice} onEnd={finishRound} />
      </div>
      <div className="game-scan pointer-events-none absolute inset-x-0 top-0 z-[1] h-1/2 opacity-45" />
      <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-b from-background/30 via-transparent to-background/35" />

      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 py-4 sm:px-7 sm:py-6">
        <button className="pointer-events-auto flex items-center gap-3" aria-label="Hero Drop Arena home" onClick={() => setPhase("home")}>
          <span className="grid size-10 place-items-center rounded-lg border border-primary/35 bg-primary/10 text-primary">
            <Zap size={22} fill="currentColor" />
          </span>
          <span className="text-left">
            <span className="block text-sm font-black uppercase leading-none tracking-[0.08em] sm:text-base">HERO DROP</span>
            <span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">ARENA / 01</span>
          </span>
        </button>
        <div className="pointer-events-auto flex items-center gap-2 sm:gap-3">
          <span className="hidden items-center gap-2 rounded-md border border-border bg-background/65 px-3 py-2 text-[10px] font-extrabold uppercase tracking-[0.15em] text-muted-foreground backdrop-blur sm:flex">
            <span className="size-1.5 animate-pulse rounded-full bg-primary" /> LOCAL SIMULATION
          </span>
          {phase !== "playing" && <Button variant="ghost" size="icon" title="How to play" aria-label="How to play" onClick={() => setHelpOpen(true)}><Info /></Button>}
        </div>
      </header>

      {phase === "home" && (
        <section className="pointer-events-none absolute inset-0 z-10 flex items-center px-5 pb-8 pt-24 sm:px-12 lg:px-[8vw]">
          <div className="pointer-events-auto max-w-xl">
            <div className="mb-4 flex items-center gap-3">
              <Badge variant="outline" className="rounded-sm border-primary/40 bg-primary/10 text-primary">SEASON 01 · PLAYABLE PROTOTYPE</Badge>
            </div>
            <h1 className="game-outline max-w-lg text-5xl font-black uppercase leading-[0.91] sm:text-7xl lg:text-8xl">
              DROP IN.<br /><span className="text-primary">POWER UP.</span><br />STAND OUT.
            </h1>
            <p className="mt-6 max-w-md text-sm leading-relaxed text-foreground/75 sm:text-base">
              Ten heroes. One island. Make your move before the storm closes in.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button size="lg" className="h-12 rounded-md px-7 text-sm font-black uppercase tracking-[0.12em] shadow-[0_0_32px_color-mix(in_oklab,var(--primary)_30%,transparent)]" onClick={() => setPhase("select")}>
                Play Arena <MoveUpRight size={17} />
              </Button>
              <Button variant="secondary" size="lg" className="h-12 rounded-md px-6 text-sm font-bold uppercase tracking-[0.1em]" onClick={() => setPhase("select")}>
                Choose Hero <Target size={17} />
              </Button>
              <Button variant="ghost" className="h-12 justify-start px-3 text-xs font-bold uppercase tracking-[0.12em] text-foreground/75" onClick={() => setHelpOpen(true)}>
                How to play <Info size={16} />
              </Button>
            </div>
            <div className="mt-10 flex flex-wrap gap-x-7 gap-y-3 border-t border-border/70 pt-5 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
              <span className="flex items-center gap-2"><Crosshair size={14} className="text-primary" /> 03 RIVALS</span>
              <span className="flex items-center gap-2"><Shield size={14} className="text-game-frost" /> SHRINKING ZONE</span>
              <span className="flex items-center gap-2"><Sparkles size={14} className="text-game-blaze" /> 10 ORIGINAL HEROES</span>
            </div>
          </div>
          <div className="pointer-events-none absolute bottom-7 right-7 hidden text-right lg:block">
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground">CURRENT DROP SITE</div>
            <div className="mt-1 text-sm font-black uppercase tracking-[0.12em]">NEON RIDGE <span className="text-primary">/ 07</span></div>
          </div>
        </section>
      )}

      {phase === "select" && (
        <section className="absolute inset-0 z-10 flex items-center justify-center px-3 pb-4 pt-20 sm:px-8 sm:pb-8 sm:pt-24">
          <div className="game-panel relative flex max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-md">
            <div className="flex shrink-0 items-end justify-between gap-3 border-b border-border/70 px-4 py-4 sm:px-6 sm:py-5">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.23em] text-primary">01 / SELECT YOUR DROP</div>
                <h1 className="mt-1 text-2xl font-black uppercase leading-none sm:text-3xl">Choose your hero</h1>
              </div>
              <Button variant="ghost" className="shrink-0 text-xs font-bold uppercase tracking-[0.1em]" onClick={() => setPhase("home")}><ArrowLeft size={15} /> Back</Button>
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 overflow-y-auto p-3 sm:grid-cols-3 sm:gap-3 sm:p-5 lg:grid-cols-5">
              {heroes.map((item, index) => {
                const selected = hero.id === item.id;
                const tone = HERO_TONES[item.id] ?? "text-primary";
                return (
                  <button key={item.id} onClick={() => setHero(item)} aria-pressed={selected} className={`group relative flex min-h-36 flex-col justify-between overflow-hidden rounded-sm border p-3 text-left transition-all sm:min-h-44 sm:p-4 ${selected ? "border-primary/80 bg-primary/10 shadow-[inset_0_0_32px_var(--color-primary-foreground)]" : "border-border bg-background/60 hover:border-foreground/35 hover:bg-secondary/70"}`}>
                    <span className="flex items-center justify-between">
                      <span className={`text-[9px] font-black uppercase tracking-[0.15em] ${tone}`}>HERO / {String(index + 1).padStart(2, "0")}</span>
                      <span className={`size-2 rounded-full ${selected ? "bg-primary shadow-[0_0_12px_var(--color-primary)]" : "bg-muted-foreground/30"}`} />
                    </span>
                    <span>
                      <span className="block text-sm font-black uppercase leading-tight sm:text-base">{item.name}</span>
                      <span className={`mt-1 block text-[8px] font-extrabold uppercase tracking-[0.13em] sm:text-[9px] ${tone}`}>{item.role}</span>
                    </span>
                    <span className="mt-3 border-t border-border/70 pt-2 text-[9px] font-semibold leading-snug text-muted-foreground sm:text-[10px]">
                      <span className="text-foreground/80">ABILITY</span> · {item.ability}
                    </span>
                    <span className={`pointer-events-none absolute -bottom-8 -right-4 size-20 rounded-full opacity-10 blur-2xl transition-opacity group-hover:opacity-30 ${tone.replace("text-", "bg-")}`} />
                  </button>
                );
              })}
            </div>
            <div className="flex shrink-0 flex-col gap-3 border-t border-border/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="min-w-0">
                <div className={`text-sm font-black uppercase ${currentTone}`}>{hero.name}<span className="ml-2 text-[9px] font-bold tracking-[0.13em] text-muted-foreground">{hero.role}</span></div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[9px] text-muted-foreground sm:text-[10px]"><span><b className="text-foreground/85">ABILITY:</b> {hero.abilityDescription}</span><span><b className="text-foreground/85">ULT:</b> {hero.ultimate}</span></div>
              </div>
              <Button onClick={beginRound} className="h-11 shrink-0 rounded-sm px-6 text-xs font-black uppercase tracking-[0.14em]">Drop into arena <MoveUpRight size={16} /></Button>
            </div>
          </div>
        </section>
      )}

      {playing && (
        <section className="pointer-events-none absolute inset-0 z-10">
          <div className="absolute left-3 top-20 flex flex-col gap-2 sm:left-7 sm:top-24 sm:flex-row">
            <HudPill label="RIVALS LEFT" value={String(stats.alive)} icon={<Crosshair size={14} />} />
            <HudPill label="ZONE CLOSING" value={`${stats.zoneSeconds}s`} icon={<span className="size-2 rounded-full bg-game-blaze" />} danger={stats.zoneSeconds < 18} />
          </div>
          <div className="game-panel pointer-events-auto absolute right-3 top-20 w-[130px] rounded-sm p-2 sm:right-7 sm:top-24 sm:w-[158px] sm:p-3">
            <div className="mb-2 flex items-center justify-between text-[8px] font-black uppercase tracking-[0.14em] text-muted-foreground"><span>RADAR</span><span className="text-game-aero">N RIDGE</span></div>
            <MiniMap playerX={stats.elapsed} />
            <div className="mt-2 flex items-center justify-between text-[8px] font-extrabold uppercase text-muted-foreground"><span>ZONE <i className="ml-1 inline-block size-1.5 rounded-full bg-game-blaze" /></span><span>YOU <i className="ml-1 inline-block size-1.5 rounded-full bg-primary" /></span></div>
          </div>
          <div className="game-panel absolute bottom-4 left-3 w-52 rounded-sm p-3 sm:bottom-7 sm:left-7 sm:w-64 sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2"><span className={`grid size-8 shrink-0 place-items-center rounded-sm border border-border bg-secondary text-[10px] font-black ${currentTone}`}>{hero.initials}</span><div className="min-w-0"><div className="truncate text-[11px] font-black uppercase">{hero.name}</div><div className="text-[8px] font-bold uppercase tracking-[0.12em] text-muted-foreground">ARENA OPERATIVE</div></div></div>
              <span className="shrink-0 text-[9px] font-black uppercase tracking-[0.12em] text-primary">{stats.ammo} <span className="text-muted-foreground">AMMO</span></span>
            </div>
            <StatBar label="HEALTH" value={stats.health} icon={<Heart size={11} />} tone="bg-game-medic" />
            <StatBar label="SHIELD" value={stats.shield} icon={<Shield size={11} />} tone="bg-game-aero" />
            <div className="mt-2 flex items-center justify-between gap-2 text-[8px] font-bold uppercase tracking-[0.09em] text-muted-foreground"><span>ULTIMATE</span><span className="text-game-solar">{Math.floor(stats.ultimate)}%</span></div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-background"><div className="h-full bg-game-solar transition-all duration-200" style={{ width: `${stats.ultimate}%` }} /></div>
          </div>

          <div className="pointer-events-auto absolute bottom-5 right-3 flex items-end gap-2 sm:bottom-7 sm:right-7 sm:gap-3">
            <div className="flex flex-col items-center gap-1.5">
              <AbilityButton icon={<Zap size={20} />} title="Hero ability" detail={hero.ability} ready={stats.abilitySeconds === 0} onClick={() => actionsRef.current?.useAbility()} tone={currentTone}>
                {stats.abilitySeconds > 0 ? `${stats.abilitySeconds}s` : "E"}
              </AbilityButton>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <AbilityButton icon={<Sparkles size={19} />} title="Ultimate" detail={hero.ultimate} ready={stats.ultimate >= 100} onClick={() => actionsRef.current?.useUltimate()} tone="text-game-solar">
                {stats.ultimate >= 100 ? "Q" : `${Math.floor(stats.ultimate)}%`}
              </AbilityButton>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <button title="Fire weapon" aria-label="Fire weapon" className="grid size-[68px] place-items-center rounded-full border border-game-blaze/60 bg-game-blaze/20 text-game-blaze shadow-[0_0_24px_color-mix(in_oklab,var(--color-game-blaze)_18%,transparent)] backdrop-blur transition-transform active:scale-95 sm:size-[76px]" onPointerDown={(event) => { event.preventDefault(); input.current.shooting = true; actionsRef.current?.fire(); }} onPointerUp={() => { input.current.shooting = false; }} onPointerLeave={() => { input.current.shooting = false; }} onContextMenu={(event) => event.preventDefault()}>
                <Crosshair size={27} />
              </button>
              <span className="text-[8px] font-black uppercase tracking-[0.13em] text-foreground/80">{touchMode ? "FIRE" : "SPACE"}</span>
            </div>
          </div>

          {touchMode && (
            <>
              <div className="pointer-events-auto absolute bottom-6 left-4 grid size-[104px] touch-none place-items-center rounded-full border border-foreground/20 bg-background/40 shadow-lg backdrop-blur" onPointerDown={onJoyStart} onPointerMove={onJoyMove} onPointerUp={onJoyEnd} onPointerCancel={onJoyEnd} aria-label="Movement joystick">
                <span className="absolute grid size-11 place-items-center rounded-full border border-foreground/25 bg-foreground/10 text-foreground/70" style={{ transform: `translate(${joystick.x * 24}px, ${joystick.y * 24}px)` }}><MoveUpRight size={17} /></span>
              </div>
              <div className="pointer-events-none absolute bottom-[139px] left-4 flex flex-col items-center gap-1.5 text-foreground/70">
                <ArrowUp size={13} /><div className="flex gap-8"><ArrowLeft size={13} /><ArrowDown size={13} /><ArrowRight size={13} /></div>
              </div>
            </>
          )}

          {notification && <div role="status" className="game-panel pointer-events-none absolute left-1/2 top-[31%] -translate-x-1/2 rounded-sm px-4 py-2 text-center text-[10px] font-black uppercase tracking-[0.14em] text-primary sm:text-xs">{notification}</div>}
        </section>
      )}

      {phase === "ended" && (
        <section className="absolute inset-0 z-30 grid place-items-center bg-background/55 px-4 backdrop-blur-sm">
          <div className="game-panel w-full max-w-md rounded-md p-6 text-center sm:p-9">
            <div className={`mx-auto grid size-14 place-items-center rounded-full border ${stats.health > 0 ? "border-primary/50 bg-primary/10 text-primary" : "border-destructive/50 bg-destructive/10 text-destructive"}`}>
              {stats.health > 0 ? <Trophy size={25} /> : <Crosshair size={25} />}
            </div>
            <div className="mt-4 text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground">DROP COMPLETE</div>
            <h1 className="mt-2 text-4xl font-black uppercase sm:text-5xl">{stats.alive === 0 ? "You Win" : "Game Over"}</h1>
            <p className="mt-3 text-sm text-muted-foreground">{stats.alive === 0 ? `Last hero standing as ${hero.name}.` : `${hero.name} was knocked out of the arena.`}</p>
            <div className="mt-6 grid grid-cols-2 divide-x divide-border border-y border-border py-4">
              <div><div className="text-2xl font-black">{3 - stats.alive}</div><div className="mt-1 text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">RIVALS ELIMINATED</div></div>
              <div><div className="text-2xl font-black">{Math.floor(stats.elapsed)}s</div><div className="mt-1 text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">TIME SURVIVED</div></div>
            </div>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row"><Button className="h-11 flex-1 rounded-sm text-xs font-black uppercase tracking-[0.12em]" onClick={beginRound}>Drop again <ArrowRight size={15} /></Button><Button variant="secondary" className="h-11 flex-1 rounded-sm text-xs font-bold uppercase tracking-[0.12em]" onClick={() => setPhase("select")}>Change hero</Button></div>
          </div>
        </section>
      )}

      {helpOpen && (
        <section className="absolute inset-0 z-40 grid place-items-center bg-background/70 px-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="help-title">
          <div className="game-panel w-full max-w-lg rounded-md p-5 sm:p-7">
            <div className="flex items-start justify-between"><div><div className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">QUICK BRIEFING / 01</div><h2 id="help-title" className="mt-2 text-2xl font-black uppercase">How to play</h2></div><Button size="icon" variant="ghost" aria-label="Close help" onClick={() => setHelpOpen(false)}>×</Button></div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <HelpLine keys="W A S D / ↑ ↓ ← →" text="Move around the island." />
              <HelpLine keys="MOUSE + CLICK" text="Aim at a rival and fire." />
              <HelpLine keys="SPACE" text="Fire toward the nearest rival." />
              <HelpLine keys="E" text="Use your hero's ability." />
              <HelpLine keys="Q" text="Unleash your charged ultimate." />
              <HelpLine keys="PICKUPS" text="Collect glowing supplies to recover." />
            </div>
            <div className="mt-5 border-l-2 border-game-blaze pl-3 text-xs leading-relaxed text-muted-foreground">Stay inside the shrinking orange zone. Defeat all three rivals to win.</div>
            <Button className="mt-5 h-10 w-full rounded-sm text-xs font-black uppercase tracking-[0.14em]" onClick={() => setHelpOpen(false)}>Got it</Button>
          </div>
        </section>
      )}

      {showingWorld && phase === "select" && <div className="pointer-events-none absolute bottom-2 left-1/2 z-[2] -translate-x-1/2 text-[8px] font-black uppercase tracking-[0.24em] text-foreground/60 sm:bottom-4">NEON RIDGE · HERO ROSTER</div>}
    </main>
  );
}

function HudPill({ label, value, icon, danger = false }: { label: string; value: string; icon: React.ReactNode; danger?: boolean }) {
  return <div className="game-panel flex min-w-[88px] items-center gap-2 rounded-sm px-2.5 py-2 sm:min-w-[112px] sm:gap-2.5 sm:px-3 sm:py-2.5"><span className={danger ? "text-game-blaze" : "text-primary"}>{icon}</span><span><span className="block text-[7px] font-black uppercase tracking-[0.13em] text-muted-foreground sm:text-[8px]">{label}</span><span className={`mt-0.5 block text-sm font-black leading-none sm:text-base ${danger ? "text-game-blaze" : "text-foreground"}`}>{value}</span></span></div>;
}

function MiniMap({ playerX }: { playerX: number }) {
  return <div className="relative aspect-square overflow-hidden rounded-sm border border-border/80 bg-secondary/45">
    <div className="absolute inset-[9%] rounded-full border border-game-blaze/55 bg-game-blaze/5" />
    <div className="absolute left-1/2 top-1/2 size-[78%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-foreground/15" />
    <span className="absolute left-[26%] top-[33%] size-1.5 rounded-full bg-game-blaze" /><span className="absolute left-[71%] top-[47%] size-1.5 rounded-full bg-game-shadow" /><span className="absolute left-[58%] top-[21%] size-1.5 rounded-full bg-game-aero" />
    <span className="absolute left-1/2 top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-background bg-primary shadow-[0_0_9px_var(--color-primary)]" style={{ transform: `translate(calc(-50% + ${Math.sin(playerX * 0.1) * 7}px), calc(-50% + ${Math.cos(playerX * 0.1) * 6}px))` }} />
    <span className="absolute bottom-2 right-2 size-1 rounded-full bg-game-blaze/70" />
  </div>;
}

function StatBar({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: string }) {
  return <div className="mt-2"><div className="mb-1 flex items-center justify-between text-[8px] font-extrabold uppercase tracking-[0.12em]"><span className="flex items-center gap-1.5 text-muted-foreground">{icon}{label}</span><span>{Math.ceil(value)}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-background"><div className={`h-full ${tone} transition-[width] duration-150`} style={{ width: `${value}%` }} /></div></div>;
}

function AbilityButton({ icon, title, detail, ready, onClick, tone, children }: { icon: React.ReactNode; title: string; detail: string; ready: boolean; onClick: () => void; tone: string; children: React.ReactNode }) {
  return <button title={`${title}: ${detail}`} aria-label={`${title}: ${detail}`} disabled={!ready} onClick={onClick} className={`relative grid size-[56px] place-items-center rounded-full border backdrop-blur transition-all active:scale-95 disabled:cursor-not-allowed sm:size-[62px] ${ready ? `border-primary/50 bg-background/75 ${tone} shadow-[0_0_22px_color-mix(in_oklab,var(--primary)_12%,transparent)] hover:bg-secondary` : "border-border bg-background/50 text-muted-foreground opacity-60"}`}><span className="absolute top-[9px]">{icon}</span><span className="absolute bottom-[8px] text-[8px] font-black uppercase tracking-[0.1em]">{children}</span></button>;
}

function HelpLine({ keys, text }: { keys: string; text: string }) {
  return <div className="border border-border/70 bg-background/30 p-3"><div className="text-[9px] font-black uppercase tracking-[0.12em] text-primary">{keys}</div><div className="mt-1 text-xs text-muted-foreground">{text}</div></div>;
}
