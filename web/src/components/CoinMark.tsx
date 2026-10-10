// One distinct icon per coin, the same way products get theirs. Keyed by
// symbol, so a coin added to the database later still renders something
// sensible instead of nothing.
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

export function CoinMark({ symbol }: { symbol: string }) {
  const Icon = ICONS[symbol.toUpperCase()] ?? CircleDollarSign;
  return (
    <span className={`coin-icon coin-icon-${symbol.toLowerCase()}`}>
      <Icon aria-hidden />
    </span>
  );
}
