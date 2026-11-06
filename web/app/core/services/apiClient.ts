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
  /** True for signing in and out: a 401 is that request's own answer (a wrong password), not the end of the sign-in. */
  anonymous?: boolean;
}

/**
 * Every request carries this header, which only the page itself can add (a form or a link from another site cannot): the
 * gateway refuses a request that changes something without it, since the session cookie goes with every request.
 */
const FROM_THE_PAGE = { name: "x-requested-with", value: "acme-web" } as const;

/**
 * The only code that calls `fetch` for the services. The browser sends the session cookie itself (the gateway turns it into
 * the access token the services check); this adds the selected location (`x-location-id`) and the page's own header,
 * applies a timeout, and turns every failure into a typed error: `ApiError` with the service's problem details,
 * `ServerUnreachableError` or `RequestTimeoutError`.
 */
class ApiClient {
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
   * Sends the request. The gateway renews the access token itself, so a 401 for a signed-in tab means the sign-in is over
   * (signed out in another browser, ended at identity-api, or run out): the app says so (`sessionExpiry`), and the caller
   * gets the 401 it had.
   */
  private async sendAsync(url: string, init: RequestInit, options?: RequestOptions): Promise<Response> {
    const response = await this.sendOnceAsync(url, init, options);
    if (response.status === 401 && options?.anonymous !== true && session.isSignedIn()) {
      sessionExpiry.expire();
    }
    return response;
  }

  /**
   * Ends the sign-in at the gateway, which deletes the session and removes the cookie: from then on nothing signs in with
   * it. True when the gateway answered; false when it could not be reached in time, in which case the cookie is still good
   * and the caller must try again (`session.setRevokePending`).
   */
  public async signOutAsync(): Promise<boolean> {
    try {
      const response = await this.sendOnceAsync(
        API_CONFIG.sessionUrl,
        { method: "DELETE" },
        { anonymous: true, signal: AbortSignal.timeout(API_CONFIG.signOutWaitMs) },
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  private async sendOnceAsync(url: string, init: RequestInit, options?: RequestOptions): Promise<Response> {
    // Stops at the timeout or when the caller cancels (TanStack Query, when a query is no longer needed).
    const timeout = AbortSignal.timeout(API_CONFIG.timeoutMs);
    const signal = options?.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

    const locationId = options?.anonymous === true ? null : session.getLocationId();
    // The caller's headers (a JSON body's content type) plus where, and that the page itself is asking. A FormData body
    // gets its multipart content type, with the boundary, from fetch itself.
    const headers = new Headers(init.headers);
    headers.set(FROM_THE_PAGE.name, FROM_THE_PAGE.value);
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
