// The frame around every page: the side menu, the top bar with its price
// ticker and Your date, and the page itself.

// React's hooks and its type for a page's content, and the router's links.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
// The menu's icons (Lucide).
import {
  ArrowLeftRight,
  Banknote,
  BookOpen,
  Braces,
  Bug,
  Building2,
  ChartPie,
  ChevronDown,
  CircleDollarSign,
  CircleUserRound,
  Coins,
  ContactRound,
  CreditCard,
  GraduationCap,
  Inbox,
  LayoutDashboard,
  SquareTerminal,
  Store,
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
  Trophy,
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
import { YourDate } from "./YourDate";

// The menu's groups that fold away: each one's id, and the addresses that
// belong to it. Arriving on a page under one of them opens its group.
const NAV_GROUPS = {
  money: ["/bank"],
  exchange: ["/markets", "/portfolio", "/wallet"],
  shop: ["/products", "/shop"],
  backoffice: ["/orders", "/users", "/admin"],
  you: ["/profile", "/settings", "/devices", "/support", "/account"],
  developers: ["/graphql", "/developer"],
} as const;
type NavGroupId = keyof typeof NAV_GROUPS;

// Where this browser remembers the groups its visitor opened. Only this
// browser: it is a convenience, and the menu works the same without it.
const NAV_OPEN_KEY = "pb.nav.open";

// The group an address belongs to, or null (Practice, Home, Log in…).
function groupOf(pathname: string): NavGroupId | null {
  for (const [id, prefixes] of Object.entries(NAV_GROUPS)) {
    if (prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
      return id as NavGroupId;
    }
  }
  return null;
}

// The groups this browser's visitor opened, or none when storage is empty,
// refused or holds something else.
function readOpenGroups(): Set<NavGroupId> {
  try {
    const saved: unknown = JSON.parse(
      window.localStorage.getItem(NAV_OPEN_KEY) ?? "[]",
    );
    if (!Array.isArray(saved)) return new Set();
    return new Set(
      saved.filter(
        (id): id is NavGroupId => typeof id === "string" && id in NAV_GROUPS,
      ),
    );
  } catch {
    return new Set();
  }
}

// Remembers the groups the visitor opened; a browser that refuses storage
// just forgets them.
function writeOpenGroups(ids: Set<NavGroupId>): void {
  try {
    window.localStorage.setItem(NAV_OPEN_KEY, JSON.stringify([...ids]));
  } catch {
    // Nothing to do: the menu works without it.
  }
}

// A group's title with its own icon in front, for the groups that fold away
// and for the two that do not (Practice and Overview).
function GroupTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <span className="nav-group-title">
      {icon}
      {title}
    </span>
  );
}

// One group that folds away: its icon and title as a button with a chevron,
// and its links under it, hidden while it is shut.
function NavGroup({
  id,
  icon,
  title,
  open,
  onToggle,
  children,
}: {
  id: NavGroupId;
  icon: ReactNode;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="nav-section" data-nav-group={id}>
      <button
        type="button"
        className="nav-group nav-group-toggle"
        aria-expanded={open}
        aria-controls={`nav-group-links-${id}`}
        data-testid={`nav-group-${id}`}
        onClick={onToggle}
      >
        <GroupTitle icon={icon} title={title} />
        <ChevronDown className="nav-group-chevron" aria-hidden="true" />
      </button>
      <div
        id={`nav-group-links-${id}`}
        className="nav-group-links"
        hidden={!open}
      >
        {children}
      </div>
    </div>
  );
}

// The nav keeps every original link, test id and label; it gains groups that
// fold away, icons, Profile and Settings, and the staff links for Support and
// Admin.
function Sidebar() {
  // Who is signed in; support and admin users see the staff links.
  const { user } = useBankSession();
  const staff = user?.role === "support" || user?.role === "admin";
  const admin = user?.role === "admin";

  // Which groups are open: the one holding the page you are on (unless you
  // shut it while here), and the ones you opened, remembered in this
  // browser. Everything else starts shut.
  const { pathname } = useLocation();
  const current = groupOf(pathname);
  const [opened, setOpened] = useState<Set<NavGroupId>>(readOpenGroups);
  const [shutHere, setShutHere] = useState(false);
  // A new page gives its own group a fresh start: open.
  useEffect(() => {
    setShutHere(false);
  }, [current]);
  // Whether a group shows its links.
  const isOpen = (id: NavGroupId) =>
    id === current ? !shutHere : opened.has(id);
  // Open or shut one group, and remember the choice.
  const toggleGroup = (id: NavGroupId) => {
    const willOpen = !isOpen(id);
    const next = new Set(opened);
    if (willOpen) next.add(id);
    else next.delete(id);
    setOpened(next);
    writeOpenGroups(next);
    if (id === current) setShutHere(!willOpen);
  };
  // The props one group needs.
  const group = (id: NavGroupId) => ({
    id,
    open: isOpen(id),
    onToggle: () => toggleGroup(id),
  });

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
        <p className="nav-group">
          <GroupTitle
            icon={
              <GraduationCap
                className="nav-group-icon-practice"
                aria-hidden="true"
              />
            }
            title="Practice"
          />
        </p>
        {/* `end`: the guide's link lights up on the guide only, not on Your
            progress below it, whose address starts the same way. */}
        <NavLink
          data-testid="nav-link-practice"
          className="nav-link nav-link-practice"
          to="/practice"
          end
        >
          <Bug aria-hidden="true" />
          Practice guide
        </NavLink>
        {/* Your progress: the faults as a checklist, ticked as you find them;
            red like the guide's icon. */}
        <NavLink
          data-testid="nav-link-progress"
          className="nav-link nav-link-progress"
          to="/practice/progress"
        >
          <Trophy aria-hidden="true" />
          Your progress
        </NavLink>

        <p className="nav-group">
          <GroupTitle
            icon={<LayoutDashboard aria-hidden="true" />}
            title="Overview"
          />
        </p>
        <NavLink
          data-testid="nav-link-home"
          className="nav-link nav-link-home"
          to="/"
          end
        >
          <HomeIcon />
          Home
        </NavLink>

        {/* The groups below fold away: Money, Exchange, Shop, Back office,
            You and Developers. */}
        <NavGroup
          {...group("money")}
          icon={<Banknote aria-hidden="true" />}
          title="Money"
        >
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
        </NavGroup>

        <NavGroup
          {...group("exchange")}
          icon={<Coins aria-hidden="true" />}
          title="Exchange"
        >
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
        </NavGroup>

        <NavGroup
          {...group("shop")}
          icon={<Store aria-hidden="true" />}
          title="Shop"
        >
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
        </NavGroup>

        <NavGroup
          {...group("backoffice")}
          icon={<Building2 aria-hidden="true" />}
          title="Back office"
        >
          <NavLink
            data-testid="nav-link-orders"
            className="nav-link"
            to="/orders"
          >
            <OrdersIcon />
            Orders
          </NavLink>
          <NavLink
            data-testid="nav-link-users"
            className="nav-link"
            to="/users"
          >
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
        </NavGroup>

        <NavGroup
          {...group("you")}
          icon={<ContactRound aria-hidden="true" />}
          title="You"
        >
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
          {/* Who you are signed in as (the page at /account): named for what
            it shows, so it never reads like Bank or Profile. */}
          <NavLink
            data-testid="nav-link-account"
            className="nav-link"
            to="/account"
          >
            <AccountIcon />
            Sign-in status
          </NavLink>
        </NavGroup>

        {/* Developers after You: GraphQL, the REST docs, API keys. */}
        <NavGroup
          {...group("developers")}
          icon={<SquareTerminal aria-hidden="true" />}
          title="Developers"
        >
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
        </NavGroup>

        {/* About the site and who built it: last, on its own, because it is
            about the site, not about you. */}
        <div className="nav-section">
          <NavLink
            data-testid="nav-link-about"
            className="nav-link nav-link-about"
            to="/about"
          >
            <AboutIcon />
            About
          </NavLink>
        </div>
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

// The top bar: the ticker, then the practice switch, Your date (the time and
// the customer's own day), the market chip, the cart, the bell and the
// account menu.
function Topbar() {
  return (
    <header className="topbar">
      <MarketTicker />
      <div className="topbar-meta">
        <PracticeSwitch />
        <YourDate />
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
        <Topbar />
        <main data-testid="app-main" ref={mainRef}>
          {children}
        </main>
      </div>
    </div>
  );
}
