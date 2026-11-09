import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { ICountCustomersQueryHandler } from "#business-logic-abstractions/handlers/customers/count/count-customers.query-handler.interface";
import type { UserContext } from "#business-logic-abstractions/user-context/user-context";
import type { CustomerCountResponseDto } from "#dto/customers/customer-count-response.dto";
import type { ListQueryDto } from "#dto/paging/list-query.dto";
import { mostCountedExactly } from "#dto/paging/list-total.dto";
import type { Database } from "#persistence/unit-of-work/unit-of-work";
import { customers } from "#persistence/schema/customers";
import {
  type IUnitOfWorkFactory,
  UNIT_OF_WORK_FACTORY,
} from "#persistence/unit-of-work/unit-of-work.factory.interface";
import { estimateRowsAsync } from "../../../list-query/estimate";
import { MAX_LIST_DEPTH } from "../../../list-query/page-offset";
import { matchesText } from "../../../list-query/list-columns";
import { requireLocation } from "../../../user-context/require-location";
import {
  CUSTOMER_LIST_COLUMNS,
  countUpToAsync,
  customerListWhere,
  ownerScoped,
} from "../get-list/get-customer-list.query-handler";

/**
 * How many customers the list's search and filter match, at the user's location, as the footer shows it (ACME-129).
 * The whole list, or a status filter: "about" a number, from Postgres's statistics, in about a millisecond, when the
 * list is big (counting Northside's 1.6 million exactly was a quarter of the database's work on a busy morning); exact
 * when it is small, where counting costs little and the statistics, sampled across every location, are rough (Central:
 * 829 expected, 1,095 there). Anything else (a search, a text or date filter): exact when every match fits on the
 * biggest page (100), else "many", since an estimate of a search can be thirty times off. The web asks once per
 * question and keeps it while the pages change (ACME-117).
 */
@Injectable()
export class CountCustomersQueryHandler implements ICountCustomersQueryHandler {
  private readonly _unitOfWorkFactory: IUnitOfWorkFactory;

  public constructor(@Inject(UNIT_OF_WORK_FACTORY) unitOfWorkFactory: IUnitOfWorkFactory) {
    this._unitOfWorkFactory = unitOfWorkFactory;
  }

  public async executeAsync(userContext: UserContext, query: ListQueryDto): Promise<CustomerCountResponseDto> {
    const locationId = requireLocation(userContext);
    const where = customerListWhere(query);
    if (!query.search && (!query.filterField || query.filterField === "status")) {
      // Under the policy: the estimate is of this location's live customers.
      await using work = await this._unitOfWorkFactory.beginAsync({ readOnly: true });
      return await totalOfListAsync(work.db, where);
    }
    // Counted as the list finds its ids: a search or a text filter as the table's owner with the scope written out (no
    // index could serve their ILIKE under row-level security), anything else under the policy.
    const asOwner = Boolean(query.search) || matchesText(CUSTOMER_LIST_COLUMNS, query);
    await using work = await this._unitOfWorkFactory.beginAsync({ readOnly: true, asOwner });
    const found = await countUpToAsync(
      work.db,
      asOwner ? ownerScoped(userContext.dealerId, locationId, where) : where,
      mostCountedExactly(query) + 1,
    );
    return found > mostCountedExactly(query) ? { kind: "many", value: null } : { kind: "exact", value: found };
  }
}

/** The whole list's (or a status filter's) total: about, from the statistics, when big; counted when small. */
async function totalOfListAsync(
  db: Database,
  where: ReturnType<typeof customerListWhere>,
): Promise<CustomerCountResponseDto> {
  const about = await estimateRowsAsync(
    db,
    db
      .select({ one: sql`1` })
      .from(customers)
      .where(where),
  );
  if (about > MAX_LIST_DEPTH) {
    return { kind: "about", value: about };
  }
  // Expected small: count, up to twice that, in case the statistics were low.
  const counted = await countUpToAsync(db, where, 2 * MAX_LIST_DEPTH + 1);
  return counted > 2 * MAX_LIST_DEPTH ? { kind: "about", value: counted } : { kind: "exact", value: counted };
}
