import type { FailureCategory } from "../agents/diagnosis/types";

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

export type AgentChain = {
  agents: AgentStep[];
  autoMitigationEligible: boolean;
  description: string;
};

const registry: Record<FailureCategory, AgentChain> = {
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
  unknown: {
    agents: ["classify", "evidence-collect", "patch-propose", "memory-record"],
    autoMitigationEligible: false,
    description:
      "Unknown failure - classify best-effort and propose investigation path",
  },
};

export class AgentRegistry {
  lookup(category: FailureCategory): AgentChain {
    return registry[category];
  }
}
