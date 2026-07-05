import type { QuarantineBoxDTO, QuarantineMessageDTO } from '../../contracts';
import type { JunkMessage } from '../mailboxes/dms-client';
import type { QuarantineBox } from './service';

export function serializeQuarantineMessage(msg: JunkMessage): QuarantineMessageDTO {
  return {
    uid: msg.uid,
    from: msg.from,
    subject: msg.subject,
    date: msg.date,
    sizeBytes: msg.sizeBytes,
    score: msg.score,
  };
}

export function serializeQuarantineBox(box: QuarantineBox): QuarantineBoxDTO {
  return {
    mailboxId: box.mailboxId,
    address: box.address,
    messages: box.messages.map(serializeQuarantineMessage),
  };
}
