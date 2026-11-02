/**
 * Thrown for a message this service does not handle. Like any error the consumer catches, the message is
 * dead-lettered.
 */
export class UnhandledMessageError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "UnhandledMessageError";
  }
}
