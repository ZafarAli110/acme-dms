import { Inject, Injectable } from "@nestjs/common";
import { and, asc, count, eq, ilike, inArray, notInArray, sql, type SQL } from "drizzle-orm";
import type { IGetCustomerListQueryHandler } from "#business-logic-abstractions/handlers/customers/get-list/get-customer-list.query-handler.interface";
import type { UserContext } from "#business-logic-abstractions/user-context/user-context";
import type { CustomerPageResponseDto } from "#dto/customers/customer-page-response.dto";
import type { ListQueryDto } from "#dto/paging/list-query.dto";
import { customerNames } from "#persistence/schema/customer-names";
import { customerSearchText, customers } from "#persistence/schema/customers";
import { notDeleted } from "#persistence/schema/soft-delete/not-deleted";
import type { Database } from "#persistence/unit-of-work/unit-of-work";
import {
  type IUnitOfWorkFactory,
  UNIT_OF_WORK_FACTORY,
} from "#persistence/unit-of-work/unit-of-work.factory.interface";
import { SETTINGS, type Settings } from "#settings/settings";
import {
  CursorCodec,
  type KeyedRow,
  type KeysetMove,
  type SearchPath,
  keyedFields,
  keyedRowOf,
  keysetMoveOf,
  readKeysetPageAsync,
  type SortSpec,
  sortSpecOf,
} from "../../../list-query/keyset";
import {
  listFilter,
  listOrderBy,
  matchesText,
  phoneDigitsTyped,
  phoneMatching,
  type ListColumns,
} from "../../../list-query/list-columns";
import { escapeLike } from "../../../list-query/like-pattern";
import { MAX_LIST_DEPTH, pageOffset } from "../../../list-query/page-offset";
import { requireLocation } from "../../../user-context/require-location";
import { toCustomerListItemDto } from "../customer.mapper";
import { type CloseName, closeNamesAsync, isKnownNameAsync } from "./close-names";

/** A search shorter than this stays exact: too few letters to compare spellings (ACME-120). */
const MIN_CLOSE_LETTERS = 3;
/**
 * Only a word of letters (a name may have ' and -) is compared with names: anything with @, a dot, a digit or a space
 * is part of an email or a phone, or several words, and stays exact as today (Zafar Ali, 8 Nov).
 */
const NAME_WORD = /^[\p{L}'-]+$/u;
/** At most this many customers a close name, so one common name cannot fill the page (the verifier's "hpoper"). */
const MAX_PER_CLOSE_NAME = 10;

/** What the customer list can be sorted and filtered by: the grid's field names. */
export const CUSTOMER_LIST_COLUMNS: ListColumns = {
  // "Surname, First name": sorts by surname, and a filter on the name matches either.
  name: {
    source: sql`${customers.surname} || ', ' || ${customers.firstName}`,
    type: "text",
    sortBy: [customers.surname, customers.firstName],
  },
  companyName: { source: customers.companyName, type: "text" },
  email: { source: customers.email, type: "text" },
  phone: { source: customers.phone, type: "phone" },
  city: { source: customers.city, type: "text" },
  status: { source: customers.status, type: "choice" },
  lastContactDate: { source: customers.lastContactDate, type: "date" },
};

/**
 * Customers of the user's selected location, by name unless the query sorts otherwise; `search` matches name,
 * company, email or phone, and the query's filter narrows it further.
 *
 * A page is found one of two ways (ACME-129): after or before a cursor, or the last page, by keyset (the rows after
 * the cursor's row, from the sort's index: as quick at the end of the list as at its start); or by its number, by
 * offset (a jump, up to row 10,000: `pageOffset`). Either way it answers `next` and `previous` cursors.
 */
@Injectable()
export class GetCustomerListQueryHandler implements IGetCustomerListQueryHandler {
  private readonly _unitOfWorkFactory: IUnitOfWorkFactory;
  private readonly _cursorKey: string;

  public constructor(
    @Inject(UNIT_OF_WORK_FACTORY) unitOfWorkFactory: IUnitOfWorkFactory,
    @Inject(SETTINGS) settings: Pick<Settings, "exportLinkKey">,
  ) {
    this._unitOfWorkFactory = unitOfWorkFactory;
    this._cursorKey = settings.exportLinkKey;
  }

  public async executeAsync(userContext: UserContext, query: ListQueryDto): Promise<CustomerPageResponseDto> {
    const pageSize = query.pageSize ?? 25;
    const locationId = requireLocation(userContext);
    const where = customerListWhere(query);
    const asked: AskedPage = {
      spec: customerSortSpec(query),
      order: customerListOrderBy(query),
      move: keysetMoveOf(query),
      page: query.page ?? 1,
      pageSize,
      codec: new CursorCodec(this._cursorKey, { dealerId: userContext.dealerId, locationId }, query),
      search: query.search
        ? { text: query.search, dealerId: userContext.dealerId, locationId, filtered: Boolean(query.filterField) }
        : null,
    };

    // The page's ids first, from an index alone, then only those rows (ACME-110).
    // A search or a text filter matches with ILIKE, which no index can serve under row-level security (ACME-110, 119).
    const found =
      query.search || matchesText(CUSTOMER_LIST_COLUMNS, query)
        ? await this.findScopedAsync(userContext.dealerId, locationId, where, asked, Boolean(query.search))
        : await this.findListedAsync(where, asked);
    const ids = found.rows.map((row) => row.id);

    // Fewer than a page match exactly: close spellings fill the rest of page 1 (ACME-120).
    const closeIds =
      !asked.move && asked.page === 1 && ids.length < pageSize
        ? await this.findCloseAsync(userContext.dealerId, locationId, query, ids, pageSize - ids.length)
        : [];

    // The rows are always read as the request: row-level security decides what comes back, whatever found the ids.
    // Put back in the ids' order: the exact ones in the list's order, then the close ones closest first.
    await using work = await this._unitOfWorkFactory.beginAsync({ readOnly: true });
    const all = [...ids, ...closeIds];
    const rows = all.length === 0 ? [] : await work.db.select().from(customers).where(inArray(customers.id, all));
    const position = new Map(all.map((id, index) => [id, index]));
    const close = new Set(closeIds);
    const items = rows
      .toSorted((a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0))
      .map((row) => ({
        ...toCustomerListItemDto(row),
        match: close.has(row.id) ? ("close" as const) : ("exact" as const),
      }));
    return {
      items,
      page: asked.move ? null : asked.page,
      pageSize,
      hasMore: found.next !== null,
      next: found.next ? asked.codec.encode(found.next, found.path) : null,
      previous: found.previous ? asked.codec.encode(found.previous, found.path) : null,
    };
  }

  /**
   * Close spellings' customers, to fill page 1 after `exactIds` (ACME-120): only for one word of three letters or more
   * that is not a name the location has (a known name is a correct spelling: today's list). The close names come from
   * the location's name list, under the policy; each one's customers by the search's own trigram match, as the owner
   * with the scope written out (as the search finds its ids), closest name first, in the list's name order within it.
   * Phones and emails are never close-matched: the name list holds only names.
   */
  private async findCloseAsync(
    dealerId: string,
    locationId: string,
    query: ListQueryDto,
    exactIds: string[],
    room: number,
  ): Promise<string[]> {
    const word = (query.search ?? "").trim().toLowerCase();
    if (word.length < MIN_CLOSE_LETTERS || !NAME_WORD.test(word)) {
      return [];
    }
    let names: CloseName[];
    {
      await using namesWork = await this._unitOfWorkFactory.beginAsync({ readOnly: true });
      if (await isKnownNameAsync(namesWork.db, word)) {
        return [];
      }
      names = await closeNamesAsync(namesWork.db, word);
    }
    if (names.length === 0) {
      return [];
    }
    await using work = await this._unitOfWorkFactory.beginAsync({ readOnly: true, asOwner: true });
    const found: string[] = [];
    for (const { name, kinds } of names) {
      if (found.length >= room) {
        break;
      }
      const ids = await closeNameCustomersAsync(work.db, {
        where: ownerScoped(dealerId, locationId, listFilter(CUSTOMER_LIST_COLUMNS, query)),
        name,
        kinds,
        taken: [...exactIds, ...found],
        limit: Math.min(room - found.length, MAX_PER_CLOSE_NAME),
      });
      found.push(...ids);
    }
    return found;
  }

  private async findListedAsync(where: SQL | undefined, asked: AskedPage): Promise<FoundPage> {
    await using work = await this._unitOfWorkFactory.beginAsync({ readOnly: true });
    // Awaited here: returned unawaited, the unit of work would close (and drop the request's scope) before it ran.
    return await findPageAsync(work.db, where, asked);
  }

  /**
   * A search's or a text filter's ids, as the table's owner with the dealer, the location and live rows
   * written out (as the export does). Under row-level security Postgres must apply the policy before a filter that is
   * not leakproof, and ILIKE is not, so no index could serve it; as the owner with these conditions one does. Only ids
   * come from here: the rows are read as the request.
   */
  private async findScopedAsync(
    dealerId: string,
    locationId: string,
    where: SQL | undefined,
    asked: AskedPage,
    searching: boolean,
  ): Promise<FoundPage> {
    await using work = await this._unitOfWorkFactory.beginAsync({ readOnly: true, asOwner: true });
    return await findPageAsync(work.db, ownerScoped(dealerId, locationId, where), asked, searching);
  }
}

/** The page a query asks for, and what finding it needs. */
interface AskedPage {
  spec: SortSpec;
  /** The same order as `spec`, for a page by its number. */
  order: SQL[];
  move: KeysetMove | null;
  page: number;
  pageSize: number;
  codec: CursorCodec;
  /** The search, for choosing its path; null without one. */
  search: SearchScope | null;
}

/** A page's rows (ids and sort keys), the rows its next and previous cursors start from, and a search's path. */
interface FoundPage {
  rows: KeyedRow[];
  next: KeyedRow | null;
  previous: KeyedRow | null;
  path: SearchPath | null;
}

/**
 * A page's ids and sort keys, one more than the page to know whether another follows. No count: the total is the count
 * endpoint's (ACME-117). A search's first page counts its matches up to 10,001, because that decides how to find its
 * pages; the cursors carry the decision, so its later pages do not count again (ACME-129).
 */
async function findPageAsync(
  db: Database,
  where: SQL | undefined,
  asked: AskedPage,
  searching = false,
): Promise<FoundPage> {
  const { spec, move, page, pageSize } = asked;
  const from = move && !("last" in move) ? asked.codec.decode("after" in move ? move.after : move.before) : null;
  const path = searching ? (from?.path ?? (await searchPathAsync(db, where, asked.search))) : null;
  if (path === "few") {
    // For a term few or none have, Postgres would walk the name index in order looking for a page, and at a big
    // location read every customer ("ahed" at Northside: 3 to 6 s; "smith", all in the S's: 2.4 s). The matches are
    // found through the trigram index only, then sorted (3 ms). Past 10,000 they are dense, and the walk finds a page
    // at once ("gmail": 0.1 ms, against 36 ms sorted). Its estimate cannot choose: "ahed" expects 12,845 and has none,
    // "gmail" expects 2,569 and has 222,815. `set local` ends with this read-only transaction (ACME-119).
    await db.execute(sql`set local enable_indexscan = off`);
    await db.execute(sql`set local enable_indexonlyscan = off`);
  }
  if (move) {
    const keyset = await readKeysetPageAsync(spec, move, from, pageSize, async (segment, limit) => {
      const rows = await db
        .select(keyedFields(spec))
        .from(customers)
        .where(and(where, segment.where))
        .orderBy(...segment.orderBy)
        .limit(limit);
      return rows.map((row) => keyedRowOf(spec, row));
    });
    return { ...keyset, path };
  }
  const rows = (
    await db
      .select(keyedFields(spec))
      .from(customers)
      .where(where)
      .orderBy(...asked.order)
      .limit(pageSize + 1)
      .offset(pageOffset(page, pageSize))
  ).map((row) => keyedRowOf(spec, row));
  const onPage = rows.slice(0, pageSize);
  return {
    rows: onPage,
    // Past row 10,000 a page has no number, but Next still goes on, by keyset (ACME-129).
    next: rows.length > pageSize ? (onPage.at(-1) ?? null) : null,
    previous: page > 1 ? (onPage[0] ?? null) : null,
    path,
  };
}

/**
 * A search's way to its pages (ACME-129): through the trigram index, then sorted, while its matches are few; walking the
 * name order while they are many and spread through it. For one word of a name, the location's name list says how many
 * customers have a name holding it, in about a millisecond (counting the customers up to 10,001 took 30 ms); when one
 * surname holds most of them, they sit together in name order and a walk would read every name before them ("smith":
 * 2.4 s), so they are sorted instead. Anything else (part of an email, two words, a filter as well) is counted.
 */
async function searchPathAsync(db: Database, where: SQL | undefined, search: SearchScope | null): Promise<SearchPath> {
  const word = search?.text.trim().toLowerCase() ?? "";
  if (search && !search.filtered && word.length >= MIN_CLOSE_LETTERS && NAME_WORD.test(word)) {
    const [names] = await db
      .select({
        total: sql<number>`coalesce(sum(${customerNames.customers}), 0)::int`,
        biggestSurname: sql<number>`coalesce(max(${customerNames.customers}) filter (where ${customerNames.kind} = 'surname'), 0)::int`,
      })
      .from(customerNames)
      .where(
        and(
          eq(customerNames.dealerId, search.dealerId),
          eq(customerNames.locationId, search.locationId),
          sql`lower(${customerNames.name}) like ${`%${escapeLike(word)}%`}`,
        ),
      );
    const total = names?.total ?? 0;
    return total > MAX_LIST_DEPTH && (names?.biggestSurname ?? 0) * 2 < total ? "dense" : "few";
  }
  return (await countUpToAsync(db, where, MAX_LIST_DEPTH + 1)) <= MAX_LIST_DEPTH ? "few" : "dense";
}

/** What a search's path is decided from: the words typed, where, and whether a filter narrows it too. */
interface SearchScope {
  text: string;
  dealerId: string;
  locationId: string;
  filtered: boolean;
}

/**
 * A close name's customers (ACME-120, 129): everyone whose surname or first name is that name, case ignored, each from
 * its own index in name order, and those whose company has it as a word; the first `limit` of them in the list's order,
 * leaving out `taken`. Whole names only: "Penwood" no longer finds "Penwoodson" (Zafar Ali, 9 Nov). A substring search
 * per close name read every customer holding a common name and sorted them (47 to 88 ms a name).
 */
async function closeNameCustomersAsync(
  db: Database,
  close: { where: SQL | undefined; name: string; kinds: readonly string[]; taken: string[]; limit: number },
): Promise<string[]> {
  const lowered = close.name.toLowerCase();
  const notTaken = close.taken.length > 0 ? notInArray(customers.id, close.taken) : undefined;
  const byName = asc(customers.surname);
  const runs: SQL[] = [];
  if (close.kinds.includes("surname")) {
    runs.push(sql`lower(${customers.surname}) = ${lowered}`);
  }
  if (close.kinds.includes("first")) {
    runs.push(sql`lower(${customers.firstName}) = ${lowered}`);
  }
  if (close.kinds.includes("company_word")) {
    runs.push(ilike(customers.companyName, `%${escapeLike(close.name)}%`));
  }
  const candidates = new Set<string>();
  for (const condition of runs) {
    const rows = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(close.where, condition, notTaken))
      .orderBy(byName, asc(customers.firstName), asc(customers.id))
      .limit(close.limit);
    for (const row of rows) {
      candidates.add(row.id);
    }
  }
  if (runs.length < 2) {
    return [...candidates];
  }
  // From more than one kind: the first `limit` of them all, in the list's order.
  const merged = await db
    .select({ id: customers.id })
    .from(customers)
    .where(inArray(customers.id, [...candidates]))
    .orderBy(byName, asc(customers.firstName), asc(customers.id))
    .limit(close.limit);
  return merged.map((row) => row.id);
}

/** How many customers match, up to `limit`: the count endpoint's exact total, for a handful of matches (ACME-129). */
export async function countUpToAsync(db: Database, where: SQL | undefined, limit: number): Promise<number> {
  const upToDepth = db
    .select({ one: sql`1` })
    .from(customers)
    .where(where)
    .limit(limit)
    .as("up_to_limit");
  const [counted] = await db.select({ total: count() }).from(upToDepth);
  return counted?.total ?? 0;
}

/**
 * The query's conditions with the dealer, the location and live rows written out, for a read as the table's owner
 * (a search or a text filter: ACME-110, 119; docs/standards/multi-tenancy.md).
 */
export function ownerScoped(dealerId: string, locationId: string, where: SQL | undefined): SQL | undefined {
  return and(eq(customers.dealerId, dealerId), eq(customers.locationId, locationId), notDeleted(customers), where);
}

/**
 * The customers a list query shows, searched and filtered. Whose they are, and that they are not deleted, is the
 * database's to say: a request sees its own location's live customers (row-level security), and the export, which
 * works outside a request, adds the dealer, the location and `notDeleted` itself. Shared with the export, so the file holds exactly the rows the list shows.
 */
export function customerListWhere(query: ListQueryDto): SQL | undefined {
  return and(query.search ? searchMatching(query.search) : undefined, listFilter(CUSTOMER_LIST_COLUMNS, query));
}

/**
 * What the search box matches: a phone by the start or the end of its digits when only a phone's characters were typed
 * ("0113 496", "4417"), else anywhere in the name, company or email (ACME-129).
 */
function searchMatching(text: string): SQL {
  const digits = phoneDigitsTyped(text);
  return digits ? phoneMatching(customers.phone, digits, "startOrEnd") : matching(`%${text}%`);
}

/** The list's order as keyset paging reads it: the same as `customerListOrderBy`. */
export function customerSortSpec(query: ListQueryDto): SortSpec {
  return sortSpecOf(CUSTOMER_LIST_COLUMNS, query, [customers.surname, customers.firstName], customers.id);
}

/** The list's order: the query's sort, else by name; always ending with the id, so equal values keep one order. */
export function customerListOrderBy(query: ListQueryDto): SQL[] {
  return listOrderBy(CUSTOMER_LIST_COLUMNS, query, [asc(customers.surname), asc(customers.firstName)], [customers.id]);
}

/** A match anywhere in the name, company or email: one text, so one trigram index serves it (ACME-110). */
function matching(pattern: string): SQL {
  return ilike(customerSearchText(customers), pattern);
}
