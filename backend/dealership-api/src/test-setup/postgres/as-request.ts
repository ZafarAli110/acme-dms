import type { UserContext } from "#business-logic-abstractions/user-context/user-context";
import { runWithDataScope, setDataScope } from "#request-scope/data-scope";

/** A handler as the controllers call it: the user first, then the request. */
type RequestHandler = { executeAsync(userContext: UserContext, ...args: never[]): unknown };

/**
 * The handler, working as a request does: each `executeAsync(userContext, …)` runs inside that user's data scope, which
 * is what the authorization guard sets in production, so Postgres row-level security applies to its queries. A handler
 * test then proves the policy and the handler together. Handlers that run outside a request (the export worker, the
 * message consumers) are not wrapped: they have no scope.
 */
export function asRequest<THandler extends RequestHandler>(handler: THandler): THandler {
  return new Proxy(handler, {
    get(target, property, receiver) {
      if (property !== "executeAsync") {
        return Reflect.get(target, property, receiver) as unknown;
      }
      return (userContext: UserContext, ...args: unknown[]): unknown =>
        runWithDataScope(() => {
          setDataScope({
            dealerId: userContext.dealerId,
            locationId: userContext.locationId,
            userId: userContext.userId,
          });
          return Reflect.apply(target.executeAsync, target, [userContext, ...args]) as unknown;
        });
    },
  });
}

/** Runs `work` as a request of this user does, in their data scope, for code that is not a handler (a service). */
export function inRequest<T>(userContext: UserContext, work: () => Promise<T>): Promise<T> {
  return runWithDataScope(() => {
    setDataScope({
      dealerId: userContext.dealerId,
      locationId: userContext.locationId,
      userId: userContext.userId,
    });
    return work();
  });
}
