import { ETagged } from "../../interceptors/etag.interceptor";
import { Controller, Get, Inject, Param, ParseUUIDPipe, Query } from "@nestjs/common";
import {
  GET_CUSTOMER_LIST_QUERY_HANDLER,
  type IGetCustomerListQueryHandler,
} from "#business-logic-abstractions/handlers/customers/get-list/get-customer-list.query-handler.interface";
import {
  GET_RECENT_CUSTOMERS_QUERY_HANDLER,
  type IGetRecentCustomersQueryHandler,
} from "#business-logic-abstractions/handlers/customers/get-recent/get-recent-customers.query-handler.interface";
import {
  GET_CUSTOMER_QUERY_HANDLER,
  type IGetCustomerQueryHandler,
} from "#business-logic-abstractions/handlers/customers/get/get-customer.query-handler.interface";
import {
  COUNT_CUSTOMERS_QUERY_HANDLER,
  type ICountCustomersQueryHandler,
} from "#business-logic-abstractions/handlers/customers/count/count-customers.query-handler.interface";
import type { UserContext } from "#business-logic-abstractions/user-context/user-context";
import type { CustomerCountResponseDto } from "#dto/customers/customer-count-response.dto";
import type { CustomerListItemDto } from "#dto/customers/customer-list-item.dto";
import type { CustomerPageResponseDto } from "#dto/customers/customer-page-response.dto";
import type { CustomerResponseDto } from "#dto/customers/customer-response.dto";
import { ListQuerySchema, type ListQueryDto } from "#dto/paging/list-query.dto";
import { CurrentUser } from "../../authorization/current-user.decorator";
import { RequirePermission } from "../../authorization/require-permission.decorator";
import { Timeout } from "@nestjs/resilience";

/** Reads of the customers of the location selected in `x-location-id`. Writes are in CustomerCommandController. */
@Timeout()
@Controller("v1/customers")
export class CustomerController {
  private readonly _getCustomerListQueryHandler: IGetCustomerListQueryHandler;
  private readonly _getRecentCustomersQueryHandler: IGetRecentCustomersQueryHandler;
  private readonly _getCustomerQueryHandler: IGetCustomerQueryHandler;
  private readonly _countCustomersQueryHandler: ICountCustomersQueryHandler;

  public constructor(
    @Inject(GET_CUSTOMER_LIST_QUERY_HANDLER) getCustomerListQueryHandler: IGetCustomerListQueryHandler,
    @Inject(GET_RECENT_CUSTOMERS_QUERY_HANDLER) getRecentCustomersQueryHandler: IGetRecentCustomersQueryHandler,
    @Inject(GET_CUSTOMER_QUERY_HANDLER) getCustomerQueryHandler: IGetCustomerQueryHandler,
    @Inject(COUNT_CUSTOMERS_QUERY_HANDLER) countCustomersQueryHandler: ICountCustomersQueryHandler,
  ) {
    this._getCustomerListQueryHandler = getCustomerListQueryHandler;
    this._getRecentCustomersQueryHandler = getRecentCustomersQueryHandler;
    this._getCustomerQueryHandler = getCustomerQueryHandler;
    this._countCustomersQueryHandler = countCustomersQueryHandler;
  }

  @Get()
  @RequirePermission("customers.read")
  public findAllAsync(
    @CurrentUser() userContext: UserContext,
    @Query({ schema: ListQuerySchema }) query: ListQueryDto,
  ): Promise<CustomerPageResponseDto> {
    return this._getCustomerListQueryHandler.executeAsync(userContext, query);
  }

  /**
   * How many customers the search and filter match: exact up to 10,000, 10,001 past it ("10,000+"). Asked once per
   * search and filter, not on every page (ACME-117); the page and the sort do not change it. Declared before
   * `:customerId` so it matches first.
   */
  @Get("count")
  @RequirePermission("customers.read")
  public countAsync(
    @CurrentUser() userContext: UserContext,
    @Query({ schema: ListQuerySchema }) query: ListQueryDto,
  ): Promise<CustomerCountResponseDto> {
    return this._countCustomersQueryHandler.executeAsync(userContext, query);
  }

  /** The customers contacted most recently, for the home page. Declared before `:customerId` so it matches first. */
  @Get("recent")
  @RequirePermission("customers.read")
  public findRecentAsync(@CurrentUser() userContext: UserContext): Promise<CustomerListItemDto[]> {
    return this._getRecentCustomersQueryHandler.executeAsync(userContext);
  }

  @Get(":customerId")
  @RequirePermission("customers.read")
  @ETagged()
  public findOneAsync(
    @CurrentUser() userContext: UserContext,
    @Param("customerId", ParseUUIDPipe) customerId: string,
  ): Promise<CustomerResponseDto> {
    return this._getCustomerQueryHandler.executeAsync(userContext, customerId);
  }
}
