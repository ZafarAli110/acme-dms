import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { type ChannelModel, type ConfirmChannel, type ConsumeMessage, connect } from "amqplib";
import {
  MARK_PART_PHOTO_FAILED_COMMAND_HANDLER,
  type IMarkPartPhotoFailedCommandHandler,
} from "#business-logic-abstractions/handlers/parts/mark-photo-failed/mark-part-photo-failed.command-handler.interface";
import {
  MARK_PART_PHOTO_READY_COMMAND_HANDLER,
  type IMarkPartPhotoReadyCommandHandler,
} from "#business-logic-abstractions/handlers/parts/mark-photo-ready/mark-part-photo-ready.command-handler.interface";
import { UnhandledMessageError } from "#business-logic-abstractions/messaging/unhandled-message.error";
import {
  DOCUMENT_FAILED,
  DOCUMENT_PROCESSED,
  DOCUMENT_UNCLAIMED,
  type DocumentFailedMessageDto,
  type DocumentProcessedMessageDto,
  type DocumentUnclaimedMessageDto,
  type MessageEnvelopeDto,
} from "#dto/messages/document-messages.dto";
import { requireSetting, SETTINGS, type Settings } from "#settings/settings";
import { DEAD_LETTER_QUEUE, QUEUE, RETRIES_HEADER } from "./document-events.queues";
import type { IDocumentMessagePublisher } from "#business-logic-abstractions/messaging/document-message.publisher.interface";

const EXCHANGE = "acme.documents";
const DEAD_LETTER_EXCHANGE = "acme.documents.dlx";
/** A message whose handler failed waits here RETRY_DELAY_MS, then goes back to QUEUE, up to MAX_RETRIES times. */
const RETRY_QUEUE = "dealership-api.document-events.retry";
const RETRY_DELAY_MS = 5_000;
const MAX_RETRIES = 5;
/** How often the dead-letter queue is looked at: a parked event is logged until someone replays it. */
const DEAD_LETTER_CHECK_MS = 60_000;
/** How long to wait before connecting again after RabbitMQ dropped the connection. */
const RECONNECT_MS = 5_000;

/**
 * Consumes document-api's events: an inbound adapter, like a controller, that hands each message to a business
 * handler. A message that can never be handled (unknown type or owner, or not JSON) is dead-lettered at once; inspect it
 * in RabbitMQ's management UI. One whose handler failed (the database out of reach for a moment) is tried again, a few
 * seconds later, MAX_RETRIES times, then dead-lettered: a photo is not left pending for good by a passing failure.
 *
 * A dropped connection (a heartbeat missed while the computer slept, RabbitMQ restarting) is logged and connected
 * again every RECONNECT_MS: without its error listener, amqplib throws it and the whole API stops.
 */
@Injectable()
export class DocumentEventsConsumer
  implements OnApplicationBootstrap, OnApplicationShutdown, IDocumentMessagePublisher
{
  private readonly _logger = new Logger(DocumentEventsConsumer.name);
  private readonly _markPartPhotoReady: IMarkPartPhotoReadyCommandHandler;
  private readonly _markPartPhotoFailed: IMarkPartPhotoFailedCommandHandler;
  private readonly _settings: Settings;
  private _connection: ChannelModel | null = null;
  private _reconnect: NodeJS.Timeout | null = null;
  private _deadLetterCheck: NodeJS.Timeout | null = null;
  private _channel: ConfirmChannel | null = null;
  private _isStopping = false;

  public constructor(
    @Inject(MARK_PART_PHOTO_READY_COMMAND_HANDLER) markPartPhotoReady: IMarkPartPhotoReadyCommandHandler,
    @Inject(MARK_PART_PHOTO_FAILED_COMMAND_HANDLER) markPartPhotoFailed: IMarkPartPhotoFailedCommandHandler,
    @Inject(SETTINGS) settings: Settings,
  ) {
    this._markPartPhotoReady = markPartPhotoReady;
    this._markPartPhotoFailed = markPartPhotoFailed;
    this._settings = settings;
  }

  public async onApplicationBootstrap(): Promise<void> {
    await this.connectAsync();
  }

  public async onApplicationShutdown(): Promise<void> {
    this._isStopping = true;
    if (this._reconnect) {
      clearTimeout(this._reconnect);
    }
    if (this._deadLetterCheck) {
      clearInterval(this._deadLetterCheck);
    }
    await this._connection?.close();
  }

  private async connectAsync(): Promise<void> {
    const url = requireSetting(this._settings.rabbitmq, "ConnectionStrings__rabbitmq");
    const connection = await connect(url, { clientProperties: { connection_name: "dealership-api" } });
    connection.on("error", (error: unknown) => this._logger.warn({ err: error }, "RabbitMQ connection error"));
    connection.on("close", () => this.reconnectLater());
    this._connection = connection;
    // Confirmed: a retry is sent to RETRY_QUEUE before the message is acknowledged, so it must be known to be there.
    const channel = await connection.createConfirmChannel();
    this._channel = channel;
    channel.on("error", (error: unknown) => this._logger.warn({ err: error }, "RabbitMQ channel error"));
    // A channel that closes on its own stops the consuming: close the connection too, so it all starts again.
    channel.on("close", () => {
      if (!this._isStopping) {
        void connection.close().catch(() => undefined);
      }
    });
    await this.declareTopologyAsync(channel);
    await channel.prefetch(10);
    await channel.consume(QUEUE, (message) => void this.handleAsync(channel, message));
    this.watchDeadLetters(channel);
    this._logger.log(`Consuming ${QUEUE}`);
  }

  public async publishUnclaimedAsync(documents: DocumentUnclaimedMessageDto[]): Promise<void> {
    const channel = this._channel;
    if (channel === null) {
      throw new Error("RabbitMQ is not connected: the unclaimed documents are sent by a later sweep.");
    }
    for (const data of documents) {
      const envelope = {
        messageId: randomUUID(),
        type: DOCUMENT_UNCLAIMED,
        occurredAt: new Date().toISOString(),
        correlationId: null,
        data,
      };
      channel.publish(EXCHANGE, DOCUMENT_UNCLAIMED, Buffer.from(JSON.stringify(envelope)), {
        contentType: "application/json",
        messageId: envelope.messageId,
        type: DOCUMENT_UNCLAIMED,
        persistent: true,
      });
    }
    await channel.waitForConfirms();
  }

  /**
   * Nothing reads the dead-letter queue on its own: while it holds events, a warning says so once a minute, with the way
   * out (`bun run replay:dead-letters`, after reading why they failed).
   */
  private watchDeadLetters(channel: ConfirmChannel): void {
    if (this._deadLetterCheck) {
      clearInterval(this._deadLetterCheck);
    }
    this._deadLetterCheck = setInterval(() => {
      channel
        .checkQueue(DEAD_LETTER_QUEUE)
        .then(({ messageCount }) => {
          if (messageCount > 0) {
            this._logger.warn(
              `${messageCount} document events are parked in ${DEAD_LETTER_QUEUE}: read why in RabbitMQ's management UI, then replay them with bun run replay:dead-letters`,
            );
          }
        })
        .catch(() => undefined);
    }, DEAD_LETTER_CHECK_MS);
    this._deadLetterCheck.unref();
  }

  private reconnectLater(): void {
    this._connection = null;
    if (this._isStopping || this._reconnect) {
      return;
    }
    this._logger.warn(`RabbitMQ connection closed: connecting again in ${RECONNECT_MS / 1000} seconds`);
    this._reconnect = setTimeout(() => {
      this._reconnect = null;
      this.connectAsync().catch((error: unknown) => {
        this._logger.warn({ err: error }, "RabbitMQ is not back yet");
        this.reconnectLater();
      });
    }, RECONNECT_MS);
  }

  private async declareTopologyAsync(channel: ConfirmChannel): Promise<void> {
    await channel.assertExchange(EXCHANGE, "topic", { durable: true });
    await channel.assertExchange(DEAD_LETTER_EXCHANGE, "topic", { durable: true });
    await channel.assertQueue(DEAD_LETTER_QUEUE, { durable: true });
    await channel.bindQueue(DEAD_LETTER_QUEUE, DEAD_LETTER_EXCHANGE, DOCUMENT_PROCESSED);
    await channel.bindQueue(DEAD_LETTER_QUEUE, DEAD_LETTER_EXCHANGE, DOCUMENT_FAILED);
    // A message that came back from RETRY_QUEUE carries QUEUE's name as its routing key: dead-lettered after its last try,
    // it is routed by that, so the dead-letter queue listens for it too. Without this it would match nothing and be lost.
    await channel.bindQueue(DEAD_LETTER_QUEUE, DEAD_LETTER_EXCHANGE, QUEUE);
    await channel.assertQueue(QUEUE, { durable: true, deadLetterExchange: DEAD_LETTER_EXCHANGE });
    await channel.bindQueue(QUEUE, EXCHANGE, DOCUMENT_PROCESSED);
    await channel.bindQueue(QUEUE, EXCHANGE, DOCUMENT_FAILED);
    // Through the default exchange, which routes by queue name, back to QUEUE once the wait is over.
    await channel.assertQueue(RETRY_QUEUE, {
      durable: true,
      messageTtl: RETRY_DELAY_MS,
      deadLetterExchange: "",
      deadLetterRoutingKey: QUEUE,
    });
  }

  private async handleAsync(channel: ConfirmChannel, message: ConsumeMessage | null): Promise<void> {
    if (!message) {
      return;
    }
    try {
      await this.settleAsync(channel, message);
    } catch (error) {
      // The channel closed under it (a reconnect): the message was never acknowledged, so RabbitMQ delivers it again on
      // the new channel, and the inbox makes the second time harmless. Called with `void`: nothing may escape here.
      this._logger.warn({ err: error }, "Could not acknowledge a document event; it will be delivered again");
    }
  }

  /** Handles the message and acknowledges, retries or dead-letters it. Throws only when the channel is gone. */
  private async settleAsync(channel: ConfirmChannel, message: ConsumeMessage): Promise<void> {
    try {
      const envelope = JSON.parse(message.content.toString("utf8")) as MessageEnvelopeDto<unknown>;
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
      const retries = Number(message.properties.headers?.[RETRIES_HEADER] ?? 0);
      if (!(error instanceof UnhandledMessageError || error instanceof SyntaxError) && retries < MAX_RETRIES) {
        this._logger.warn(
          { err: error, routingKey: message.fields.routingKey, retries },
          "A document event could not be handled; trying it again shortly",
        );
        try {
          channel.sendToQueue(RETRY_QUEUE, message.content, {
            ...message.properties,
            headers: { ...message.properties.headers, [RETRIES_HEADER]: retries + 1 },
          });
          await channel.waitForConfirms();
          channel.ack(message);
          return;
        } catch (retryError) {
          this._logger.error({ err: retryError }, "Could not queue the retry; dead-lettering the event");
        }
      }
      this._logger.error(
        { err: error, routingKey: message.fields.routingKey, retries },
        "Dead-lettering a document event that could not be handled",
      );
      channel.nack(message, false, false);
    }
  }
}
