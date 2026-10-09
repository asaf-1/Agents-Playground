import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { TICKERS } from "../market";
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
import { UserMenu } from "./UserMenu";

// The nav keeps every original link, test id and label; it only gains groups,
// icons and the "Soon" entries for the bank and the exchange.
function Sidebar() {
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
        <span
          className="nav-link is-soon"
          data-testid="nav-soon-bank"
          aria-disabled="true"
        >
          <BankIcon />
          Bank
          <span className="soon-pill">Soon</span>
        </span>
        <span
          className="nav-link is-soon"
          data-testid="nav-soon-crypto"
          aria-disabled="true"
        >
          <CoinIcon />
          Crypto exchange
          <span className="soon-pill">Soon</span>
        </span>

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

        <p className="nav-group">You</p>
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

      <div className="sidebar-note">
        <strong>Practice site</strong>
        Fake money and planted bugs. Nothing here is a real bank.
      </div>
    </aside>
  );
}

function PracticeBanner() {
  return (
    <div className="practice-banner" data-testid="practice-banner" role="note">
      <AlertIcon />
      <span>
        <strong>Practice site</strong> · fake money, not a real bank. Bugs are
        planted on purpose for testing practice.
      </span>
    </div>
  );
}

function TickerList({ copy }: { copy?: boolean }) {
  return (
    <div className="ticker-list" aria-hidden={copy || undefined}>
      {TICKERS.map((ticker) => {
        const direction =
          ticker.change > 0 ? "up" : ticker.change < 0 ? "down" : "flat";
        const sign = ticker.change > 0 ? "+" : ticker.change < 0 ? "−" : "";
        return (
          <span className="tick" key={ticker.symbol}>
            <span className="tick-symbol">{ticker.symbol}</span>
            <span className="tick-price">${ticker.price}</span>
            <span className={`tick-change ${direction}`}>
              {sign}
              {Math.abs(ticker.change).toFixed(2)}%
            </span>
          </span>
        );
      })}
    </div>
  );
}

// The list is rendered twice so the strip can scroll in a seamless loop; the
// second copy is hidden from screen readers.
function MarketTicker() {
  return (
    <div
      className="ticker"
      data-testid="market-ticker"
      role="marquee"
      aria-label="Simulated market prices"
    >
      <div className="ticker-track">
        <TickerList />
        <TickerList copy />
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
