/**
 * A Valibot schema as the OpenAPI schema Swagger shows: what a client may send, in OpenAPI's words.
 *
 * Ours, because the request schemas use a small set of Valibot's schemas and rules (below), and Valibot 1.5 does not
 * publish JSON Schema itself. A schema or rule this does not know is an error, never a silent gap in the document:
 * `request-schemas.test.ts` converts every request schema, so a new kind of rule fails there, with its name, until a
 * case is added here (and one in `toValidationMessage`, valibot-pipe.ts, which answers the same rules).
 *
 * - A field that may be left out (`v.optional`, `v.nullish`) is that field, left out of `required`: the document says
 *   it is optional, not that it may be `null`. A value that may be cleared (`v.nullable`) is `anyOf` it and `null`.
 * - A number read from a query string or a JSON body (a string or a number turned into one) is a number.
 * - A rule that is a function (`v.check`) has no JSON form: give the schema a `v.description`, and where JSON Schema
 *   has the keyword a `v.metadata` (a price: `multipleOf`).
 */
export type OpenApiSchema = Record<string, unknown>;

/** The parts of a Valibot schema or rule this reads. Valibot documents `type`, `entries`, `wrapped`, `options`, `pipe`… */
interface ValibotNode {
  type: string;
  kind?: string;
  entries?: Record<string, ValibotNode>;
  wrapped?: ValibotNode;
  item?: ValibotNode;
  options?: ValibotNode[] | readonly string[];
  pipe?: ValibotNode[];
  requirement?: unknown;
  description?: string;
  metadata?: Record<string, unknown>;
}

/** The schemas whose property may be left out of an object. */
const MAY_BE_LEFT_OUT = new Set(["optional", "nullish", "exact_optional", "undefinedable"]);

/** What Nest's `standardSchemaConverter` asks for. */
export function valibotToOpenApi(schema: unknown): { schema: OpenApiSchema } {
  return { schema: convertSchema(schema as ValibotNode) };
}

function convertSchema(node: ValibotNode): OpenApiSchema {
  // `v.pipe(root, …rules)` is the root's schema with the rules in `pipe`; the root is its first item.
  if (node.pipe) {
    const [root, ...rules] = node.pipe;
    return rules.reduce(applyRule, convertSchema(root as ValibotNode));
  }
  switch (node.type) {
    case "object":
    case "strict_object":
      return convertObject(node);
    case "string":
      return { type: "string" };
    case "number":
      return { type: "number" };
    case "boolean":
      return { type: "boolean" };
    case "array":
      return { type: "array", items: convertSchema(node.item as ValibotNode) };
    case "picklist":
      return { enum: node.options, type: "string" };
    case "nullable":
      return { anyOf: [convertSchema(node.wrapped as ValibotNode), { type: "null" }] };
    case "optional":
    case "nullish":
      return convertSchema(node.wrapped as ValibotNode);
    case "union":
      return convertUnion(node);
    default:
      throw new Error(
        `OpenAPI: no conversion for the Valibot schema "${node.type}" (service/swagger/valibot-openapi.ts).`,
      );
  }
}

function convertObject(node: ValibotNode): OpenApiSchema {
  const entries = Object.entries(node.entries ?? {});
  const required = entries.filter(([, entry]) => !MAY_BE_LEFT_OUT.has(entry.type)).map(([key]) => key);
  return {
    type: "object",
    properties: Object.fromEntries(entries.map(([key, entry]) => [key, convertSchema(entry)])),
    ...(required.length > 0 ? { required } : {}),
    ...(node.type === "strict_object" ? { additionalProperties: false } : {}),
  };
}

/** A string or a number that is turned into a number is a number; any other union is "one of". */
function convertUnion(node: ValibotNode): OpenApiSchema {
  const options = (node.options ?? []) as ValibotNode[];
  return options.every((option) => option.type === "string" || option.type === "number")
    ? { type: "number" }
    : { anyOf: options.map(convertSchema) };
}

/** What one rule adds to the schema it follows. */
function applyRule(schema: OpenApiSchema, rule: ValibotNode): OpenApiSchema {
  const isList = schema["type"] === "array";
  switch (rule.type) {
    case "max_length":
      return { ...schema, [isList ? "maxItems" : "maxLength"]: rule.requirement };
    case "min_length":
      return { ...schema, [isList ? "minItems" : "minLength"]: rule.requirement };
    case "non_empty":
      return { ...schema, [isList ? "minItems" : "minLength"]: 1 };
    case "min_value":
      return { ...schema, minimum: rule.requirement };
    case "max_value":
      return { ...schema, maximum: rule.requirement };
    case "integer":
      return { ...schema, type: "integer" };
    case "email":
      return { ...schema, format: "email" };
    case "iso_date":
      return { ...schema, format: "date" };
    case "uuid":
      return { ...schema, format: "uuid" };
    case "regex":
      return { ...schema, pattern: (rule.requirement as RegExp).source };
    case "description":
      return { ...schema, description: rule.description };
    case "metadata":
      return { ...schema, ...rule.metadata };
    // Rules that change what the value becomes, or that are functions: nothing a client needs to be told.
    case "to_number":
    case "transform":
    case "check":
      return schema;
    default:
      throw new Error(
        `OpenAPI: no conversion for the Valibot rule "${rule.type}" (service/swagger/valibot-openapi.ts).`,
      );
  }
}
