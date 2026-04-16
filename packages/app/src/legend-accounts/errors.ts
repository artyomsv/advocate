export class LegendAccountNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Legend account ${id} not found`);
    this.name = 'LegendAccountNotFoundError';
  }
}

export class LegendAccountValidationError extends Error {
  constructor(public readonly issues: readonly { path: string; message: string }[]) {
    super(`Legend account validation failed: ${issues.map((i) => i.path).join(', ')}`);
    this.name = 'LegendAccountValidationError';
  }
}

export class LegendAccountLegendNotFoundError extends Error {
  constructor(public readonly legendId: string) {
    super(`Legend ${legendId} not found (cannot create account for missing legend)`);
    this.name = 'LegendAccountLegendNotFoundError';
  }
}

export class IllegalWarmUpTransitionError extends Error {
  constructor(public readonly from: string, public readonly to: string) {
    super(`Illegal warm-up transition: ${from} → ${to}`);
    this.name = 'IllegalWarmUpTransitionError';
  }
}

export class CredentialNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Credential ${id} not found`);
    this.name = 'CredentialNotFoundError';
  }
}
