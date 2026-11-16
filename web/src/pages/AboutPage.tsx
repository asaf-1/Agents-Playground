// The About page: who built the site, what it is for, and what runs behind it.

// The data cache, and the router's link.
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
// One icon per highlight, and one per way to get in touch.
import {
  Bot,
  Container,
  FlaskConical,
  FolderGit2,
  Handshake,
  Mail,
  PhoneCall,
  Target,
  Webhook,
  Workflow,
} from "lucide-react";
// The avatar and page heading, and practice mode's key and call (for the
// number of planted faults, read live, never written here).
import { Avatar, PageHeader } from "../components/ui";
import { PRACTICE_KEY } from "../components/PracticeSwitch";
import { getPractice } from "../practiceApi";

// How to reach Asaf for business, as he gave them for this page
// (2026-11-16): each as a link a browser can open (mail, a call, GitHub),
// and as it is shown.
const CONTACTS = [
  {
    id: "email",
    icon: <Mail aria-hidden="true" />,
    label: "Email",
    href: "mailto:asafnuriqa@gmail.com",
    shown: "asafnuriqa@gmail.com",
  },
  {
    id: "phone",
    icon: <PhoneCall aria-hidden="true" />,
    label: "Phone",
    href: "tel:+972524200706",
    shown: "+972 52-420-0706",
  },
  {
    // His main GitHub, not this repository (Asaf: "more projects and work
    // below my main github not this repo").
    id: "github",
    icon: <FolderGit2 aria-hidden="true" />,
    label: "More projects and work",
    href: "https://github.com/asaf-1",
    shown: "github.com/asaf-1",
  },
];

// What runs behind the site, one card each. Every line is something the
// repository really runs; the number of faults comes from the server.
function highlights(faults: number | undefined) {
  return [
    {
      id: "practice",
      icon: <Target aria-hidden="true" />,
      title: "Built for practice",
      text: `${faults === undefined ? "Faults" : `${faults} faults`} planted on purpose, from a total that doesn't add up to another customer's data. Each has a hint and an answer, comes alive for you alone, one at a time or all together, and your progress is saved on your own account.`,
    },
    {
      id: "bank",
      icon: <Workflow aria-hidden="true" />,
      title: "A real bank behind it",
      text: "Accounts in Postgres, transfers, bill pay, cards and loans, a crypto exchange with trading and a wallet, and a shop with a real checkout, a back office and an audit log. Nothing is fixed: prices, rates and balances differ for every customer.",
    },
    {
      id: "apis",
      icon: <Webhook aria-hidden="true" />,
      title: "APIs worth testing",
      text: "A REST API documented in OpenAPI 3.1, with contract tests that check its live answers against the document, a GraphQL API over the same bank, and personal API keys with scopes and a rate limit.",
    },
    {
      id: "tests",
      icon: <FlaskConical aria-hidden="true" />,
      title: "Tested like a product",
      text: "A Playwright suite runs on every pull request, split into four shards, with a unit suite beside it. Every test prints a result block: what it expected, each API call and its status, and the values it used.",
    },
    {
      id: "agents",
      icon: <Bot aria-hidden="true" />,
      title: "AI agents that fix tests, not the app",
      text: "Agents that plan, generate, diagnose, heal and report test failures, and a bug hunt where Claude explores the bank like a tester, then scores itself against the planted faults.",
    },
    {
      id: "platform",
      icon: <Container aria-hidden="true" />,
      title: "Run like a platform",
      text: "A Kubernetes cluster built by Terraform, a canary after every merge, an OWASP ZAP security scan, tracing with OpenTelemetry and Jaeger, and a remote test runner for colleagues who have no access to the repository.",
    },
  ];
}

// The heading, the author card, what runs behind the site, and the
// practice-site facts.
export function AboutPage() {
  // How many faults are planted, from the server.
  const practice = useQuery({ queryKey: PRACTICE_KEY, queryFn: getPractice });

  return (
    <section data-testid="app-about" className="page">
      <PageHeader
        eyebrow="About"
        title="About Playground Bank"
        description={
          <p className="page-sub">
            A real web app that breaks on purpose, and the AI agents that fix
            the tests.
          </p>
        }
      />

      {/* Who built it, what they do, and why this site. */}
      <div className="card card-pad author-card" data-testid="about-author">
        <div className="author-head">
          <Avatar name="Asaf Nuri" seed="asaf-nuri" />
          <div>
            <p className="eyebrow">Built by</p>
            <h2 data-testid="about-author-name">Asaf Nuri</h2>
            <p className="author-title">Quality Platform Engineer</p>
          </div>
        </div>
        <div className="author-body">
          <div>
            <h3>What I do</h3>
            <p>
              I build the systems that let a team ship with confidence: test
              frameworks that stay stable as the product changes, CI pipelines
              that gate every merge, and AI agents that find, diagnose and
              report what breaks. This site is that work in one place, running
              and tested, not a slide deck.
            </p>
          </div>
          <div>
            <h3>Why this site</h3>
            <p>
              Most practice sites are a login form and a to-do list. Real bugs
              hide in money that doesn&apos;t add up, a check that&apos;s
              missing, or another customer&apos;s data. Playground Bank gives
              testers exactly that: a realistic bank and crypto exchange with
              fake money and faults planted the way real ones hide. It&apos;s
              also the target my own AI QA agents train on.
            </p>
          </div>
        </div>
        {/* The way in. */}
        <div className="btn-row">
          <Link
            className="btn btn-primary"
            data-testid="about-practice"
            to="/practice"
          >
            Start practicing
          </Link>
        </div>
      </div>

      {/* How to reach Asaf for business. */}
      <div className="card card-pad about-contact" data-testid="about-contact">
        <h2>
          <Handshake aria-hidden="true" />
          Business inquiries
        </h2>
        <ul className="about-contact-list">
          {CONTACTS.map((contact) => (
            <li key={contact.id}>
              <span className="hub-icon">{contact.icon}</span>
              <div>
                <p className="about-contact-label">{contact.label}</p>
                <a
                  data-testid={`about-contact-${contact.id}`}
                  href={contact.href}
                  {...(contact.href.startsWith("http")
                    ? { target: "_blank", rel: "noreferrer" }
                    : {})}
                >
                  {contact.shown}
                </a>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* What runs behind the site, one card each. */}
      <div className="section-head">
        <h2>What runs behind it</h2>
      </div>
      <div className="about-grid" data-testid="about-highlights">
        {highlights(practice.data?.total).map((item) => (
          <article
            key={item.id}
            className="card hub-card"
            data-testid={`about-highlight-${item.id}`}
          >
            <span className="hub-icon">{item.icon}</span>
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </article>
        ))}
      </div>

      {/* What the site is: fake money, planted bugs, the stack. */}
      <div className="card card-pad">
        <h2>Playground Bank is a practice site</h2>
        <ul className="check-list">
          <li>
            Fake money only. Nothing here is a real bank, and it never needs
            real payment details.
          </li>
          <li>
            Bugs are planted on purpose. They stay off unless you turn them on,
            and then only for you.
          </li>
          <li>
            Built with React, TypeScript and Vite, served by a Node server with
            no framework, over Postgres.
          </li>
        </ul>
        <Link className="btn" data-testid="nav-home" to="/">
          Back home
        </Link>
      </div>
    </section>
  );
}
