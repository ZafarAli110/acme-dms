import {Controller, Get, Inject, Param, ParseUUIDPipe, Query} from '@nestjs/common';
import {
  GET_CUSTOMER_LIST_QUERY_HANDLER,
  type IGetCustomerListQueryHandler,
} from '#business-logic-abstractions/handlers/customers/get-list/get-customer-list.query-handler.interface';
import {
  GET_RECENT_CUSTOMERS_QUERY_HANDLER,
  type IGetRecentCustomersQueryHandler,
} from '#business-logic-abstractions/handlers/customers/get-recent/get-recent-customers.query-handler.interface';
import {
  GET_CUSTOMER_QUERY_HANDLER,
  type IGetCustomerQueryHandler,
} from '#business-logic-abstractions/handlers/customers/get/get-customer.query-handler.interface';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {CustomerListItemDto} from '#dto/customers/customer-list-item.dto';
import type {CustomerResponseDto} from '#dto/customers/customer-response.dto';
import {ListQueryDto} from '#dto/paging/list-query.dto';
import type {PageResponseDto} from '#dto/paging/page-response.dto';
import {CurrentUser} from '../../authorization/current-user.decorator';
import {RequirePermission} from '../../authorization/require-permission.decorator';

/** Reads of the customers of the location selected in `x-location-id`. Writes are in CustomerCommandController. */
@Controller('v1/customers')
export class CustomerController {
  private readonly _getCustomerListQueryHandler: IGetCustomerListQueryHandler;
  private readonly _getRecentCustomersQueryHandler: IGetRecentCustomersQueryHandler;
  private readonly _getCustomerQueryHandler: IGetCustomerQueryHandler;

  public constructor(
    @Inject(GET_CUSTOMER_LIST_QUERY_HANDLER) getCustomerListQueryHandler: IGetCustomerListQueryHandler,
    @Inject(GET_RECENT_CUSTOMERS_QUERY_HANDLER) getRecentCustomersQueryHandler: IGetRecentCustomersQueryHandler,
    @Inject(GET_CUSTOMER_QUERY_HANDLER) getCustomerQueryHandler: IGetCustomerQueryHandler,
  ) {
    this._getCustomerListQueryHandler = getCustomerListQueryHandler;
    this._getRecentCustomersQueryHandler = getRecentCustomersQueryHandler;
    this._getCustomerQueryHandler = getCustomerQueryHandler;
  }

  @Get()
  @RequirePermission('customers.read')
  public findAllAsync(
    @CurrentUser() userContext: UserContext,
    @Query() query: ListQueryDto,
  ): Promise<PageResponseDto<CustomerListItemDto>> {
    return this._getCustomerListQueryHandler.executeAsync(userContext, query);
  }

  /** The customers contacted most recently, for the home page. Declared before `:customerId` so it matches first. */
  @Get('recent')
  @RequirePermission('customers.read')
  public findRecentAsync(@CurrentUser() userContext: UserContext): Promise<CustomerListItemDto[]> {
    return this._getRecentCustomersQueryHandler.executeAsync(userContext);
  }

  @Get(':customerId')
  @RequirePermission('customers.read')
  public findOneAsync(
    @CurrentUser() userContext: UserContext,
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ): Promise<CustomerResponseDto> {
    return this._getCustomerQueryHandler.executeAsync(userContext, customerId);
  }
}
