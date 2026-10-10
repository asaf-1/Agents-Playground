import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import {
  ArrowLeftRight,
  BookOpen,
  Braces,
  ChartPie,
  CircleDollarSign,
  CircleUserRound,
  Inbox,
  LifeBuoy,
  ClipboardCheck,
  HandCoins,
  Receipt,
  Settings,
  UsersRound,
  Wallet as WalletIcon,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  changeDirection,
  formatChange,
  formatPrice,
  getMarket,
  type MarketCoin,
} from "../marketApi";
import { useRunKey } from "../useAppFlags";
import { useBankSession } from "../useBankSession";
import {
  AboutIcon,
  AccountIcon,
  AlertIcon,
  BankIcon,
  CoinIcon,
  HomeIcon,
  LogoMark,
  OrdersIcon,
  ShopIcon,
  UsersIcon,
} from "./icons";
import { NotificationBell } from "./NotificationBell";
import { UserMenu } from "./UserMenu";

// The nav keeps every original link, test id and label; it gains groups, icons,
// the "Soon" entries, Profile and Settings, and Bank users for Support and
// Admin.
function Sidebar() {
  const { user } = useBankSession();
  const staff = user?.role === "support" || user?.role === "admin";

  return (
    <aside className="sidebar">
      <Link className="brand" to="/">
        <LogoMark className="brand-mark" />
        <span className="brand-name">
          Playground Bank
          <small>QA practice site</small>
        </span>
      </Link>

      <nav data-testid="app-nav" aria-label="Main">
        <p className="nav-group">Overview</p>
        <NavLink data-testid="nav-link-home" className="nav-link" to="/" end>
          <HomeIcon />
          Home
        </NavLink>

        <p className="nav-group">Money</p>
        <NavLink
          data-testid="nav-link-bank"
          className="nav-link"
          to="/bank"
          end
        >
          <BankIcon />
          Bank
        </NavLink>
        <NavLink
          data-testid="nav-link-transfer"
          className="nav-link"
          to="/bank/transfer"
        >
          <ArrowLeftRight aria-hidden="true" />
          Transfer
        </NavLink>
        <NavLink
          data-testid="nav-link-bills"
          className="nav-link"
          to="/bank/bills"
        >
          <Receipt aria-hidden="true" />
          Bill pay
        </NavLink>
        <NavLink
          data-testid="nav-link-loans"
          className="nav-link"
          to="/bank/loans"
        >
          <HandCoins aria-hidden="true" />
          Loans
        </NavLink>
        <NavLink
          data-testid="nav-link-requests"
          className="nav-link"
          to="/bank/requests"
        >
          <CircleDollarSign aria-hidden="true" />
          Requests
        </NavLink>

        <p className="nav-group">Exchange</p>
        <NavLink
          data-testid="nav-link-markets"
          className="nav-link"
          to="/markets"
        >
          <CoinIcon />
          Markets
        </NavLink>
        <NavLink
          data-testid="nav-link-portfolio"
          className="nav-link"
          to="/portfolio"
        >
          <ChartPie aria-hidden="true" />
          Portfolio
        </NavLink>
        <NavLink
          data-testid="nav-link-wallet"
          className="nav-link"
          to="/wallet"
        >
          <WalletIcon aria-hidden="true" />
          Wallet
        </NavLink>

        <p className="nav-group">Shop</p>
        <NavLink
          data-testid="nav-link-products"
          className="nav-link"
          to="/products"
        >
          <ShopIcon />
          Products
        </NavLink>

        <p className="nav-group">Back office</p>
        <NavLink
          data-testid="nav-link-orders"
          className="nav-link"
          to="/orders"
        >
          <OrdersIcon />
          Orders
        </NavLink>
        <NavLink data-testid="nav-link-users" className="nav-link" to="/users">
          <UsersIcon />
          Users
        </NavLink>
        {staff && (
          <NavLink
            data-testid="nav-link-bank-users"
            className="nav-link"
            to="/admin/users"
          >
            <UsersRound aria-hidden="true" />
            Bank users
          </NavLink>
        )}
        {staff && (
          <NavLink
            data-testid="nav-link-loan-requests"
            className="nav-link"
            to="/admin/loans"
          >
            <ClipboardCheck aria-hidden="true" />
            Loan requests
          </NavLink>
        )}
        {staff && (
          <NavLink
            data-testid="nav-link-support-inbox"
            className="nav-link"
            to="/admin/support"
          >
            <Inbox aria-hidden="true" />
            Support inbox
          </NavLink>
        )}

        <p className="nav-group">Developers</p>
        <NavLink
          data-testid="nav-link-graphql"
          className="nav-link"
          to="/graphql"
        >
          <Braces aria-hidden="true" />
          GraphQL
        </NavLink>
        <a
          className="nav-link"
          data-testid="nav-link-api-docs"
          href="/api/docs"
          target="_blank"
          rel="noreferrer"
        >
          <BookOpen aria-hidden="true" />
          REST API docs
        </a>

        <p className="nav-group">You</p>
        <NavLink
          data-testid="nav-link-profile"
          className="nav-link"
          to="/profile"
        >
          <CircleUserRound aria-hidden="true" />
          Profile
        </NavLink>
        <NavLink
          data-testid="nav-link-settings"
          className="nav-link"
          to="/settings"
        >
          <Settings aria-hidden="true" />
          Settings
        </NavLink>
        <NavLink
          data-testid="nav-link-support"
          className="nav-link"
          to="/support"
          end
        >
          <LifeBuoy aria-hidden="true" />
          Support
        </NavLink>
        <NavLink
          data-testid="nav-link-account"
          className="nav-link"
          to="/account"
        >
          <AccountIcon />
          Account
        </NavLink>
        <NavLink data-testid="nav-link-about" className="nav-link" to="/about">
          <AboutIcon />
          About
        </NavLink>
      </nav>
    </aside>
  );
}

// A landmark, not a plain note. It sits between the sidebar and the top bar,
// outside every other landmark, so as a bare div its text belonged to no
// region at all -- which is what axe's "region" rule flags, on every page. A
// labelled region makes it reachable by landmark navigation and leaves the
// look untouched.
function PracticeBanner() {
  return (
    <div
      className="practice-banner"
      data-testid="practice-banner"
      role="region"
      aria-label="Practice site notice"
    >
      <AlertIcon />
      <span>
        <strong>Practice site</strong> · for QA, agents and platform engineers.
      </span>
    </div>
  );
}

function TickerList({ coins, copy }: { coins: MarketCoin[]; copy?: boolean }) {
  return (
    <div className="ticker-list" aria-hidden={copy || undefined}>
      {coins.map((coin) => {
        const direction = changeDirection(coin.changeBasisPoints);
        return (
          <span className="tick" key={coin.symbol}>
            <span className="tick-symbol">{coin.symbol}</span>
            <span className="tick-price">{formatPrice(coin.priceMicros)}</span>
            <span className={`tick-change ${direction}`}>
              {formatChange(coin.changeBasisPoints)}
            </span>
          </span>
        );
      })}
    </div>
  );
}

// The strip shows the viewer's own prices, the same ones the Markets page
// draws, so the number in the corner and the number on the page always agree.
// The list is rendered twice so the strip can scroll in a seamless loop; the
// second copy is hidden from screen readers. Until the first answer arrives
// the strip is empty but keeps its height, so nothing jumps.
function MarketTicker() {
  const runKey = useRunKey();
  const market = useQuery({
    queryKey: ["bank", "market", runKey],
    queryFn: () => getMarket(runKey),
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });
  const coins = market.data?.coins ?? [];

  return (
    <div
      className="ticker"
      data-testid="market-ticker"
      role="marquee"
      aria-label="Simulated market prices"
    >
      <div className="ticker-track">
        <TickerList coins={coins} />
        <TickerList coins={coins} copy />
      </div>
    </div>
  );
}

function Topbar() {
  return (
    <header className="topbar">
      <MarketTicker />
      <div className="topbar-meta">
        <span className="live-chip">
          <span className="live-dot" />
          Simulated market
        </span>
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="workspace">
        <PracticeBanner />
        <Topbar />
        <main data-testid="app-main">{children}</main>
      </div>
    </div>
  );
}
