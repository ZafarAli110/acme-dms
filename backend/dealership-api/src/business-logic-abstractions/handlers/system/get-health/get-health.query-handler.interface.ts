import type {HealthCheckResponseDto} from '#dto/system/health-check-response.dto';

export interface IGetHealthQueryHandler {
  executeAsync(): Promise<HealthCheckResponseDto>;
}

/** DI token: Nest cannot inject an interface, so controllers inject this token instead. */
export const GET_HEALTH_QUERY_HANDLER = Symbol('IGetHealthQueryHandler');
