import type { ListFilter, ListParams } from "../../../core/paging/listParams";

export type CustomerStatus = "active" | "prospect" | "inactive";

/** Every field is always sent; a value the customer does not have is `null`. */
export interface CustomerInput {
  firstName: string;
  surname: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  status: CustomerStatus;
  lastContactDate: string | null;
}

export interface CustomerListItem extends CustomerInput {
  id: string;
}

export interface Customer extends CustomerListItem {
  locationId: string;
  createdAt: string;
  updatedAt: string;
  /** Goes up with every save; sent back as If-Match, so a save from an older version is refused (412). */
  version: number;
}

/** The customer form's values. Every text field is a string while being typed; the mapper turns an empty one into null. */
export interface CustomerFormValues {
  firstName: string;
  surname: string;
  companyName: string;
  email: string;
  phone: string;
  city: string;
  status: CustomerStatus;
  /** `YYYY-MM-DD` from the date input, or empty. */
  lastContactDate: string;
}

/**
 * A page of the customer list: whether another follows, not how many there are. The total is the count's, asked once
 * per question (ACME-117).
 */
/** A customer on a page of the list, and how it matched the search: exactly, or a close spelling (ACME-120). */
export interface CustomerPageItem extends CustomerListItem {
  match: "exact" | "close";
}

export interface CustomerPage {
  items: CustomerPageItem[];
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/** What a total depends on: the search and the filter. The page and the sort don't change it. */
export interface CustomerQuestion {
  search: string;
  filter: ListFilter | null;
}

/** The question a list page asks. */
export function questionOf(params: ListParams): CustomerQuestion {
  return { search: params.search, filter: params.filter };
}

/** Every customer at the location: Home's count. */
export const EVERY_CUSTOMER: CustomerQuestion = { search: "", filter: null };
