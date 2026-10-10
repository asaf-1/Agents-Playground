import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import {
  ArrowLeftRight,
  CircleDollarSign,
  CircleUserRound,
  Inbox,
  LifeBuoy,
  ClipboardCheck,
  HandCoins,
  Receipt,
  Settings,
  UsersRound,
} from "lucide-react";
import { TICKERS } from "../market";
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
