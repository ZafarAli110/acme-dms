/** Thrown for a message this service cannot handle. The consumer dead-letters it instead of retrying. */
export class UnhandledMessageError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'UnhandledMessageError';
  }
}
