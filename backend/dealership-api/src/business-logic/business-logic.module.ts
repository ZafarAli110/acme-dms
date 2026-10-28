import {Module} from '@nestjs/common';
import {MARK_PART_PHOTO_FAILED_COMMAND_HANDLER} from '#business-logic-abstractions/handlers/parts/mark-photo-failed/mark-part-photo-failed.command-handler.interface';
import {MARK_PART_PHOTO_READY_COMMAND_HANDLER} from '#business-logic-abstractions/handlers/parts/mark-photo-ready/mark-part-photo-ready.command-handler.interface';
import {CREATE_PART_COMMAND_HANDLER} from '#business-logic-abstractions/handlers/parts/create/create-part.command-handler.interface';
import {GET_PART_LIST_QUERY_HANDLER} from '#business-logic-abstractions/handlers/parts/get-list/get-part-list.query-handler.interface';
import {GET_PART_QUERY_HANDLER} from '#business-logic-abstractions/handlers/parts/get/get-part.query-handler.interface';
import {UPDATE_PART_COMMAND_HANDLER} from '#business-logic-abstractions/handlers/parts/update/update-part.command-handler.interface';
import {UPLOAD_PART_PHOTO_COMMAND_HANDLER} from '#business-logic-abstractions/handlers/parts/upload-photo/upload-part-photo.command-handler.interface';
import {GET_STOCK_LIST_QUERY_HANDLER} from '#business-logic-abstractions/handlers/stock/get-list/get-stock-list.query-handler.interface';
import {SET_STOCK_LEVEL_COMMAND_HANDLER} from '#business-logic-abstractions/handlers/stock/set-level/set-stock-level.command-handler.interface';
import {GET_USER_CONTEXT_QUERY_HANDLER} from '#business-logic-abstractions/handlers/system/get-user-context/get-user-context.query-handler.interface';
import {GET_HEALTH_QUERY_HANDLER} from '#business-logic-abstractions/handlers/system/get-health/get-health.query-handler.interface';
import {CREATE_CUSTOMER_COMMAND_HANDLER} from '#business-logic-abstractions/handlers/customers/create/create-customer.command-handler.interface';
import {GET_CUSTOMER_LIST_QUERY_HANDLER} from '#business-logic-abstractions/handlers/customers/get-list/get-customer-list.query-handler.interface';
import {GET_RECENT_CUSTOMERS_QUERY_HANDLER} from '#business-logic-abstractions/handlers/customers/get-recent/get-recent-customers.query-handler.interface';
import {GET_CUSTOMER_QUERY_HANDLER} from '#business-logic-abstractions/handlers/customers/get/get-customer.query-handler.interface';
import {UPDATE_CUSTOMER_COMMAND_HANDLER} from '#business-logic-abstractions/handlers/customers/update/update-customer.command-handler.interface';
import {CREATE_BIN_COMMAND_HANDLER} from '#business-logic-abstractions/handlers/bins/create/create-bin.command-handler.interface';
import {GET_BIN_LIST_QUERY_HANDLER} from '#business-logic-abstractions/handlers/bins/get-list/get-bin-list.query-handler.interface';
import {PersistenceModule} from '#persistence/persistence.module';
import {CLOCK} from '#business-logic-abstractions/time/clock.interface';
import {SystemClock} from './time/system-clock';
import {CreateBinCommandHandler} from './handlers/bins/create/create-bin.command-handler';
import {GetBinListQueryHandler} from './handlers/bins/get-list/get-bin-list.query-handler';
import {CreateCustomerCommandHandler} from './handlers/customers/create/create-customer.command-handler';
import {GetCustomerListQueryHandler} from './handlers/customers/get-list/get-customer-list.query-handler';
import {GetRecentCustomersQueryHandler} from './handlers/customers/get-recent/get-recent-customers.query-handler';
import {GetCustomerQueryHandler} from './handlers/customers/get/get-customer.query-handler';
import {UpdateCustomerCommandHandler} from './handlers/customers/update/update-customer.command-handler';
import {MarkPartPhotoFailedCommandHandler} from './handlers/parts/mark-photo-failed/mark-part-photo-failed.command-handler';
import {MarkPartPhotoReadyCommandHandler} from './handlers/parts/mark-photo-ready/mark-part-photo-ready.command-handler';
import {CreatePartCommandHandler} from './handlers/parts/create/create-part.command-handler';
import {GetPartListQueryHandler} from './handlers/parts/get-list/get-part-list.query-handler';
import {GetPartQueryHandler} from './handlers/parts/get/get-part.query-handler';
import {UpdatePartCommandHandler} from './handlers/parts/update/update-part.command-handler';
import {UploadPartPhotoCommandHandler} from './handlers/parts/upload-photo/upload-part-photo.command-handler';
import {GetStockListQueryHandler} from './handlers/stock/get-list/get-stock-list.query-handler';
import {SetStockLevelCommandHandler} from './handlers/stock/set-level/set-stock-level.command-handler';
import {GetUserContextQueryHandler} from './handlers/system/get-user-context/get-user-context.query-handler';
import {GetHealthQueryHandler} from './handlers/system/get-health/get-health.query-handler';

/** Registers every business handler against its abstraction token. Add one line per new handler. */
const HANDLERS = [
  {provide: GET_HEALTH_QUERY_HANDLER, useClass: GetHealthQueryHandler},
  {provide: GET_USER_CONTEXT_QUERY_HANDLER, useClass: GetUserContextQueryHandler},
  {provide: GET_PART_LIST_QUERY_HANDLER, useClass: GetPartListQueryHandler},
  {provide: GET_PART_QUERY_HANDLER, useClass: GetPartQueryHandler},
  {provide: CREATE_PART_COMMAND_HANDLER, useClass: CreatePartCommandHandler},
  {provide: UPDATE_PART_COMMAND_HANDLER, useClass: UpdatePartCommandHandler},
  {provide: UPLOAD_PART_PHOTO_COMMAND_HANDLER, useClass: UploadPartPhotoCommandHandler},
  {provide: GET_BIN_LIST_QUERY_HANDLER, useClass: GetBinListQueryHandler},
  {provide: CREATE_BIN_COMMAND_HANDLER, useClass: CreateBinCommandHandler},
  {provide: GET_STOCK_LIST_QUERY_HANDLER, useClass: GetStockListQueryHandler},
  {provide: SET_STOCK_LEVEL_COMMAND_HANDLER, useClass: SetStockLevelCommandHandler},
  {provide: GET_CUSTOMER_LIST_QUERY_HANDLER, useClass: GetCustomerListQueryHandler},
  {provide: GET_CUSTOMER_QUERY_HANDLER, useClass: GetCustomerQueryHandler},
  {provide: GET_RECENT_CUSTOMERS_QUERY_HANDLER, useClass: GetRecentCustomersQueryHandler},
  {provide: CREATE_CUSTOMER_COMMAND_HANDLER, useClass: CreateCustomerCommandHandler},
  {provide: UPDATE_CUSTOMER_COMMAND_HANDLER, useClass: UpdateCustomerCommandHandler},
  {provide: MARK_PART_PHOTO_READY_COMMAND_HANDLER, useClass: MarkPartPhotoReadyCommandHandler},
  {provide: MARK_PART_PHOTO_FAILED_COMMAND_HANDLER, useClass: MarkPartPhotoFailedCommandHandler},
];

@Module({
  imports: [PersistenceModule],
  // The clock handlers use for the current time (tests pass a fixed one).
  providers: [...HANDLERS, {provide: CLOCK, useClass: SystemClock}],
  exports: [...HANDLERS.map((handler) => handler.provide), CLOCK],
})
export class BusinessLogicModule {}
