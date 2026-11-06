import { i18n } from "../../i18n";
import { API_CONFIG } from "../config/api";
import {
  ApiError,
  PROBLEM_TYPE,
  type ProblemDetailsDto,
  RequestTimeoutError,
  ServerUnreachableError,
} from "../config/apiErrors";
import { session } from "../storage/sessionStore";
import { sessionExpiry } from "./sessionExpiry";

export interface RequestOptions {
  /** Cancels the request, e.g. TanStack Query's `signal` when a query is no longer needed. */
  signal?: AbortSignal;
  /** True for a request that is not made as the signed-in person (the token endpoints): no token, no refresh and retry. */
  anonymous?: boolean;
}

/** The token endpoints answer 401 for a wrong password or a ended sign-in; that is their answer, not a reason to refresh. */
const TOKEN_ENDPOINTS = `${API_CONFIG.identityUrl}/v1/tokens`;

/** What identity-api requires of a refresh or revoke: a header only the page itself adds (a form on another site cannot). */
const FROM_THE_PAGE = { "x-requested-with": "acme-web" };

/** One refresh at a time across every open tab of the app (Web Locks), where the browser has them. */
function withRefreshLock<T>(work: () => Promise<T>): Promise<T> {
  return typeof navigator !== "undefined" && "locks" in navigator
    ? navigator.locks.request("acme.refresh", work)
    : work();
}

/**
 * The only code that calls `fetch` for the services. Sends the signed-in user's token and the selected location
 * (`x-location-id`), applies a timeout, and turns every failure into a typed error: `ApiError` with the service's
 * problem details, `ServerUnreachableError` or `RequestTimeoutError`.
 */
class ApiClient {
  /** One refresh at a time, whatever number of requests found the token expired together. */
  private _refreshing: Promise<boolean> | null = null;

  public getAsync<T>(url: string, options?: RequestOptions): Promise<T> {
    return this.requestAsync<T>(url, { method: "GET" }, options);
  }

  public postAsync<T>(url: string, body: unknown, options?: RequestOptions): Promise<T> {
    return this.requestAsync<T>(url, jsonInit("POST", body), options);
  }

  public putAsync<T>(url: string, body: unknown, options?: RequestOptions): Promise<T> {
    return this.requestAsync<T>(url, jsonInit("PUT", body), options);
  }

  public patchAsync<T>(url: string, body: unknown, options?: RequestOptions): Promise<T> {
    return this.requestAsync<T>(url, jsonInit("PATCH", body), options);
  }

  public deleteAsync<T>(url: string, options?: RequestOptions): Promise<T> {
    return this.requestAsync<T>(url, { method: "DELETE" }, options);
  }

  /** Multipart: a record and its files in one request. */
  public postFormAsync<T>(url: string, formData: FormData, options?: RequestOptions): Promise<T> {
    return this.requestAsync<T>(url, { method: "POST", body: formData }, options);
  }

  /** Multipart: a record and its files in one request. */
  public patchFormAsync<T>(url: string, formData: FormData, options?: RequestOptions): Promise<T> {
    return this.requestAsync<T>(url, { method: "PATCH", body: formData }, options);
  }

  /** A binary resource (an image variant), with the same headers and error handling. */
  public async getBlobAsync(url: string, options?: RequestOptions): Promise<Blob> {
    const response = await this.sendAsync(url, { method: "GET" }, options);
    if (!response.ok) {
      return this.throwResponseErrorAsync(response);
    }
    return response.blob();
  }

  private async requestAsync<T>(url: string, init: RequestInit, options?: RequestOptions): Promise<T> {
    const response = await this.sendAsync(url, init, options);
    if (!response.ok) {
      return this.throwResponseErrorAsync(response);
    }
    return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
  }

  /**
   * Sends the request as the signed-in person. An access token lives minutes: a 401 for a token this tab sent is the
   * token expiring, so it is traded once for a new one (the refresh cookie) and the request is sent again. When the
   * service refuses the cookie the sign-in is over (`sessionExpiry`), and the caller gets the 401 it had.
   */
  private async sendAsync(url: string, init: RequestInit, options?: RequestOptions): Promise<Response> {
    const response = await this.sendOnceAsync(url, init, options);
    const canRefresh =
      response.status === 401 &&
      options?.anonymous !== true &&
      !url.startsWith(TOKEN_ENDPOINTS) &&
      session.getToken() !== null;
    if (!canRefresh) {
      return response;
    }
    let refreshed: boolean;
    try {
      refreshed = await this.refreshAccessTokenAsync();
    } catch {
      // No answer from the service: the sign-in is kept, the caller gets its 401, and the next request tries again.
      return response;
    }
    if (!refreshed) {
      sessionExpiry.expire();
      return response;
    }
    return this.sendOnceAsync(url, init, options);
  }

  /**
   * Trades the refresh cookie for a new access token, kept in `session`. True when there is one; false when identity-api
   * refused the cookie (no sign-in, ended, or used twice); throws when it cannot be reached. One at a time in this tab, and
   * one at a time across the tabs (a lock), because each refresh replaces the cookie: a second tab asking with the cookie
   * the first just replaced would look like a stolen one.
   */
  public refreshAccessTokenAsync(): Promise<boolean> {
    this._refreshing ??= withRefreshLock(() => this.refreshOnceAsync()).finally(() => {
      this._refreshing = null;
    });
    return this._refreshing;
  }

  private async refreshOnceAsync(): Promise<boolean> {
    const response = await this.sendOnceAsync(
      `${TOKEN_ENDPOINTS}/refresh`,
      { method: "POST", headers: FROM_THE_PAGE },
      { anonymous: true },
    );
    if (response.ok) {
      const { accessToken } = (await response.json()) as { accessToken: string };
      session.setToken(accessToken);
      return true;
    }
    if (response.status === 401) {
      return false;
    }
    throw new ServerUnreachableError();
  }

  /** Ends the sign-in on identity-api and removes the refresh cookie. Never fails: signing out here does not wait for it. */
  public async revokeSignInAsync(): Promise<void> {
    try {
      await this.sendOnceAsync(
        `${TOKEN_ENDPOINTS}/revoke`,
        { method: "POST", headers: FROM_THE_PAGE },
        { anonymous: true, signal: AbortSignal.timeout(2000) },
      );
    } catch {
      // Nothing to do: the person is signed out in this tab either way.
    }
  }

  private async sendOnceAsync(url: string, init: RequestInit, options?: RequestOptions): Promise<Response> {
    // Stops at the timeout or when the caller cancels (TanStack Query, when a query is no longer needed).
    const timeout = AbortSignal.timeout(API_CONFIG.timeoutMs);
    const signal = options?.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

    const token = options?.anonymous === true ? null : session.getToken();
    const locationId = options?.anonymous === true ? null : session.getLocationId();
    // The caller's headers (a JSON body's content type) plus who is asking and where. A FormData body gets its
    // multipart content type, with the boundary, from fetch itself.
    const headers = new Headers(init.headers);
    if (token) {
      headers.set("authorization", `Bearer ${token}`);
    }
    if (locationId) {
      headers.set("x-location-id", locationId);
    }
    // The language the user chose in the app, not the browser's: the services answer their messages in it.
    headers.set("accept-language", i18n.resolvedLanguage ?? i18n.language);
    try {
      return await fetch(url, { ...init, signal, headers });
    } catch (error) {
      if (timeout.aborted) {
        throw new RequestTimeoutError();
      }
      // A network failure; a caller's cancellation is passed on as it is, so TanStack Query sees its own abort.
      if (error instanceof TypeError) {
        throw new ServerUnreachableError();
      }
      throw error;
    }
  }

  private async throwResponseErrorAsync(response: Response): Promise<never> {
    if ((response.headers.get("content-type") ?? "").includes("application/problem+json")) {
      throw new ApiError((await response.json()) as ProblemDetailsDto);
    }
    // Not from a service (for example the gateway or the dev proxy): build the same shape so callers handle one type.
    throw new ApiError({
      type: problemTypeForStatus(response.status),
      title: response.statusText,
      status: response.status,
      detail: `HTTP ${response.status}: ${response.statusText}`,
      instance: new URL(response.url, window.location.origin).pathname,
      location: null,
      userId: null,
      traceId: null,
      timestamp: Temporal.Now.instant().toString({ smallestUnit: "millisecond" }),
    });
  }
}

/** A request with a JSON body: serialised here, and labelled as JSON where it is serialised. */
function jsonInit(method: string, body: unknown): RequestInit {
  return { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } };
}

function problemTypeForStatus(status: number): string {
  switch (status) {
    case 400:
    case 422:
      return PROBLEM_TYPE.validation;
    case 401:
      return PROBLEM_TYPE.unauthorized;
    case 403:
      return PROBLEM_TYPE.forbidden;
    case 404:
      return PROBLEM_TYPE.notFound;
    case 409:
      return PROBLEM_TYPE.conflict;
    case 429:
      return PROBLEM_TYPE.tooManyRequests;
    case 503:
      return PROBLEM_TYPE.serviceUnavailable;
    default:
      return PROBLEM_TYPE.internal;
  }
}

export const apiClient = new ApiClient();
