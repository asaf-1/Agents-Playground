// The incident memory: one JSON file of past incidents, so a later run can ask
// which recovery worked before for the same kind of failure. It lives in
// obsidian-vault/Reports/Incidents/ unless a test gives its own file.

// Node's file and path tools.
import { promises as fs } from "fs";
import path from "path";
// The failure and strategy shapes.
import type {
  FailureCategory,
  FailureClassification,
} from "../agents/diagnosis/types";
import type { RecoveryStrategyKind } from "../agents/recovery/types";

// One incident as stored: its class, the plan, how it ended, and the strategy
// that worked.
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

// Where the memory is kept by default.
const defaultMemoryPath = path.join(
  process.cwd(),
  "obsidian-vault",
  "Reports",
  "Incidents",
  "incident-memory.json",
);

// One store per file.
export class IncidentMemoryStore {
  constructor(private readonly filePath = defaultMemoryPath) {}

  // Adds one incident to the file.
  async record(record: IncidentMemoryRecord): Promise<IncidentMemoryRecord> {
    const existing = await this.readAll();
    existing.push(record);

    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, `${JSON.stringify(existing, null, 2)}\n`);

    return record;
  }

  // Every incident in the file; none when the file is missing or unreadable.
  async readAll(): Promise<IncidentMemoryRecord[]> {
    try {
      const raw = await fs.readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(raw);

      return Array.isArray(parsed) ? (parsed as IncidentMemoryRecord[]) : [];
    } catch {
      return [];
    }
  }

  // The strategies that recovered this kind of failure before, each once.
  async getSuccessfulStrategies(category: FailureCategory) {
    const entries = await this.readAll();

    return Array.from(
      new Set(
        entries
          .filter(
            (entry) =>
              entry.classification.category === category && entry.recovered,
          )
          .map((entry) => entry.strategyUsed)
          .filter(Boolean),
      ),
    );
  }
}
