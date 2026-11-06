import { ApiHeader } from "@nestjs/swagger";
import { IfMatchVersion } from "../../concurrency/record-version";
import { ETagged } from "../../interceptors/etag.interceptor";
import { Body, Controller, Inject, Param, ParseUUIDPipe, Post, Put } from "@nestjs/common";
import {
  CREATE_CUSTOMER_COMMAND_HANDLER,
  type ICreateCustomerCommandHandler,
} from "#business-logic-abstractions/handlers/customers/create/create-customer.command-handler.interface";
import {
  type IUpdateCustomerCommandHandler,
  UPDATE_CUSTOMER_COMMAND_HANDLER,
} from "#business-logic-abstractions/handlers/customers/update/update-customer.command-handler.interface";
import type { UserContext } from "#business-logic-abstractions/user-context/user-context";
import type { CustomerCreateRequestDto } from "#dto/customers/customer-create-request.dto";
import { CustomerRequestSchema } from "#dto/customers/customer-request.schema";
import type { CustomerResponseDto } from "#dto/customers/customer-response.dto";
import type { CustomerUpdateRequestDto } from "#dto/customers/customer-update-request.dto";
import { CurrentUser } from "../../authorization/current-user.decorator";
import { RequirePermission } from "../../authorization/require-permission.decorator";
import { Timeout } from "@nestjs/resilience";
import { Created } from "../../interceptors/created.interceptor";

/** Changes to the customers of the location selected in `x-location-id`. Reads are in CustomerController. */
@Timeout()
@Controller("v1/customers")
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
  @Created((customer: CustomerResponseDto) => `/v1/customers/${customer.id}`)
  @RequirePermission("customers.write")
  public createAsync(
    @CurrentUser() userContext: UserContext,
    @Body({ schema: CustomerRequestSchema }) request: CustomerCreateRequestDto,
  ): Promise<CustomerResponseDto> {
    return this._createCustomerCommandHandler.executeAsync(userContext, request);
  }

  @Put(":customerId")
  @RequirePermission("customers.write")
  @ETagged()
  @ApiHeader({
    name: "If-Match",
    required: true,
    description:
      'The ETag of the version this save started from, such as "7"; 412 when it is no longer the current one.',
  })
  public updateAsync(
    @CurrentUser() userContext: UserContext,
    @Param("customerId", ParseUUIDPipe) customerId: string,
    @Body({ schema: CustomerRequestSchema }) request: CustomerUpdateRequestDto,
    @IfMatchVersion() expectedVersion: number | null,
  ): Promise<CustomerResponseDto> {
    return this._updateCustomerCommandHandler.executeAsync(userContext, customerId, request, expectedVersion);
  }
}
