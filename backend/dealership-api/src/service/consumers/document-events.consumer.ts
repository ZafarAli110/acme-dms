import {Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown} from '@nestjs/common';
import {type Channel, type ChannelModel, type ConsumeMessage, connect} from 'amqplib';
import {
  MARK_PART_PHOTO_FAILED_COMMAND_HANDLER,
  type IMarkPartPhotoFailedCommandHandler,
} from '#business-logic-abstractions/handlers/parts/mark-photo-failed/mark-part-photo-failed.command-handler.interface';
import {
  MARK_PART_PHOTO_READY_COMMAND_HANDLER,
  type IMarkPartPhotoReadyCommandHandler,
} from '#business-logic-abstractions/handlers/parts/mark-photo-ready/mark-part-photo-ready.command-handler.interface';
import {UnhandledMessageError} from '#business-logic-abstractions/messaging/unhandled-message.error';
import {
  DOCUMENT_FAILED,
  DOCUMENT_PROCESSED,
  type DocumentFailedMessageDto,
  type DocumentProcessedMessageDto,
  type MessageEnvelopeDto,
} from '#dto/messages/document-messages.dto';

const EXCHANGE = 'acme.documents';
const DEAD_LETTER_EXCHANGE = 'acme.documents.dlx';
const QUEUE = 'dealership-api.document-events';
const DEAD_LETTER_QUEUE = 'dealership-api.document-events.dlq';

/**
 * Consumes document-api's events: an inbound adapter, like a controller, that hands each message to a business
 * handler. A message that cannot be handled (unknown type or owner, or a handler error) is dead-lettered, not
 * retried forever; inspect it in RabbitMQ's management UI.
 */
@Injectable()
export class DocumentEventsConsumer implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly _logger = new Logger(DocumentEventsConsumer.name);
  private readonly _markPartPhotoReady: IMarkPartPhotoReadyCommandHandler;
  private readonly _markPartPhotoFailed: IMarkPartPhotoFailedCommandHandler;
  private _connection: ChannelModel | null = null;

  public constructor(
    @Inject(MARK_PART_PHOTO_READY_COMMAND_HANDLER) markPartPhotoReady: IMarkPartPhotoReadyCommandHandler,
    @Inject(MARK_PART_PHOTO_FAILED_COMMAND_HANDLER) markPartPhotoFailed: IMarkPartPhotoFailedCommandHandler,
  ) {
    this._markPartPhotoReady = markPartPhotoReady;
    this._markPartPhotoFailed = markPartPhotoFailed;
  }

  public async onApplicationBootstrap(): Promise<void> {
    const url = process.env['ConnectionStrings__rabbitmq'];
    if (!url) {
      throw new Error('ConnectionStrings__rabbitmq is not set; dealership-api must run under Aspire.');
    }
    this._connection = await connect(url, {clientProperties: {connection_name: 'dealership-api'}});
    const channel = await this._connection.createChannel();
    await this.declareTopologyAsync(channel);
    await channel.prefetch(10);
    await channel.consume(QUEUE, (message) => void this.handleAsync(channel, message));
    this._logger.log(`Consuming ${QUEUE}`);
  }

  public async onApplicationShutdown(): Promise<void> {
    await this._connection?.close();
  }

  private async declareTopologyAsync(channel: Channel): Promise<void> {
    await channel.assertExchange(EXCHANGE, 'topic', {durable: true});
    await channel.assertExchange(DEAD_LETTER_EXCHANGE, 'topic', {durable: true});
    await channel.assertQueue(DEAD_LETTER_QUEUE, {durable: true});
    await channel.bindQueue(DEAD_LETTER_QUEUE, DEAD_LETTER_EXCHANGE, DOCUMENT_PROCESSED);
    await channel.bindQueue(DEAD_LETTER_QUEUE, DEAD_LETTER_EXCHANGE, DOCUMENT_FAILED);
    await channel.assertQueue(QUEUE, {durable: true, deadLetterExchange: DEAD_LETTER_EXCHANGE});
    await channel.bindQueue(QUEUE, EXCHANGE, DOCUMENT_PROCESSED);
    await channel.bindQueue(QUEUE, EXCHANGE, DOCUMENT_FAILED);
  }

  private async handleAsync(channel: Channel, message: ConsumeMessage | null): Promise<void> {
    if (!message) {
      return;
    }
    try {
      const envelope = JSON.parse(message.content.toString('utf8')) as MessageEnvelopeDto<unknown>;
      switch (envelope.type) {
        case DOCUMENT_PROCESSED:
          await this._markPartPhotoReady.executeAsync(envelope as MessageEnvelopeDto<DocumentProcessedMessageDto>);
          break;
        case DOCUMENT_FAILED:
          await this._markPartPhotoFailed.executeAsync(envelope as MessageEnvelopeDto<DocumentFailedMessageDto>);
          break;
        default:
          throw new UnhandledMessageError(`Unknown message type '${envelope.type}'.`);
      }
      channel.ack(message);
    } catch (error) {
      this._logger.error(
        {err: error, routingKey: message.fields.routingKey},
        'Dead-lettering a document event that could not be handled',
      );
      channel.nack(message, false, false);
    }
  }
}
