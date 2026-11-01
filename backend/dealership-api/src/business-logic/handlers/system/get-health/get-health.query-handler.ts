import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { IGetHealthQueryHandler } from "#business-logic-abstractions/handlers/system/get-health/get-health.query-handler.interface";
import type { HealthCheckResponseDto } from "#dto/system/health-check-response.dto";
import {
  type IUnitOfWorkFactory,
  UNIT_OF_WORK_FACTORY,
} from "#persistence/unit-of-work/unit-of-work.factory.interface";

/** Up, which version, and whether the dealership database answers. Aspire polls it (GET /v1/system/health). */
@Injectable()
export class GetHealthQueryHandler implements IGetHealthQueryHandler {
  private readonly _unitOfWorkFactory: IUnitOfWorkFactory;

  public constructor(@Inject(UNIT_OF_WORK_FACTORY) unitOfWorkFactory: IUnitOfWorkFactory) {
    this._unitOfWorkFactory = unitOfWorkFactory;
  }

  public async executeAsync(): Promise<HealthCheckResponseDto> {
    const databaseReachable = await this.canReachDatabaseAsync();
    return {
      service: "dealership-api",
      status: databaseReachable ? "ok" : "degraded",
      version: APP_VERSION,
      databaseReachable,
    };
  }

  private async canReachDatabaseAsync(): Promise<boolean> {
    try {
      await using work = await this._unitOfWorkFactory.beginAsync({ readOnly: true });
      await work.db.execute(sql`select 1`);
      return true;
    } catch {
      return false;
    }
  }
}
