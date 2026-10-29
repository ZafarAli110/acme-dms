import {BadRequestException, NotFoundException, UnprocessableEntityException} from '@nestjs/common';
import {lastValueFrom} from 'rxjs';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import type {ExportJobResponseDto} from '#dto/exports/export-job-response.dto';
import type {ExportRequestDto} from '#dto/exports/export-request.dto';
import {NORTHSIDE, RIVERSIDE} from '#test-setup/postgres/seed-kit';
import {useTestDatabase} from '#test-setup/postgres/use-test-database';
import {fixedClock} from '#test-setup/time/fixed-clock';
import {AT_NORTHSIDE, AT_RIVERSIDE, userAt} from '#test-setup/users/test-users';
import {readXlsxAsync} from '#test-setup/xlsx/read-xlsx';
import {ExportJobRunner} from '../../../../exports/export-job-runner';
import {StartCustomerExportCommandHandler} from '../start-customer-export.command-handler';

const date = (iso: string) => Temporal.PlainDate.from(iso);

function request(changes: Partial<ExportRequestDto> = {}): ExportRequestDto {
  return {
    columns: [
      {field: 'name', header: 'Name'},
      {field: 'city', header: 'City'},
      {field: 'lastContactDate', header: 'Last contact'},
    ],
    ...changes,
  } as ExportRequestDto;
}

describe('StartCustomerExportCommandHandler', () => {
  const database = useTestDatabase();
  let runner: ExportJobRunner;
  let handler: StartCustomerExportCommandHandler;

  beforeAll(async () => {
    runner = new ExportJobRunner(database.unitOfWorkFactory, fixedClock());
    await runner.onModuleInit();
    handler = new StartCustomerExportCommandHandler(runner, fixedClock());
  });

  afterAll(() => {
    runner.onModuleDestroy();
  });

  const finishedAsync = (job: ExportJobResponseDto): Promise<ExportJobResponseDto> =>
    lastValueFrom(runner.progress(AT_NORTHSIDE, job.id));

  const fileOfAsync = async (job: ExportJobResponseDto) => {
    const link = new URL(job.downloadPath!, 'http://service/');
    const file = runner.fileForLink(job.id, link.searchParams.get('expires')!, link.searchParams.get('signature')!);
    return readXlsxAsync(file.path);
  };

  it("writes every row the list shows: this location's, filtered and sorted as asked, with the chosen columns", async () => {
    const seed = database.seed;
    await seed.addCustomerAsync({
      locationId: NORTHSIDE,
      firstName: 'Ann',
      surname: 'Ash',
      city: 'Leeds',
      lastContactDate: date('2026-09-01'),
    });
    await seed.addCustomerAsync({
      locationId: NORTHSIDE,
      firstName: 'Bo',
      surname: 'Birch',
      city: 'York',
      lastContactDate: date('2026-10-01'),
    });
    await seed.addCustomerAsync({
      locationId: NORTHSIDE,
      firstName: 'Cy',
      surname: 'Cedar',
      city: 'Leeds',
      status: 'inactive',
    });
    await seed.addCustomerAsync({
      locationId: NORTHSIDE,
      firstName: 'Di',
      surname: 'Deleted',
      city: 'Leeds',
      deleted: true,
    });
    await seed.addCustomerAsync({locationId: RIVERSIDE, firstName: 'Ed', surname: 'Elm', city: 'Leeds'});

    const started = handler.execute(
      AT_NORTHSIDE,
      request({
        filterField: 'status',
        filterOperator: 'is',
        filterValue: 'active',
        sort: 'lastContactDate',
        direction: 'desc',
      }),
      null,
    );
    const finished = await finishedAsync(started);
    const [sheet] = await fileOfAsync(finished);

    expect(finished).toMatchObject({status: 'completed', rows: 2, totalRows: 2});
    expect(sheet?.rows).toEqual([
      ['Name', 'City', 'Last contact'],
      ['Bo Birch', 'York', String(Temporal.PlainDate.from('2026-10-01').since('1899-12-30').days)],
      ['Ann Ash', 'Leeds', String(Temporal.PlainDate.from('2026-09-01').since('1899-12-30').days)],
    ]);
    expect(sheet?.dateCells[1]).toEqual([false, false, true]);
  });

  it('gives a retry with the same idempotency key the same export, and refuses the key for another request', async () => {
    const first = handler.execute(AT_NORTHSIDE, request(), 'key-1');
    const retry = handler.execute(AT_NORTHSIDE, request(), 'key-1');

    expect(retry.id).toBe(first.id);
    expect(() => handler.execute(AT_NORTHSIDE, request({sort: 'city'}), 'key-1')).toThrow(UnprocessableEntityException);
    await finishedAsync(first);
  });

  it("refuses a column the list can't export, and a sort it doesn't have, before starting", () => {
    expect(() => handler.execute(AT_NORTHSIDE, request({columns: [{field: 'password', header: 'P'}]}), null)).toThrow(
      BadRequestException,
    );
    expect(() => handler.execute(AT_NORTHSIDE, request({sort: 'password'}), null)).toThrow(BadRequestException);
  });

  it("keeps someone else's export to them: another user's lookup is not found", async () => {
    const job = handler.execute(AT_RIVERSIDE, request(), null);

    expect(() => runner.get(userAt(NORTHSIDE), job.id)).not.toThrow();
    expect(() => runner.get({...AT_RIVERSIDE, userId: '30000000-0000-0000-0000-0000000000bb'}, job.id)).toThrow(
      NotFoundException,
    );
    await finishedAsync(job);
  });

  it('cancels an export and deletes what it wrote', async () => {
    const job = handler.execute(AT_NORTHSIDE, request(), null);
    await runner.cancelAsync(AT_NORTHSIDE, job.id);

    const finished = await finishedAsync(job);

    expect(finished.status).toBe('cancelled');
    expect(finished.downloadPath).toBeNull();
  });
});
