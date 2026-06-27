import { Link, Route, Routes } from "react-router-dom";
import { OrdersPage } from "./pages/OrdersPage";
import { UsersPage } from "./pages/UsersPage";
import { AccountPage } from "./pages/AccountPage";
import { ProductsPage } from "./pages/ProductsPage";
import { ProductDetailPage } from "./pages/ProductDetailPage";

function Home() {
  return (
    <section data-testid="app-home">
      <h1 data-testid="app-heading">Agents Playground React surface</h1>
      <p>Vite + React + TypeScript shell served by the Node API under /app.</p>
      <Link data-testid="nav-about" to="/about">
        Go to About
      </Link>
    </section>
  );
}

function About() {
  return (
    <section data-testid="app-about">
      <h1 data-testid="app-heading">About this surface</h1>
      <p>Client-side routing works via the server SPA fallback.</p>
      <Link data-testid="nav-home" to="/">
        Back home
      </Link>
    </section>
  );
}

export function App() {
  return (
    <main data-testid="app-main">
      <nav data-testid="app-nav">
        <Link data-testid="nav-link-home" to="/">
          Home
        </Link>
        <Link data-testid="nav-link-orders" to="/orders">
          Orders
        </Link>
        <Link data-testid="nav-link-users" to="/users">
          Users
        </Link>
        <Link data-testid="nav-link-products" to="/products">
          Products
        </Link>
        <Link data-testid="nav-link-account" to="/account">
          Account
        </Link>
        <Link data-testid="nav-link-about" to="/about">
          About
        </Link>
      </nav>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/products/:id" element={<ProductDetailPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/about" element={<About />} />
      </Routes>
    </main>
  );
}
