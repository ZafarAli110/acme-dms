import { type MiddlewareFunction, RouterContextProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type { AuthKernel, AuthSnapshot } from "../../kernel/authKernel";
import type { LocationKernel, LocationSnapshot } from "../../kernel/locationKernel";
import { authClientMiddleware } from "../authClientMiddleware";
import { AUTH_KERNEL_CONTEXT, LOCATION_KERNEL_CONTEXT } from "../routerContext";

/** The middleware's context, with kernels that have already resolved to these snapshots. */
function contextWith(auth: AuthSnapshot, location: LocationSnapshot): RouterContextProvider {
  const authKernel = { waitForResolvedAuthAsync: () => Promise.resolve(auth) } as unknown as AuthKernel;
  const locationKernel = { waitForResolvedLocationAsync: () => Promise.resolve(location) } as unknown as LocationKernel;
  return new RouterContextProvider(
    new Map<Parameters<RouterContextProvider["get"]>[0], unknown>([
      [AUTH_KERNEL_CONTEXT, authKernel],
      [LOCATION_KERNEL_CONTEXT, locationKernel],
    ]),
  );
}

async function runAsync(context: RouterContextProvider): Promise<unknown> {
  const next = vi.fn(() => Promise.resolve(new Response()));
  const args = { context, request: new Request("http://acme.test/"), params: {} } as unknown as Parameters<
    MiddlewareFunction<Response>
  >[0];
  try {
    return await (authClientMiddleware as MiddlewareFunction<Response>)(args, next);
  } catch (thrown: unknown) {
    return thrown;
  }
}

const signedIn = {
  status: "signed-in",
  user: {
    id: "user-rita",
    email: "rita@northwind.test",
    displayName: "Rita",
    dealerId: "dealer-northwind",
    dealerName: "Northwind Motors",
    locations: [],
    defaultLocationId: null,
  },
} as AuthSnapshot;

describe("authClientMiddleware", () => {
  // The state sweep's F9: signed in at no location went to /sign-in, which sends a signed-in user home: a loop.
  it("shows the error page, never the sign-in page, to a signed-in user who works at no location", async () => {
    const thrown = await runAsync(contextWith(signedIn, { status: "no-location", locations: [], current: null }));

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBeInstanceOf(Response);
  });

  it("sends a signed-out visitor to the sign-in page", async () => {
    const thrown = await runAsync(
      contextWith({ status: "signed-out", user: null } as AuthSnapshot, {
        status: "signed-out",
        locations: [],
        current: null,
      }),
    );

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).headers.get("Location")).toBe("/sign-in");
  });
});
