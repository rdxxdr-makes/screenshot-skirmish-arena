import { createFileRoute } from "@tanstack/react-router";
import { GameApp } from "@/game/GameApp";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Hero Drop: Arena — Pick a Hero. Own the Island." },
      { name: "description", content: "Drop into Neon Ridge, choose from ten original heroes, and outlast three rivals in a fast-paced 3D arena battle." },
      { property: "og:title", content: "Hero Drop: Arena" },
      { property: "og:description", content: "Choose your hero and outlast the rivals in a playable 3D arena battle." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return <GameApp />;
}
