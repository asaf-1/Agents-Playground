import { promises as fs } from "fs";
import path from "path";
import type { FailureCategory, FailureClassification } from "../agents/diagnosis/types";
import type { RecoveryStrategyKind } from "../agents/recovery/types";

export type IncidentMemoryRecord = {
  classification: FailureClassification;
  executionPlan: {
    escalationReason: string | null;
    strategyOrder: RecoveryStrategyKind[];
    workerOrder: string[];
  };
  finalStatus: "escalate" | "mitigated" | "unresolved";
  incidentId: string;
  pageLabel?: string;
  recordedAt: string;
  recovered: boolean;
  scenario: string;
  strategyUsed: RecoveryStrategyKind | null;
  validationPassed: boolean;
};

const defaultMemoryPath = path.join(
  process.cwd(),
  "obsidian-vault",
  "Reports",
  "Incidents",
  "incident-memory.json"
);

export class IncidentMemoryStore {
  constructor(private readonly filePath = defaultMemoryPath) {}

  async record(record: IncidentMemoryRecord): Promise<IncidentMemoryRecord> {
    const existing = await this.readAll();
    existing.push(record);

    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, `${JSON.stringify(existing, null, 2)}\n`);

    return record;
  }

  async readAll(): Promise<IncidentMemoryRecord[]> {
    try {
      const raw = await fs.readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(raw);

      return Array.isArray(parsed) ? (parsed as IncidentMemoryRecord[]) : [];
    } catch {
      return [];
    }
  }

  async getSuccessfulStrategies(category: FailureCategory) {
    const entries = await this.readAll();

    return Array.from(
      new Set(
        entries
          .filter((entry) => entry.classification.category === category && entry.recovered)
          .map((entry) => entry.strategyUsed)
          .filter(Boolean)
      )
    );
  }
}
