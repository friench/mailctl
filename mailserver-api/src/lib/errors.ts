/**
 * Domain-level error with an HTTP status. Caught by the error middleware
 * and turned into a JSON response.
 */
export class BusinessError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'BusinessError';
  }
}
