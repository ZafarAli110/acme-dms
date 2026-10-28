import {Column, Entity, PrimaryColumn} from 'typeorm';
import {INSTANT_COLUMN} from '../transformers/temporal.transformers';

/** Messages already handled. Lets the consumers ignore a redelivered message (the inbox pattern). */
@Entity('processed_messages')
export class ProcessedMessage {
  @PrimaryColumn('uuid')
  public messageId: string;

  @Column('timestamptz', {transformer: INSTANT_COLUMN})
  public processedAt: Temporal.Instant;
}
