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
  /** More headers for this request (an Idempotency-Key). */
  headers?: Record<string, string>;
  /** False for a request that lasts as long as the work it follows (server-sent events): no timeout. */
  timeout?: boolean;
  /** True for a request that is not made as the signed-in person (the token endpoints): no token, no refresh and retry. */
  anonymous?: boolean;
}

/** The token endpoints answer 401 for a wrong password or a ended sign-in; that is their answer, not a reason to refresh. */
const TOKEN_ENDPOINTS = `${API_CONFIG.identityUrl}/v1/tokens`;

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

  /**
   * Server-sent events: each event's JSON `data` goes to `onEvent`, until the server ends the stream or `signal`
   * aborts. No timeout: it lasts as long as the work it follows. Same headers and errors as any request.
   */
  public async readEventsAsync<T>(url: string, onEvent: (data: T) => void, options?: RequestOptions): Promise<void> {
    const response = await this.sendAsync(
      url,
      { method: "GET", headers: { accept: "text/event-stream" } },
      { ...options, timeout: false },
    );
    if (!response.ok || !response.body) {
      return this.throwResponseErrorAsync(response);
    }
    let buffer = "";
    for await (const chunk of response.body.pipeThrough(new TextDecoderStream())) {
      buffer += chunk;
      let end = buffer.indexOf("\n\n");
      while (end >= 0) {
        const data = buffer
          .slice(0, end)
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        buffer = buffer.slice(end + 2);
        if (data) {
          onEvent(JSON.parse(data) as T);
        }
        end = buffer.indexOf("\n\n");
      }
    }
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
   * token expiring, so it is traded once for a new one (the refresh token) and the request is sent again. When the
   * service refuses the refresh token the sign-in is over (`sessionExpiry`), and the caller gets the 401 it had.
   */
  private async sendAsync(url: string, init: RequestInit, options?: RequestOptions): Promise<Response> {
    const response = await this.sendOnceAsync(url, init, options);
    const canRefresh =
      response.status === 401 &&
      options?.anonymous !== true &&
      !url.startsWith(TOKEN_ENDPOINTS) &&
      session.getToken() !== null &&
      session.getRefreshToken() !== null;
    if (!canRefresh || !(await this.refreshAsync())) {
      return response;
    }
    return this.sendOnceAsync(url, init, options);
  }

  private refreshAsync(): Promise<boolean> {
    this._refreshing ??= this.refreshOnceAsync().finally(() => {
      this._refreshing = null;
    });
    return this._refreshing;
  }

  /** True when this tab has a new access token. No answer from the service keeps the sign-in: the next 401 tries again. */
  private async refreshOnceAsync(): Promise<boolean> {
    const refreshToken = session.getRefreshToken();
    if (refreshToken === null) {
      return false;
    }
    try {
      const response = await this.sendOnceAsync(`${TOKEN_ENDPOINTS}/refresh`, jsonInit("POST", { refreshToken }), {
        anonymous: true,
      });
      if (response.ok) {
        const { accessToken } = (await response.json()) as { accessToken: string };
        session.setToken(accessToken);
        return true;
      }
      if (response.status === 401) {
        sessionExpiry.expire();
      }
      return false;
    } catch {
      return false;
    }
  }

  private async sendOnceAsync(url: string, init: RequestInit, options?: RequestOptions): Promise<Response> {
    // Stops at the timeout or when the caller cancels (TanStack Query, when a query is no longer needed).
    const timeout = options?.timeout === false ? null : AbortSignal.timeout(API_CONFIG.timeoutMs);
    const signals = [options?.signal, timeout].filter((candidate) => candidate instanceof AbortSignal);
    const signal = signals.length > 0 ? AbortSignal.any(signals) : null;

    const token = options?.anonymous === true ? null : session.getToken();
    const locationId = options?.anonymous === true ? null : session.getLocationId();
    // The caller's headers (a JSON body's content type) plus who is asking and where. A FormData body gets its
    // multipart content type, with the boundary, from fetch itself.
    const headers = new Headers(init.headers);
    for (const [name, value] of Object.entries(options?.headers ?? {})) {
      headers.set(name, value);
    }
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
      if (timeout?.aborted) {
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
