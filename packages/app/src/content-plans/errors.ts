export class ContentPlanNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Content plan ${id} not found`);
    this.name = 'ContentPlanNotFoundError';
  }
}

export class IllegalStatusTransitionError extends Error {
  constructor(
    public readonly id: string,
    public readonly from: string,
    public readonly to: string,
  ) {
    super(`Content plan ${id} cannot transition from ${from} to ${to}`);
    this.name = 'IllegalStatusTransitionError';
  }
}
