import {open} from 'node:fs/promises';
import type {IncomingMessage, ServerResponse} from 'node:http';
import {pipeline} from 'node:stream/promises';
import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  type MessageEvent,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  Res,
  Sse,
} from '@nestjs/common';
import {map, type Observable} from 'rxjs';
import {EXPORT_JOBS, type IExportJobs} from '#business-logic-abstractions/exports/export-jobs.interface';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {ExportJobResponseDto} from '#dto/exports/export-job-response.dto';
import {Public} from '../../authentication/public.decorator';
import {CurrentUser} from '../../authorization/current-user.decorator';

const RANGE = /^bytes=(\d*)-(\d*)$/;

/** An export the user started: its state, its progress as it runs, cancelling it, and its file. */
@Controller('v1/exports')
export class ExportController {
  private readonly _exportJobs: IExportJobs;

  public constructor(@Inject(EXPORT_JOBS) exportJobs: IExportJobs) {
    this._exportJobs = exportJobs;
  }

  @Get(':jobId')
  public get(
    @CurrentUser() userContext: UserContext,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ): ExportJobResponseDto {
    return this._exportJobs.get(userContext, jobId);
  }

  /** Server-sent events: a `progress` event at most a few times a second; the stream ends with the last state. */
  @Sse(':jobId/events')
  public events(
    @CurrentUser() userContext: UserContext,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ): Observable<MessageEvent> {
    let sequence = 0;
    return this._exportJobs
      .progress(userContext, jobId)
      .pipe(map((snapshot) => ({id: String(++sequence), type: 'progress', data: snapshot})));
  }

  /** Cancels a queued or running export; for a finished one, deletes its file now. */
  @Delete(':jobId')
  @HttpCode(HttpStatus.NO_CONTENT)
  public async cancelAsync(
    @CurrentUser() userContext: UserContext,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ): Promise<void> {
    await this._exportJobs.cancelAsync(userContext, jobId);
  }

  /**
   * The file, through the signed link in the export's `downloadPath`: the browser saves it straight to disk, with no
   * bearer token. It has a length, and a `Range` request resumes a download that broke off.
   */
  @Public()
  @Get(':jobId/file')
  public async downloadAsync(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Query('expires') expires: string,
    @Query('signature') signature: string,
    @Req() request: IncomingMessage,
    @Res() response: ServerResponse,
  ): Promise<void> {
    const file = this._exportJobs.fileForLink(jobId, expires, signature);
    // Opened before anything is sent: if the file has just expired, the client gets an error, not half a response.
    await using handle = await open(file.path);
    let start = 0;
    let end = file.bytes - 1;
    let status = 200;
    const range = RANGE.exec(request.headers.range ?? '');
    if (range) {
      const [, from = '', to = ''] = range;
      start = from === '' ? Math.max(0, file.bytes - Number(to)) : Number(from);
      end = from !== '' && to !== '' ? Math.min(Number(to), file.bytes - 1) : end;
      if (start > end) {
        response.writeHead(416, {'content-range': `bytes */${file.bytes}`});
        response.end();
        return;
      }
      status = 206;
    }
    response.writeHead(status, {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${file.fileName}"`,
      'content-length': String(end - start + 1),
      'accept-ranges': 'bytes',
      ...(status === 206 && {'content-range': `bytes ${start}-${end}/${file.bytes}`}),
    });
    try {
      await pipeline(handle.createReadStream({start, end, autoClose: false}), response);
    } catch {
      // The client went away mid-download; it can resume with a Range request.
    }
  }
}
