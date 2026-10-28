import {describe, expect, it, vi} from 'vitest';
import {SYSTEM_USER_ID} from '#business-logic-abstractions/user-context/system-user';
import {TEST_NOW, fixedClock} from '#business-logic/time/__test__/fixed-clock';
import {UnhandledMessageError} from '#business-logic-abstractions/messaging/unhandled-message.error';
import type {DocumentProcessedMessageDto, MessageEnvelopeDto} from '#dto/messages/document-messages.dto';
import type {IPartPhotoRepository} from '#persistence/repositories/part-photo.repository.interface';
import {MarkPartPhotoReadyCommandHandler} from '../mark-part-photo-ready.command-handler';

function message(ownerType: string): MessageEnvelopeDto<DocumentProcessedMessageDto> {
  return {
    messageId: 'm1',
    type: 'document.processed.v1',
    occurredAt: '2026-10-28T00:00:00Z',
    correlationId: null,
    data: {documentId: 'doc-1', dealerId: 'northwind', ownerType, ownerId: 'p1', variants: []},
  };
}

describe('MarkPartPhotoReadyCommandHandler', () => {
  it('marks the part photo ready, once per message, as changed by the system', async () => {
    const photos = {updateStatusOnceAsync: vi.fn().mockResolvedValue(true)} as unknown as IPartPhotoRepository;

    await new MarkPartPhotoReadyCommandHandler(photos, fixedClock()).executeAsync(message('part'));

    expect(photos.updateStatusOnceAsync).toHaveBeenCalledWith('m1', 'northwind', 'doc-1', 'ready', null, {
      at: TEST_NOW,
      by: SYSTEM_USER_ID,
    });
  });

  it('refuses documents it does not own, so they are dead-lettered', async () => {
    const photos = {updateStatusOnceAsync: vi.fn()} as unknown as IPartPhotoRepository;

    await expect(
      new MarkPartPhotoReadyCommandHandler(photos, fixedClock()).executeAsync(message('user')),
    ).rejects.toThrow(UnhandledMessageError);
    expect(photos.updateStatusOnceAsync).not.toHaveBeenCalled();
  });
});
