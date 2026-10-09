import {
  Activity,
  BookLock,
  Box,
  Boxes,
  ChartCandlestick,
  ChartLine,
  ChartPie,
  Cpu,
  Drill,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Fingerprint,
  Fish,
  Flame,
  Gauge,
  Gpu,
  HardDrive,
  HeartPulse,
  ImageIcon,
  KeyRound,
  KeySquare,
  Lamp,
  Microchip,
  Monitor,
  Network,
  Nfc,
  Package,
  Pickaxe,
  Router,
  SatelliteDish,
  ScanEye,
  ScanSearch,
  ScrollText,
  Server,
  Share2,
  ShieldEllipsis,
  Signature,
  Smartphone,
  Snowflake,
  Thermometer,
  TrendingUp,
  Usb,
  Vault,
  Wallet,
  Waypoints,
  WifiOff,
  Zap,
  type LucideProps,
} from "lucide-react";
import { CategoryIcon } from "./icons";

const ICONS = {
  Activity,
  BookLock,
  Box,
  Boxes,
  ChartCandlestick,
  ChartLine,
  ChartPie,
  Cpu,
  Drill,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Fingerprint,
  Fish,
  Flame,
  Gauge,
  Gpu,
  HardDrive,
  HeartPulse,
  ImageIcon,
  KeyRound,
  KeySquare,
  Lamp,
  Microchip,
  Monitor,
  Network,
  Nfc,
  Package,
  Pickaxe,
  Router,
  SatelliteDish,
  ScanEye,
  ScanSearch,
  ScrollText,
  Server,
  Share2,
  ShieldEllipsis,
  Signature,
  Smartphone,
  Snowflake,
  Thermometer,
  TrendingUp,
  Usb,
  Vault,
  Wallet,
  Waypoints,
  WifiOff,
  Zap,
};

type IconName = keyof typeof ICONS;

// One icon per product, keyed by SKU. It follows PRODUCT_NAMES in server.js:
// sku-001 is Compute[0], sku-002 Storage[0], and so on through the six
// categories. No two products share an icon.
const ICON_BY_SKU: Record<string, IconName> = {
  "sku-001": "Pickaxe", // Hashforge S1 Miner
  "sku-002": "Usb", // Vaultkey Nano Wallet
  "sku-003": "Waypoints", // Relay Node Mini
  "sku-004": "KeyRound", // Sentinel Security Key
  "sku-005": "TrendingUp", // Pulse Price Ticker
  "sku-006": "Eye", // Price Oracle Feed
  "sku-007": "Gpu", // Ember GPU Rig 6x
  "sku-008": "Snowflake", // Frostbyte Cold Wallet
  "sku-009": "Zap", // Lightning Router L1
  "sku-010": "ShieldEllipsis", // Bastion 2FA Token
  "sku-011": "Activity", // Hashwatch Rig Monitor
  "sku-012": "ChartCandlestick", // Candles Market Data 1Y
  "sku-013": "Cpu", // Quarry ASIC Q9
  "sku-014": "WifiOff", // Cellar Air-Gapped Wallet
  "sku-015": "Share2", // Meshlink Node Kit
  "sku-016": "Wallet", // Faraday Wallet Pouch
  "sku-017": "Lamp", // Mempool Lamp
  "sku-018": "ChartPie", // Chain Analytics Seat
  "sku-019": "Box", // Validator Box V1
  "sku-020": "BookLock", // Seedsafe Titanium Backup
  "sku-021": "HardDrive", // Archive Node 4TB
  "sku-022": "Signature", // Signing Card Duo
  "sku-023": "HeartPulse", // Node Health Beacon
  "sku-024": "ScanSearch", // Block Explorer API Key
  "sku-025": "Drill", // Hashforge S2 Pro Miner
  "sku-026": "Smartphone", // Vaultkey Touch Wallet
  "sku-027": "Network", // Relay Node Pro
  "sku-028": "Nfc", // Sentinel Security Key NFC
  "sku-029": "Monitor", // Pulse Desk Display
  "sku-030": "ScanEye", // Price Oracle Feed Pro
  "sku-031": "Flame", // Ember GPU Rig 8x
  "sku-032": "ScrollText", // Frostbyte Steel Seed Plate
  "sku-033": "Router", // Lightning Router L2
  "sku-034": "Fingerprint", // Bastion Biometric Key
  "sku-035": "Thermometer", // Hashwatch Thermal Probe
  "sku-036": "ChartLine", // Candles Market Data 5Y
  "sku-037": "Microchip", // Quarry ASIC Q12
  "sku-038": "KeySquare", // Cellar Multisig Kit
  "sku-039": "SatelliteDish", // Meshlink Satellite Receiver
  "sku-040": "Package", // Tamper-Evident Bag Pack
  "sku-041": "Gauge", // Gas Fee Gauge
  "sku-042": "FileSpreadsheet", // Tax Export Pack
  "sku-043": "Boxes", // Validator Box V2 Max
  "sku-044": "Vault", // Seedsafe Fireproof Vault
  "sku-045": "Server", // Archive Node 8TB
  "sku-046": "EyeOff", // Privacy Screen Filter
  "sku-047": "ImageIcon", // Portfolio E-Ink Frame
  "sku-048": "Fish", // Whale Watch Stream
};

// Decorative: the product name next to it carries the meaning.
export function ProductIcon({
  id,
  category,
  ...props
}: LucideProps & { id: string; category: string }) {
  const name = ICON_BY_SKU[id];
  if (!name) {
    return <CategoryIcon category={category} data-icon={category} />;
  }
  const Icon = ICONS[name];
  return (
    <Icon strokeWidth={1.75} aria-hidden="true" data-icon={name} {...props} />
  );
}
