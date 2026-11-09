import { createHash } from "node:crypto";
import {
  applyDecorators,
  type CallHandler,
  type ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  type NestInterceptor,
  SetMetadata,
  UseInterceptors,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ApiHeader } from "@nestjs/swagger";
import { catchError, concatMap, finalize, from, map, type Observable, of, switchMap, throwError } from "rxjs";
import {
  IDEMPOTENCY_RECORDS,
  type IdempotencyClaim,
  type IIdempotencyRecords,
} from "#business-logic-abstractions/idempotency/idempotency-records.interface";
import { localized } from "#i18n/messages";
import { currentDataScope, currentRequest, runDetachedFromCaller } from "#request-scope/data-scope";
import { CREATED_LOCATION, type LocationOf } from "../interceptors/created.interceptor";
import { PROBLEM_TYPE } from "../problem-details/problem-type";
import { TypedProblemException } from "../problem-details/typed-problem.exception";

/** An Idempotency-Key is 1 to 255 printable ASCII characters (no spaces): what HTTP header values allow. */
const IDEMPOTENCY_KEY = /^[\x21-\x7e]{1,255}$/;
/** A save still running with the key: about how long the rest of a save takes. */
const IN_PROGRESS_RETRY_AFTER_SECONDS = 2;
/** What persistence throws when a second save took the key over (`IdempotencyClaimLostError`), by name. */
const CLAIM_LOST_ERROR_NAME = "IdempotencyClaimLostError";

const IDEMPOTENT_RESOURCE = Symbol("idempotent-resource");

/**
 * Where the record a save changes is read, kept with its key for "your first save went through": `created`, the
 * `Location` its `@Created` names (from the answer); `path`, the request's own path (a change to one record); `none`,
 * no single record to read (a bin, a stock level, a photo).
 */
export type IdempotentResource = "created" | "path" | "none";

type FileLike = { buffer: Buffer };
type IdempotentRequest = {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  file?: FileLike;
  files?: FileLike[];
};
type HeaderSetter = { setHeader(name: string, value: string): void };

/**
 * A save that is done once per `Idempotency-Key` (ACME-125): the same save sent again (a lost answer, a double click)
 * gets the first one's answer, never a second record. A save sent without the key works as before. Put it **first**,
 * above the method's other decorators: Nest runs the last-listed interceptor innermost, and this one must be innermost,
 * so the files are already read for its fingerprint and a replayed answer still passes through `@Created` and
 * `@ETagged`.
 *
 *   @Idempotent("created") @Post() @Created((customer: CustomerResponseDto) => `/v1/customers/${customer.id}`)
 */
export function Idempotent(resource: IdempotentResource) {
  return applyDecorators(
    SetMetadata(IDEMPOTENT_RESOURCE, resource),
    ApiHeader({
      name: "Idempotency-Key",
      required: false,
      description:
        "One key per save the user means to make, the same on every retry: the save is done once (24 hours). " +
        "The same request again gets the first answer (Idempotent-Replayed: true); 409 save-in-progress while it " +
        "runs, 409 save-went-through when the key was used with another request.",
    }),
    UseInterceptors(IdempotencyInterceptor),
  );
}

/**
 * Claims the key before the save runs, apart from the request (`runDetachedFromCaller`): the claim's own commit must
 * not mark the request committed, or the save after it would never be told "busy". The claim spends the save's one
 * connection wait (`sharedWait`), so a busy system still answers 503 within it, with nothing claimed. The save's own
 * transaction marks the key committed (`UnitOfWorkFactory`); its answer is kept after, and a failure before the commit
 * frees the key, both as background work that is never "busy" and outlives a caller who left.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly _logger = new Logger(IdempotencyInterceptor.name);
  private readonly _reflector: Reflector;
  private readonly _records: IIdempotencyRecords;

  public constructor(reflector: Reflector, @Inject(IDEMPOTENCY_RECORDS) records: IIdempotencyRecords) {
    this._reflector = reflector;
    this._records = records;
  }

  public intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<IdempotentRequest>();
    const header = request.headers["idempotency-key"];
    const scope = currentDataScope();
    const info = currentRequest();
    // No key, or no signed-in user to keep it for: the save runs as it always has (D5).
    if (!("idempotency-key" in request.headers) || !scope || !info) {
      return next.handle();
    }
    if (typeof header !== "string" || !IDEMPOTENCY_KEY.test(header)) {
      throw new TypedProblemException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        PROBLEM_TYPE.idempotencyKey,
        localized("saves.keyFormat"),
      );
    }
    const resource = this._reflector.get<IdempotentResource>(IDEMPOTENT_RESOURCE, context.getHandler());
    const locationOf = this._reflector.get<LocationOf | undefined>(CREATED_LOCATION, context.getHandler()) ?? null;
    const claiming = runDetachedFromCaller(
      () =>
        this._records.claimAsync({
          dealerId: scope.dealerId,
          userId: scope.userId,
          key: header,
          fingerprint: fingerprintOf(request),
          resource: resource === "path" ? pathOf(request.url) : null,
        }),
      { sharedWait: true },
    );
    return from(claiming).pipe(
      switchMap((claimed) => {
        switch (claimed.kind) {
          case "mine":
          case "taken-over":
            info.idempotency = claimed.claim;
            return this.runSave(next, claimed.claim, resource === "created" ? locationOf : null);
          case "replay":
            http.getResponse<HeaderSetter>().setHeader("idempotent-replayed", "true");
            return of(claimed.answer);
          case "running":
            return throwError(() => saveInProgress());
          case "went-through":
            return throwError(
              () =>
                new TypedProblemException(
                  HttpStatus.CONFLICT,
                  PROBLEM_TYPE.saveWentThrough,
                  localized("saves.wentThrough"),
                  { extensions: { resource: claimed.resource } },
                ),
            );
        }
      }),
    );
  }

  /**
   * Runs the save holding the key. Its answer is kept before it is sent, so a save sent again the moment the answer
   * arrives finds it. When the save fails, or never finishes (a time limit gave up on it), the key is freed: a save
   * that had committed keeps it (`releaseAsync` frees only a running one), and one still running then cannot commit,
   * as its commit marker no longer finds the key.
   */
  private runSave(next: CallHandler, claim: IdempotencyClaim, locationOf: LocationOf | null): Observable<unknown> {
    let settled = false;
    return next.handle().pipe(
      concatMap((answer: unknown) => {
        settled = true;
        return from(this.completeAsync(claim, answer, locationOf ? locationOf(answer) : null)).pipe(map(() => answer));
      }),
      catchError((error: unknown) => {
        settled = true;
        const answer = error instanceof Error && error.name === CLAIM_LOST_ERROR_NAME ? saveInProgress(error) : error;
        return from(this.releaseAsync(claim)).pipe(switchMap(() => throwError(() => answer)));
      }),
      finalize(() => {
        if (!settled) {
          void this.releaseAsync(claim);
        }
      }),
    );
  }

  /** Never rejects: the save is done whatever happens here, and its answer goes out. */
  private async completeAsync(claim: IdempotencyClaim, answer: unknown, resource: string | null): Promise<void> {
    try {
      await runDetachedFromCaller(() => this._records.completeAsync(claim, answer, resource), { asBackground: true });
    } catch (error) {
      // The key stays committed: a save sent again is told it went through, and is never run twice.
      this._logger.warn(`Could not keep a save's answer: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** Never rejects: the save's own error is what the caller is told. */
  private async releaseAsync(claim: IdempotencyClaim): Promise<void> {
    try {
      await runDetachedFromCaller(() => this._records.releaseAsync(claim), { asBackground: true });
    } catch (error) {
      // The key stays running until its lease runs out; a save sent again before then is told to wait.
      this._logger.warn(`Could not free a save's key: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function saveInProgress(cause?: unknown): TypedProblemException {
  return new TypedProblemException(HttpStatus.CONFLICT, PROBLEM_TYPE.saveInProgress, localized("saves.inProgress"), {
    retryAfterSeconds: IN_PROGRESS_RETRY_AFTER_SECONDS,
    cause,
  });
}

/** The URL's path, without its query. */
function pathOf(url: string): string {
  const query = url.indexOf("?");
  return query === -1 ? url : url.slice(0, query);
}

/**
 * The same request always gives the same fingerprint: the method, the URL, the version it started from (If-Match),
 * the body as parsed (a form's JSON, or a multipart's text fields) and each file's own SHA-256.
 */
function fingerprintOf(request: IdempotentRequest): string {
  const files = [...(request.file ? [request.file] : []), ...(request.files ?? [])].map((file) =>
    createHash("sha256").update(file.buffer).digest("hex"),
  );
  const ifMatch = request.headers["if-match"] ?? null;
  return createHash("sha256")
    .update(JSON.stringify([request.method, request.url, ifMatch, request.body ?? null, files]))
    .digest("hex");
}
