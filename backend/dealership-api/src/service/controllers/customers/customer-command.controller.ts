import {Body, Controller, HttpCode, HttpStatus, Inject, Param, ParseUUIDPipe, Post, Put} from '@nestjs/common';
import {
  CREATE_CUSTOMER_COMMAND_HANDLER,
  type ICreateCustomerCommandHandler,
} from '#business-logic-abstractions/handlers/customers/create/create-customer.command-handler.interface';
import {
  type IUpdateCustomerCommandHandler,
  UPDATE_CUSTOMER_COMMAND_HANDLER,
} from '#business-logic-abstractions/handlers/customers/update/update-customer.command-handler.interface';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import {CustomerCreateRequestDto} from '#dto/customers/customer-create-request.dto';
import type {CustomerResponseDto} from '#dto/customers/customer-response.dto';
import {CustomerUpdateRequestDto} from '#dto/customers/customer-update-request.dto';
import {CurrentUser} from '../../authorization/current-user.decorator';
import {RequirePermission} from '../../authorization/require-permission.decorator';

/** Changes to the customers of the location selected in `x-location-id`. Reads are in CustomerController. */
@Controller('v1/customers')
export class CustomerCommandController {
  private readonly _createCustomerCommandHandler: ICreateCustomerCommandHandler;
  private readonly _updateCustomerCommandHandler: IUpdateCustomerCommandHandler;

  public constructor(
    @Inject(CREATE_CUSTOMER_COMMAND_HANDLER) createCustomerCommandHandler: ICreateCustomerCommandHandler,
    @Inject(UPDATE_CUSTOMER_COMMAND_HANDLER) updateCustomerCommandHandler: IUpdateCustomerCommandHandler,
  ) {
    this._createCustomerCommandHandler = createCustomerCommandHandler;
    this._updateCustomerCommandHandler = updateCustomerCommandHandler;
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('customers.write')
  public createAsync(
    @CurrentUser() userContext: UserContext,
    @Body() request: CustomerCreateRequestDto,
  ): Promise<CustomerResponseDto> {
    return this._createCustomerCommandHandler.executeAsync(userContext, request);
  }

  @Put(':customerId')
  @RequirePermission('customers.write')
  public updateAsync(
    @CurrentUser() userContext: UserContext,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() request: CustomerUpdateRequestDto,
  ): Promise<CustomerResponseDto> {
    return this._updateCustomerCommandHandler.executeAsync(userContext, customerId, request);
  }
}
