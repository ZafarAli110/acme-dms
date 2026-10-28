import {Injectable} from '@nestjs/common';
import type {IGetHealthQueryHandler} from '#business-logic-abstractions/handlers/system/get-health/get-health.query-handler.interface';
import type {HealthCheckResponseDto} from '#dto/system/health-check-response.dto';

@Injectable()
export class GetHealthQueryHandler implements IGetHealthQueryHandler {
  public async executeAsync(): Promise<HealthCheckResponseDto> {
    return {status: 'ok', uptimeSeconds: Math.round(process.uptime())};
  }
}
