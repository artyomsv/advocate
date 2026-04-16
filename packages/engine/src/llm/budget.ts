import type { BudgetStatus, LlmUsageRecord } from './types.js';

export interface BudgetTracker {
  record(usage: LlmUsageRecord): Promise<void>;
  /** Budget status for the month containing `now`. Defaults to the actual now. */
  getStatus(now?: Date): Promise<BudgetStatus>;
  /** Records since `since` in chronological order. */
  getRecords(since: Date): Promise<readonly LlmUsageRecord[]>;
}

export interface BudgetTrackerOptions {
  monthlyCapCents: number;
}

export class InMemoryBudgetTracker implements BudgetTracker {
  readonly #records: LlmUsageRecord[] = [];
  readonly #monthlyCapCents: number;

  constructor(options: BudgetTrackerOptions) {
    this.#monthlyCapCents = options.monthlyCapCents;
  }

  async record(usage: LlmUsageRecord): Promise<void> {
    this.#records.push(usage);
  }

  async getStatus(now: Date = new Date()): Promise<BudgetStatus> {
    const { year, month } = ym(now);
    const millicentsThisMonth = this.#records
      .filter((r) => {
        const d = new Date(r.occurredAt);
        return d.getUTCFullYear() === year && d.getUTCMonth() === month;
      })
      .reduce((sum, r) => sum + r.costMillicents, 0);

    // Convert millicents to cents: divide by 1000. Round UP so aggregate display
    // is conservative (never undercounts).
    const spentCents = Math.ceil(millicentsThisMonth / 1000);
    const remainingCents = Math.max(0, this.#monthlyCapCents - spentCents);

    // Linear extrapolation for projection.
    const daysElapsed = Math.max(1, now.getUTCDate());
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const projectedMonthEndCents = Math.ceil((spentCents / daysElapsed) * daysInMonth);

    return {
      monthlyCapCents: this.#monthlyCapCents,
      spentCents,
      remainingCents,
      projectedMonthEndCents,
    };
  }

  async getRecords(since: Date): Promise<readonly LlmUsageRecord[]> {
    return this.#records
      .filter((r) => new Date(r.occurredAt).getTime() >= since.getTime())
      .sort((a, b) => (a.occurredAt < b.occurredAt ? -1 : 1));
  }
}

function ym(d: Date): { year: number; month: number } {
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
}
