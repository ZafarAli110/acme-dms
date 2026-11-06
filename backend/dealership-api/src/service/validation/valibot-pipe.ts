import {
  BadRequestException,
  StandardSchemaValidationPipe,
  type StandardSchemaValidationPipeOptions,
} from "@nestjs/common";
import { englishMessage, type MessageArgs } from "#i18n/messages";

/** One message of a failed validation: a catalog key (`validation.*`) and its placeholders, translated when answered. */
export interface ValidationMessage {
  key: string;
  args: MessageArgs;
}

/** What a failed validation is thrown with; the problem-details filter translates `i18nList` into the request's language. */
export interface LocalizedMessageList {
  message: string[];
  i18nList: ValidationMessage[];
}

/** What the pipe hands its `exceptionFactory`: Standard Schema issues. */
type StandardIssue = Parameters<NonNullable<StandardSchemaValidationPipeOptions["exceptionFactory"]>>[0][number];

/** The parts of a Valibot issue this reads. The Standard Schema type only promises `message` and `path`. */
export interface ValibotIssue {
  type?: string;
  requirement?: unknown;
  input?: unknown;
  received?: string;
  expected?: string | null;
  message: string;
  path?: readonly { key: unknown }[];
}

/** `"a" | "b"` as `a, b`. */
function listOfValues(expected: string | null | undefined): string {
  return [...(expected ?? "").matchAll(/"([^"]*)"/g)].map((match) => match[1]).join(", ");
}

/**
 * Valibot's issue as the catalog's message: the same texts the service always answered with, in the request's
 * language. A rule with no message of its own here throws, never a wrong message: `request-schemas.test.ts` walks every
 * request schema and fails, naming the rule, until it has a case here (and one in `service/swagger/valibot-openapi.ts`).
 */
export function toValidationMessage(issue: ValibotIssue): ValidationMessage {
  const { type, requirement, input, received, expected, path } = issue;
  const property = String(path?.at(-1)?.key ?? "request");
  const constraint1 = String(requirement);
  const isList = Array.isArray(input);
  // Whatever the rule, a value that was not sent at all is "required", not "must be text" or "must be a number".
  if (received === "undefined" && type !== "strict_object") {
    return { key: "validation.isNotEmpty", args: { property } };
  }
  switch (type) {
    case "non_empty":
      return { key: "validation.isNotEmpty", args: { property } };
    case "max_length":
      return { key: isList ? "validation.arrayMaxSize" : "validation.maxLength", args: { property, constraint1 } };
    case "min_length":
      return { key: isList ? "validation.arrayMinSize" : "validation.minLength", args: { property, constraint1 } };
    case "min_value":
      return { key: "validation.min", args: { property, constraint1 } };
    case "max_value":
      return { key: "validation.max", args: { property, constraint1 } };
    case "integer":
      return { key: "validation.isInt", args: { property } };
    case "email":
      return { key: "validation.isEmail", args: { property } };
    case "iso_date":
      return { key: "validation.isIso8601", args: { property } };
    case "uuid":
      return { key: "validation.isUuid", args: { property } };
    case "regex":
      return { key: "validation.codeFormat", args: { property } };
    case "picklist":
      return { key: "validation.isIn", args: { property, constraint1: listOfValues(expected) } };
    case "boolean":
      return { key: "validation.isBoolean", args: { property } };
    case "number":
    case "to_number":
    case "union":
    case "check":
      return { key: "validation.isNumber", args: { property } };
    case "array":
      return { key: "validation.isArray", args: { property } };
    case "object":
      return { key: "validation.nestedValidation", args: { property } };
    case "strict_object":
      // A key the schema does not have is `received` as itself; a key it needs and was not sent is `undefined`.
      return received === "undefined"
        ? { key: "validation.isNotEmpty", args: { property } }
        : { key: "validation.whitelistValidation", args: { property } };
    case "string":
      return { key: "validation.isString", args: { property } };
    default:
      throw new Error(
        `No validation message for the Valibot rule "${String(type)}" (service/validation/valibot-pipe.ts).`,
      );
  }
}

/** The 400 for a failed validation: one message per problem, each in the request's language when it is answered. */
export function validationException(issues: readonly ValibotIssue[]): BadRequestException {
  const messages = issues.map(toValidationMessage);
  const body: LocalizedMessageList = {
    message: messages.map((message) => englishMessage(message.key, message.args)),
    i18nList: messages,
  };
  return new BadRequestException(body);
}

/**
 * Validates a body, query or parameter against the Valibot schema given to its decorator, as
 * `@Body({ schema: CustomerRequestSchema })` (Nest's StandardSchemaValidationPipe). A failure is a 400 whose detail
 * comes from the `validation.*` catalogs, like every other message of this service.
 */
export class ValibotValidationPipe extends StandardSchemaValidationPipe {
  public constructor() {
    super({ exceptionFactory: (issues: readonly StandardIssue[]) => validationException(issues as ValibotIssue[]) });
  }
}
