import { Inject, Injectable } from "@nestjs/common";
import { and, asc, count, eq, ilike, inArray, sql, type SQL } from "drizzle-orm";
import type { IGetCustomerListQueryHandler } from "#business-logic-abstractions/handlers/customers/get-list/get-customer-list.query-handler.interface";
import type { UserContext } from "#business-logic-abstractions/user-context/user-context";
import type { CustomerListItemDto } from "#dto/customers/customer-list-item.dto";
import type { ListQueryDto } from "#dto/paging/list-query.dto";
import type { PageResponseDto } from "#dto/paging/page-response.dto";
import { customerSearchText, customers } from "#persistence/schema/customers";
import { notDeleted } from "#persistence/schema/soft-delete/not-deleted";
import type { Database } from "#persistence/unit-of-work/unit-of-work";
import {
  type IUnitOfWorkFactory,
  UNIT_OF_WORK_FACTORY,
} from "#persistence/unit-of-work/unit-of-work.factory.interface";
import { listFilter, listOrderBy, matchesText, type ListColumns } from "../../../list-query/list-columns";
import { MAX_LIST_DEPTH, pageOffset } from "../../../list-query/page-offset";
import { requireLocation } from "../../../user-context/require-location";
import { toCustomerListItemDto } from "../customer.mapper";

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
  phone: { source: customers.phone, type: "text" },
  city: { source: customers.city, type: "text" },
  status: { source: customers.status, type: "choice" },
  lastContactDate: { source: customers.lastContactDate, type: "date" },
};

/**
 * Customers of the user's selected location, by name unless the query sorts otherwise; `search` matches name,
 * company, email or phone, and the query's filter narrows it further. `total` is exact up to `MAX_LIST_DEPTH` (10,000)
 * and `MAX_LIST_DEPTH + 1` past it, which the web app shows as "10,000+": the list cannot page further anyway, and the
 * exact number at a big location cost a read of the whole location on every page (ACME-119).
 */
@Injectable()
export class GetCustomerListQueryHandler implements IGetCustomerListQueryHandler {
  private readonly _unitOfWorkFactory: IUnitOfWorkFactory;

  public constructor(@Inject(UNIT_OF_WORK_FACTORY) unitOfWorkFactory: IUnitOfWorkFactory) {
    this._unitOfWorkFactory = unitOfWorkFactory;
  }

  public async executeAsync(
    userContext: UserContext,
    query: ListQueryDto,
  ): Promise<PageResponseDto<CustomerListItemDto>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const locationId = requireLocation(userContext);
    const where = customerListWhere(query);
    const order = customerListOrderBy(query);

    // The page's ids first, from an index alone, then only those rows: a later page skips its offset in the index
    // instead of reading every customer before it from the table (ACME-110).
    // A search or a text filter matches with ILIKE, which no index can serve under row-level security (ACME-110, 119).
    const { ids, total } =
      query.search || matchesText(CUSTOMER_LIST_COLUMNS, query)
        ? await this.findScopedAsync(
            userContext.dealerId,
            locationId,
            where,
            order,
            page,
            pageSize,
            Boolean(query.search),
          )
        : await this.findListedAsync(where, order, page, pageSize);

    // The rows are always read as the request: row-level security decides what comes back, whatever found the ids.
    await using work = await this._unitOfWorkFactory.beginAsync({ readOnly: true });
    const items =
      ids.length === 0
        ? []
        : await work.db
            .select()
            .from(customers)
            .where(inArray(customers.id, ids))
            .orderBy(...order);
    return { items: items.map(toCustomerListItemDto), total, page, pageSize };
  }

  private async findListedAsync(
    where: SQL | undefined,
    order: SQL[],
    page: number,
    pageSize: number,
  ): Promise<{ ids: string[]; total: number }> {
    await using work = await this._unitOfWorkFactory.beginAsync({ readOnly: true });
    // Awaited here: returned unawaited, the unit of work would close (and drop the request's scope) before it ran.
    return await findPageAsync(work.db, where, order, page, pageSize);
  }

  /**
   * A search's or a text filter's ids and count, as the table's owner with the dealer, the location and live rows
   * written out (as the export does). Under row-level security Postgres must apply the policy before a filter that is
   * not leakproof, and ILIKE is not, so no index could serve it; as the owner with these conditions one does. Only ids
   * and a count come from here: the rows are read as the request.
   */
  private async findScopedAsync(
    dealerId: string,
    locationId: string,
    where: SQL | undefined,
    order: SQL[],
    page: number,
    pageSize: number,
    searching: boolean,
  ): Promise<{ ids: string[]; total: number }> {
    await using work = await this._unitOfWorkFactory.beginAsync({ readOnly: true, asOwner: true });
    const scoped = and(
      eq(customers.dealerId, dealerId),
      eq(customers.locationId, locationId),
      notDeleted(customers),
      where,
    );
    return await findPageAsync(work.db, scoped, order, page, pageSize, searching);
  }
}

async function findPageAsync(
  db: Database,
  where: SQL | undefined,
  order: SQL[],
  page: number,
  pageSize: number,
  searching = false,
): Promise<{ ids: string[]; total: number }> {
  // Counted up to one past the list's depth: past it the screen says "10,000+", and the exact number would cost a read
  // of the whole location on every page (ACME-119).
  const upToDepth = db
    .select({ one: sql`1` })
    .from(customers)
    .where(where)
    .limit(MAX_LIST_DEPTH + 1)
    .as("up_to_depth");
  const [counted] = await db.select({ total: count() }).from(upToDepth);
  const total = counted?.total ?? 0;
  if (searching && total <= MAX_LIST_DEPTH) {
    // Postgres guesses ILIKE's matches poorly. For a term few or none have, it would walk the name index in order
    // looking for a page, and at a big location read every customer ("ahed" at Northside: 6.5 s). With an exact count
    // the matches are few enough to sort: find them through the trigram index only. Past 10,000 they are dense, and
    // the walk finds a page at once. `set local` ends with this read-only transaction (ACME-119).
    await db.execute(sql`set local enable_indexscan = off`);
    await db.execute(sql`set local enable_indexonlyscan = off`);
  }
  const rows = await db
    .select({ id: customers.id })
    .from(customers)
    .where(where)
    .orderBy(...order)
    .limit(pageSize)
    .offset(pageOffset(page, pageSize));
  return { ids: rows.map((row) => row.id), total };
}

/**
 * The customers a list query shows, searched and filtered. Whose they are, and that they are not deleted, is the
 * database's to say: a request sees its own location's live customers (row-level security), and the export, which
 * works outside a request, adds the dealer, the location and `notDeleted` itself. Shared with the export, so the file holds exactly the rows the list shows.
 */
export function customerListWhere(query: ListQueryDto): SQL | undefined {
  return and(query.search ? matching(`%${query.search}%`) : undefined, listFilter(CUSTOMER_LIST_COLUMNS, query));
}

/** The list's order: the query's sort, else by name; always ending with the id, so equal values keep one order. */
export function customerListOrderBy(query: ListQueryDto): SQL[] {
  return listOrderBy(
    CUSTOMER_LIST_COLUMNS,
    query,
    [asc(customers.surname), asc(customers.firstName)],
    [asc(customers.id)],
  );
}

/** A match anywhere in the name, company, email or phone: one text, so one trigram index serves it (ACME-110). */
function matching(pattern: string): SQL {
  return ilike(customerSearchText(customers), pattern);
}
