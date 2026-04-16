/**
 * Domain errors raised by the legend service. Routes map these to HTTP
 * status codes in the error handler.
 */

export class LegendNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Legend ${id} not found`);
    this.name = 'LegendNotFoundError';
  }
}

export class LegendValidationError extends Error {
  constructor(public readonly issues: readonly { path: string; message: string }[]) {
    super(`Legend validation failed: ${issues.map((i) => i.path).join(', ')}`);
    this.name = 'LegendValidationError';
  }
}

export class LegendProductNotFoundError extends Error {
  constructor(public readonly productId: string) {
    super(`Product ${productId} not found`);
    this.name = 'LegendProductNotFoundError';
  }
}
