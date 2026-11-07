// One distinct icon per coin, the same way products get theirs. Keyed by
// symbol, so a coin added to the database later still renders something
// sensible instead of nothing.

// The coin icons (Lucide), and React's type for a component.
import {
  Bitcoin,
  CircleDollarSign,
  Gem,
  Hexagon,
  Link2,
  Orbit,
  Sparkles,
  Sun,
  Triangle,
} from "lucide-react";
import type { ComponentType } from "react";

// Each known coin's icon.
const ICONS: Record<string, ComponentType<{ "aria-hidden"?: boolean }>> = {
  BTC: Bitcoin,
  ETH: Gem,
  SOL: Sun,
  ADA: Hexagon,
  AVAX: Triangle,
  LINK: Link2,
  DOT: Orbit,
  PLAY: Sparkles,
};

// A coin's icon in its coloured circle; an unknown coin gets the plain dollar
// icon.
export function CoinMark({ symbol }: { symbol: string }) {
  const Icon = ICONS[symbol.toUpperCase()] ?? CircleDollarSign;
  return (
    <span className={`coin-icon coin-icon-${symbol.toLowerCase()}`}>
      <Icon aria-hidden />
    </span>
  );
}
