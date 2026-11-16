// The home page: the hero, a card for each area of the site, and what can be
// practised here.

// The data cache, the router's link, the hero picture, and the site's icons.
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { HeroArt } from "../components/HeroArt";
import {
  ArrowRightIcon,
  BankIcon,
  CoinIcon,
  OrdersIcon,
  ShopIcon,
} from "../components/icons";
// The product list (the same one the shop reads), and who is signed in.
import { getProducts } from "../api";
import { useBankSession } from "../useBankSession";

// The practice areas listed at the bottom.
const PRACTICE_AREAS = [
  "UI automation",
  "API testing",
  "Accessibility",
  "Flaky networks",
  "Async state",
  "Localization",
  "Auth and sessions",
  "Contract drift",
];

// The second button in the hero, by who is looking: a visitor tries a demo
// account, a customer goes to their money, staff to their work.
function SecondAction() {
  const { user, isLoading } = useBankSession();
  // Nothing until the answer is in, so the button never swaps under a click.
  if (isLoading) return null;
  if (!user) {
    return (
      <Link className="btn" data-testid="hub-cta-demo" to="/login">
        Explore a demo
      </Link>
    );
  }
  if (user.role === "support" || user.role === "admin") {
    return (
      <Link className="btn" data-testid="hub-cta-backoffice" to="/admin/users">
        Back office
      </Link>
    );
  }
  return (
    <Link className="btn" data-testid="hub-cta-accounts" to="/bank">
      Your accounts
    </Link>
  );
}

// The hub. The heading text and the nav-about link are what the shell test
// reads.
export function HomePage() {
  // The products the shop has, for the count on its card: the same query, so
  // the same answer, as the Products page.
  const catalogue = useQuery({ queryKey: ["products"], queryFn: getProducts });
  const productCount = catalogue.data?.products.length;

  // The hero, the area cards, then the practice areas.
  return (
    <section data-testid="app-home" className="page">
      {/* The hero: title, a few lines, the buttons, and the picture. */}
      <div className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Playground Bank · QA practice</p>
          <h1 data-testid="app-heading">
            Agents <span className="grad-text">Playground</span>
          </h1>
          <p className="lead">
            A bank, a crypto exchange and a back office in one practice site.
            Fake money, real flows, and bugs planted on purpose for you to find.
          </p>
          {/* Start practicing, the button for who is looking, and About. */}
          <div className="hero-actions">
            <Link
              className="btn btn-primary"
              data-testid="hub-cta-practice"
              to="/practice"
            >
              Start practicing
              <ArrowRightIcon />
            </Link>
            <SecondAction />
            <Link className="link-arrow" data-testid="nav-about" to="/about">
              Go to About
            </Link>
          </div>
        </div>
        <HeroArt className="hero-art" />
      </div>

      {/* The section title. */}
      <div className="section-head">
        <h2>Explore</h2>
        <p className="muted">Pick an area to start.</p>
      </div>

      {/* One card per area: bank, crypto, shop, back office. */}
      <div className="hub-grid">
        <article className="card hub-card" data-testid="hub-card-bank">
          <div className="hub-card-head">
            <span className="hub-icon">
              <BankIcon />
            </span>
          </div>
          <h3>Bank</h3>
          <p>
            Accounts, transfers, bill pay, loans, history and CSV statements.
          </p>
          <div className="hub-links">
            <Link className="link-arrow" data-testid="hub-link-bank" to="/bank">
              Your accounts
            </Link>
            <Link
              className="link-arrow"
              data-testid="hub-link-transfer"
              to="/bank/transfer"
            >
              Transfer
            </Link>
          </div>
        </article>

        <article className="card hub-card" data-testid="hub-card-crypto">
          <div className="hub-card-head">
            <span className="hub-icon">
              <CoinIcon />
            </span>
          </div>
          <h3>Crypto exchange</h3>
          <p>
            Live prices on your own market. Buy and sell on a quote, follow your
            profit and loss, and send or swap coins from your wallet.
          </p>
          <div className="hub-links">
            <Link
              className="link-arrow"
              data-testid="hub-link-markets"
              to="/markets"
            >
              Markets
            </Link>
            <Link
              className="link-arrow"
              data-testid="hub-link-portfolio"
              to="/portfolio"
            >
              Portfolio
            </Link>
            <Link
              className="link-arrow"
              data-testid="hub-link-wallet"
              to="/wallet"
            >
              Wallet
            </Link>
          </div>
        </article>

        <article className="card hub-card" data-testid="hub-card-shop">
          <div className="hub-card-head">
            <span className="hub-icon">
              <ShopIcon />
            </span>
          </div>
          <h3>Gear shop</h3>
          {/* The count is the shop's own, added once it has answered. */}
          <p>
            Hardware wallets, mining rigs, node boxes and more
            {productCount !== undefined && (
              <>
                ,{" "}
                <span data-testid="hub-shop-count">
                  {productCount} products
                </span>{" "}
                in all
              </>
            )}
            .
          </p>
          <div className="hub-links">
            <Link
              className="link-arrow"
              data-testid="hub-link-products"
              to="/products"
            >
              Browse products
              <ArrowRightIcon />
            </Link>
          </div>
        </article>

        <article className="card hub-card" data-testid="hub-card-backoffice">
          <div className="hub-card-head">
            <span className="hub-icon">
              <OrdersIcon />
            </span>
          </div>
          <h3>Back office</h3>
          <p>
            Merchant orders and the staff directory. Signed in as staff: bank
            users, loan requests, the support inbox and shop orders, and for an
            admin the audit log and the books.
          </p>
          <div className="hub-links">
            <Link
              className="link-arrow"
              data-testid="hub-link-orders"
              to="/orders"
            >
              Orders
              <ArrowRightIcon />
            </Link>
            <Link
              className="link-arrow"
              data-testid="hub-link-users"
              to="/users"
            >
              Users
              <ArrowRightIcon />
            </Link>
          </div>
        </article>
      </div>

      {/* The practice areas, as chips. */}
      <div className="card card-pad">
        <h2>What you can practice here</h2>
        <div className="area-chips">
          {PRACTICE_AREAS.map((area) => (
            <span className="area-chip" key={area}>
              {area}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
