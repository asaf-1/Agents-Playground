import { Link } from "react-router-dom";
import { HeroArt } from "../components/HeroArt";
import {
  ArrowRightIcon,
  BankIcon,
  CoinIcon,
  OrdersIcon,
  ShopIcon,
} from "../components/icons";
import { Badge } from "../components/ui";

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

// The hub. The heading text and the nav-about link are what the shell test
// reads; everything around them is new.
export function HomePage() {
  return (
    <section data-testid="app-home" className="page">
      <div className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Playground Bank · QA practice</p>
          <h1 data-testid="app-heading">
            Agents <span className="grad-text">Playground</span> React surface
          </h1>
          <p className="lead">
            A bank, a crypto exchange and a back office in one practice site.
            Fake money, real flows, and bugs planted on purpose for you to find.
          </p>
          <p className="hero-meta">
            Vite + React + TypeScript shell served by the Node API under /app.
          </p>
          <div className="hero-actions">
            <Link
              className="btn btn-primary"
              data-testid="hub-cta-shop"
              to="/products"
            >
              Open the gear shop
              <ArrowRightIcon />
            </Link>
            <Link className="btn" data-testid="nav-about" to="/about">
              Go to About
            </Link>
          </div>
        </div>
        <HeroArt className="hero-art" />
      </div>

      <div className="section-head">
        <h2>Explore</h2>
        <p className="muted">
          Pick an area. More open as Playground Bank grows.
        </p>
      </div>

      <div className="hub-grid">
        <article className="card hub-card" data-testid="hub-card-bank">
          <div className="hub-card-head">
            <span className="hub-icon">
              <BankIcon />
            </span>
          </div>
          <h3>Bank</h3>
          <p>
            Accounts, transfers, history and CSV statements. Bill pay and loans
            are next.
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
            <Badge value="Soon" />
          </div>
          <h3>Crypto exchange</h3>
          <p>Live prices, buying and selling, a wallet and a portfolio.</p>
        </article>

        <article className="card hub-card" data-testid="hub-card-shop">
          <div className="hub-card-head">
            <span className="hub-icon">
              <ShopIcon />
            </span>
          </div>
          <h3>Gear shop</h3>
          <p>
            48 products: hardware wallets, mining rigs, node boxes and more.
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
          <p>Merchant orders and the staff directory.</p>
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
