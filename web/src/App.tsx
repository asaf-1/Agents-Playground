import { Link, Route, Routes } from "react-router-dom";

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
        <Link to="/">Home</Link> · <Link to="/about">About</Link>
      </nav>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
      </Routes>
    </main>
  );
}
