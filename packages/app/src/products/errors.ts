/**
 * Domain errors raised by the product service. Routes map these to HTTP
 * status codes in the error handler.
 */

export class ProductNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Product ${id} not found`);
    this.name = 'ProductNotFoundError';
  }
}

export class DuplicateSlugError extends Error {
  constructor(public readonly slug: string) {
    super(`Product with slug "${slug}" already exists`);
    this.name = 'DuplicateSlugError';
  }
}

export class ProductValidationError extends Error {
  constructor(public readonly issues: readonly { path: string; message: string }[]) {
    super(`Product validation failed: ${issues.map((i) => i.path).join(', ')}`);
    this.name = 'ProductValidationError';
  }
}
