// Sends the document events parked in dealership-api's dead-letter queue back to its queue, each with its retries reset,
// once whatever made them fail is fixed. Read why they failed first, in RabbitMQ's management UI.
//
//   RABBITMQ_URL=amqp://guest:password@localhost:5672 bun run replay:dead-letters        (macOS, Linux)
//   $env:RABBITMQ_URL = "amqp://guest:password@localhost:5672"; bun run replay:dead-letters   (Windows PowerShell)
//
// The address is the `rabbitmq` resource's connection string in the Aspire dashboard.
import { connect } from "amqplib";
import { DEAD_LETTER_QUEUE, QUEUE, RETRIES_HEADER } from "../src/service/consumers/document-events.queues";

const url = process.env["RABBITMQ_URL"];
if (!url) {
  console.error("Set RABBITMQ_URL to the broker's amqp:// address (the rabbitmq resource in the Aspire dashboard).");
  process.exit(1);
}

const connection = await connect(url);
const channel = await connection.createConfirmChannel();
let replayed = 0;
for (;;) {
  const message = await channel.get(DEAD_LETTER_QUEUE, { noAck: false });
  if (message === false) {
    break;
  }
  // A fresh start: no retries counted, and no record of the dead-lettering.
  const headers = Object.fromEntries(
    Object.entries(message.properties.headers ?? {}).filter(([name]) => name !== RETRIES_HEADER && name !== "x-death"),
  );
  channel.sendToQueue(QUEUE, message.content, { ...message.properties, headers });
  await channel.waitForConfirms();
  channel.ack(message);
  replayed++;
}
console.log(`Replayed ${replayed} document events from ${DEAD_LETTER_QUEUE} to ${QUEUE}.`);
await channel.close();
await connection.close();
