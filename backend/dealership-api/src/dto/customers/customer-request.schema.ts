import * as v from "valibot";
import type { CustomerStatus } from "./customer-response.dto";

export const CUSTOMER_STATUSES: CustomerStatus[] = ["active", "prospect", "inactive"];

/** Text a customer may not have: `null`, never left out. */
const optionalText = (max: number) => v.nullable(v.pipe(v.string(), v.maxLength(max)));
const requiredText = (max: number) => v.pipe(v.string(), v.nonEmpty(), v.maxLength(max));

/**
 * A customer as it is saved (create and update send the same fields). Every field is always sent; a value the customer
 * does not have is `null`, never left out, and a field this request does not have is refused (`strictObject`). The type
 * is the schema's: there is no second declaration to keep in step.
 */
export const CustomerRequestSchema = v.strictObject({
  firstName: v.pipe(requiredText(100), v.metadata({ example: "Grace" })),
  surname: v.pipe(requiredText(100), v.metadata({ example: "Hopper" })),
  companyName: optionalText(200),
  email: v.nullable(v.pipe(v.string(), v.email(), v.maxLength(254))),
  phone: optionalText(40),
  city: optionalText(100),
  status: v.picklist(CUSTOMER_STATUSES),
  lastContactDate: v.nullable(v.pipe(v.string(), v.isoDate())),
});

export type CustomerRequest = v.InferOutput<typeof CustomerRequestSchema>;
