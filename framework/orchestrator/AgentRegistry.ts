// The agent registry: for each kind of failure, which agents run and in what
// order, and whether a QA run may recover from it by itself.

// The kinds of failure.
import type { FailureCategory } from "../agents/diagnosis/types";

// Every agent the incident router can call.
export type AgentStep =
  | "api-diagnose"
  | "classify"
  | "contract-recheck"
  | "evidence-collect"
  | "locator-heal"
  | "memory-record"
  | "network-recover"
  | "patch-propose"
  | "validate";

// One kind of failure's chain of agents.
export type AgentChain = {
  agents: AgentStep[];
  autoMitigationEligible: boolean;
  description: string;
};

// The chains. API, auth and permission failures are diagnosed and reported
// only; UI failures may also be recovered and re-checked.
const registry: Record<FailureCategory, AgentChain> = {
  // API failures: diagnose the request and propose a fix.
  "api-client-error": {
    agents: [
      "classify",
      "evidence-collect",
      "api-diagnose",
      "patch-propose",
      "memory-record",
    ],
    autoMitigationEligible: false,
    description:
      "Client-side API error - diagnose request payload and propose fix",
  },
  "api-contract-drift": {
    agents: [
      "classify",
      "evidence-collect",
      "api-diagnose",
      "patch-propose",
      "memory-record",
    ],
    autoMitigationEligible: false,
    description: "API contract drift - extract mismatch and propose alignment",
  },
  "api-server-error": {
    agents: [
      "classify",
      "evidence-collect",
      "api-diagnose",
      "patch-propose",
      "memory-record",
    ],
    autoMitigationEligible: false,
    description: "Backend server error - diagnose and propose fix direction",
  },
  "api-timeout": {
    agents: [
      "classify",
      "evidence-collect",
      "api-diagnose",
      "patch-propose",
      "memory-record",
    ],
    autoMitigationEligible: false,
    description:
      "API timeout - diagnose timeout evidence and propose the safest retry path",
  },
  // Signed out or not allowed: collect evidence, diagnose, and hand over.
  "auth-or-session": {
    agents: [
      "classify",
      "evidence-collect",
      "api-diagnose",
      "patch-propose",
      "memory-record",
    ],
    autoMitigationEligible: false,
    description:
      "Auth or session failure - capture redirect and status evidence before escalation",
  },
  "permissions-or-rbac": {
    agents: [
      "classify",
      "evidence-collect",
      "api-diagnose",
      "patch-propose",
      "memory-record",
    ],
    autoMitigationEligible: false,
    description:
      "Permission or RBAC failure - capture denied evidence and propose the owning fix path",
  },
  // A broken page contract: re-check it and propose a fix.
  "ui-contract-or-render": {
    agents: [
      "classify",
      "evidence-collect",
      "contract-recheck",
      "patch-propose",
      "memory-record",
    ],
    autoMitigationEligible: true,
    description:
      "Page render violation - recheck contract and propose permanent fix",
  },
  // Late data, an empty state, loading trouble: recover the request, then check
  // the page.
  "ui-delayed-data": {
    agents: [
      "classify",
      "evidence-collect",
      "network-recover",
      "contract-recheck",
      "validate",
      "memory-record",
    ],
    autoMitigationEligible: true,
    description:
      "Delayed data branch - recover through waits or retries and then validate",
  },
  "ui-empty-state": {
    agents: [
      "classify",
      "evidence-collect",
      "network-recover",
      "contract-recheck",
      "validate",
      "memory-record",
    ],
    autoMitigationEligible: true,
    description:
      "Unexpected empty state - retry or wait, then validate the recovered page",
  },
  "ui-loading-or-network": {
    agents: [
      "classify",
      "evidence-collect",
      "network-recover",
      "contract-recheck",
      "validate",
      "memory-record",
    ],
    autoMitigationEligible: true,
    description:
      "Loading or network issue - extend wait or refresh and validate",
  },
  // A stale locator, a dialog that did not open, the wrong page: heal the
  // locator, then check the page.
  "ui-missing-locator": {
    agents: [
      "classify",
      "evidence-collect",
      "locator-heal",
      "contract-recheck",
      "validate",
      "memory-record",
    ],
    autoMitigationEligible: true,
    description: "Missing or stale locator - heal and validate page contract",
  },
  "ui-modal-not-opened": {
    agents: [
      "classify",
      "evidence-collect",
      "locator-heal",
      "contract-recheck",
      "validate",
      "memory-record",
    ],
    autoMitigationEligible: true,
    description:
      "Modal interaction failure - recover the opener or dialog action, then validate",
  },
  "ui-route-or-navigation": {
    agents: [
      "classify",
      "evidence-collect",
      "locator-heal",
      "contract-recheck",
      "validate",
      "memory-record",
    ],
    autoMitigationEligible: true,
    description:
      "Navigation failure - recover the route transition and validate the destination page",
  },
  // Anything else: class it as well as possible and propose what to look into.
  unknown: {
    agents: ["classify", "evidence-collect", "patch-propose", "memory-record"],
    autoMitigationEligible: false,
    description:
      "Unknown failure - classify best-effort and propose investigation path",
  },
};

// Looks up the chain for one kind of failure.
export class AgentRegistry {
  lookup(category: FailureCategory): AgentChain {
    return registry[category];
  }
}
