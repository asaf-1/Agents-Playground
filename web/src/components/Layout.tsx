// The frame around every page: the side menu, the practice banner, the top bar
// with its price ticker, and the page itself.

// React's hooks and its type for a page's content, and the router's links.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
// The menu's icons (Lucide).
import {
  ArrowLeftRight,
  BookOpen,
  Braces,
  Bug,
  ChartPie,
  CircleDollarSign,
  CircleUserRound,
  CreditCard,
  Inbox,
  LifeBuoy,
  ClipboardCheck,
  HandCoins,
  KeyRound,
  Menu as MenuIcon,
  MonitorSmartphone,
  PackageCheck,
  Receipt,
  Scale,
  ScrollText,
  Settings,
  ShoppingCart,
  Truck,
  UsersRound,
  Wallet as WalletIcon,
  X as CloseIcon,
} from "lucide-react";
// The data cache, and the market's call and formats.
import { useQuery } from "@tanstack/react-query";
import {
  changeDirection,
  formatChange,
  formatPrice,
  getMarket,
  type MarketCoin,
} from "../marketApi";
// The test's runKey, who is signed in, and the column names on table cells.
import { useRunKey } from "../useAppFlags";
import { useBankSession } from "../useBankSession";
import { useTableLabels } from "../useTableLabels";
// The site's own icons, and the top bar's switch, bell and account menu.
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
import { CartButton } from "./CartButton";
import { NotificationBell } from "./NotificationBell";
import { PracticeSwitch } from "./PracticeSwitch";
import { UserMenu } from "./UserMenu";

// The nav keeps every original link, test id and label; it gains groups, icons,
// the "Soon" entries, Profile and Settings, and Bank users for Support and
// Admin.
function Sidebar() {
  // Who is signed in; support and admin users see the staff links.
  const { user } = useBankSession();
  const staff = user?.role === "support" || user?.role === "admin";
  const admin = user?.role === "admin";

  // On a phone (below 900px) the menu is a panel behind the ☰ button: open or
  // shut. On a wider screen the button is hidden and this stays false.
  const [menuOpen, setMenuOpen] = useState(false);
  // The ☰ button, to give focus back to it when Escape shuts the panel.
  const toggleRef = useRef<HTMLButtonElement>(null);
  // The menu, to move focus to its first link when the panel opens.
  const navRef = useRef<HTMLElement>(null);

  // While the panel is open: focus moves to its first link, the page behind it
  // stops scrolling, and Escape shuts it. All three undo when it shuts.
  useEffect(() => {
    if (!menuOpen) return;
    // Stop the page behind from scrolling (html.menu-open in app.css).
    const root = document.documentElement;
    root.classList.add("menu-open");
    // Focus the first link, so a keyboard user starts inside the menu.
    navRef.current?.querySelector<HTMLElement>("a")?.focus();
    // Escape shuts the panel and puts focus back on the ☰ button.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      toggleRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      root.classList.remove("menu-open");
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // The ☰ button, the logo, then the menu in groups.
  return (
    <aside className={menuOpen ? "sidebar is-open" : "sidebar"}>
      {/* Phone only: the button that opens and shuts the menu panel, first in
          the bar so it sits on the left, the side the panel slides in from.
          CSS hides it above 900px. */}
      <button
        type="button"
        ref={toggleRef}
        className="menu-toggle"
        data-testid="nav-toggle"
        aria-controls="app-nav"
        aria-expanded={menuOpen}
        aria-label={menuOpen ? "Close menu" : "Open menu"}
        onClick={() => setMenuOpen((open) => !open)}
      >
        {menuOpen ? (
          <CloseIcon aria-hidden="true" />
        ) : (
          <MenuIcon aria-hidden="true" />
        )}
      </button>

      {/* The logo and the site's name, linking home. On a phone it sits on the
          right of the bar. */}
      <Link className="brand" to="/" data-testid="nav-brand">
        <LogoMark className="brand-mark" />
        <span className="brand-name">
          Playground Bank
          <small>QA practice site</small>
        </span>
      </Link>

      {/* The menu, one group at a time. Picking a link shuts the phone panel
          (the click bubbles up from the link; Enter on a link clicks it too). */}
      <nav
        id="app-nav"
        ref={navRef}
        data-testid="app-nav"
        aria-label="Main"
        onClick={(event) => {
          if ((event.target as Element).closest("a")) setMenuOpen(false);
        }}
      >
        {/* Practice first: the planted faults a tester looks for. */}
        <p className="nav-group">Practice</p>
        <NavLink
          data-testid="nav-link-practice"
          className="nav-link"
          to="/practice"
        >
          <Bug aria-hidden="true" />
          What to look for
        </NavLink>

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
          data-testid="nav-link-cards"
          className="nav-link"
          to="/bank/cards"
        >
          <CreditCard aria-hidden="true" />
          Cards
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
        {/* The cart and the customer's orders, once signed in. */}
        {user && (
          <NavLink
            data-testid="nav-link-cart"
            className="nav-link"
            to="/shop/cart"
          >
            <ShoppingCart aria-hidden="true" />
            Cart
          </NavLink>
        )}
        {user && (
          <NavLink
            data-testid="nav-link-shop-orders"
            className="nav-link"
            to="/shop/orders"
          >
            <PackageCheck aria-hidden="true" />
            My orders
          </NavLink>
        )}

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
        {/* Staff only: bank users, loan requests, support inbox. */}
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
        {/* Staff: the shop's orders. Admin only: the audit log and books. */}
        {staff && (
          <NavLink
            data-testid="nav-link-staff-shop-orders"
            className="nav-link"
            to="/admin/shop-orders"
          >
            <Truck aria-hidden="true" />
            Shop orders
          </NavLink>
        )}
        {admin && (
          <NavLink
            data-testid="nav-link-audit"
            className="nav-link"
            to="/admin/audit"
          >
            <ScrollText aria-hidden="true" />
            Audit log
          </NavLink>
        )}
        {admin && (
          <NavLink
            data-testid="nav-link-books"
            className="nav-link"
            to="/admin/books"
          >
            <Scale aria-hidden="true" />
            Books
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
          data-testid="nav-link-devices"
          className="nav-link"
          to="/devices"
        >
          <MonitorSmartphone aria-hidden="true" />
          Devices
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

        {/* Developers last, after You: GraphQL, the REST docs, API keys. */}
        <p className="nav-group">Developers</p>
        <NavLink
          data-testid="nav-link-graphql"
          className="nav-link"
          to="/graphql"
        >
          <Braces aria-hidden="true" />
          GraphQL
        </NavLink>
        {/* The REST API docs open in a new tab. */}
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
        <NavLink
          data-testid="nav-link-developer"
          className="nav-link"
          to="/developer"
        >
          <KeyRound aria-hidden="true" />
          API keys
        </NavLink>
      </nav>

      {/* Phone only: the dark layer behind the open panel; a tap on it shuts
          the panel. Keyboard users have Escape and the button, so it stays out
          of the tab order and away from screen readers. */}
      {menuOpen && (
        <div
          className="menu-backdrop"
          data-testid="nav-backdrop"
          aria-hidden="true"
          onClick={() => setMenuOpen(false)}
        />
      )}
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

// One run of the ticker: each coin's symbol, price and move, in the visitor's
// own currency and number format, like the Markets table below it. The copy is
// hidden from screen readers.
function TickerList({
  coins,
  copy,
  locale,
  currency,
}: {
  coins: MarketCoin[];
  copy?: boolean;
  locale: string;
  currency: string;
}) {
  return (
    <div className="ticker-list" aria-hidden={copy || undefined}>
      {coins.map((coin) => {
        // Up, down or flat, for the colour.
        const direction = changeDirection(coin.changeBasisPoints);
        return (
          <span className="tick" key={coin.symbol}>
            <span className="tick-symbol">{coin.symbol}</span>
            <span className="tick-price">
              {formatPrice(coin.priceMicros, locale, currency)}
            </span>
            <span className={`tick-change ${direction}`}>
              {formatChange(coin.changeBasisPoints, locale)}
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
  // Ask for the visitor's prices every 5 seconds, only while the tab is in
  // front.
  const runKey = useRunKey();
  const market = useQuery({
    queryKey: ["bank", "market", runKey],
    queryFn: () => getMarket(runKey),
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });
  const coins = market.data?.coins ?? [];
  // The visitor's currency and number format (a signed-out visitor gets the
  // default, as on every other page).
  const settings = useBankSession().account?.settings;
  const locale = settings?.locale ?? "en-US";
  const currency = settings?.currency ?? "USD";

  // The strip, with two copies of the list end to end.
  return (
    <div
      className="ticker"
      data-testid="market-ticker"
      role="marquee"
      aria-label="Simulated market prices"
    >
      <div className="ticker-track">
        <TickerList coins={coins} locale={locale} currency={currency} />
        <TickerList coins={coins} locale={locale} currency={currency} copy />
      </div>
    </div>
  );
}

// The top bar: the ticker, then the practice switch, the market chip, the
// cart, the bell and the account menu.
function Topbar() {
  return (
    <header className="topbar">
      <MarketTicker />
      <div className="topbar-meta">
        <PracticeSwitch />
        <span className="live-chip">
          <span className="live-dot" />
          Simulated market
        </span>
        <CartButton />
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  );
}

// The whole frame: the side menu, then the banner, the top bar and the page.
export function AppLayout({ children }: { children: ReactNode }) {
  // Every table on the page gets its column names on its cells, for the phone
  // layout (see useTableLabels.ts).
  const mainRef = useRef<HTMLElement>(null);
  useTableLabels(mainRef);

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="workspace">
        <PracticeBanner />
        <Topbar />
        <main data-testid="app-main" ref={mainRef}>
          {children}
        </main>
      </div>
    </div>
  );
}
