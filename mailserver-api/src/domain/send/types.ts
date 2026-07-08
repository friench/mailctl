export interface SendResult {
  messageId: string;
  account: string;
}

/**
 * A send failure the SMTP server reported as permanent (5xx) — e.g. unknown
 * recipient, policy reject, message too big. Retrying or failing over won't
 * help, so the queue dead-letters the job immediately instead of burning the
 * full retry/backoff budget. Carries the underlying error as `cause`.
 */
export class PermanentSendError extends Error {
  constructor(cause: Error) {
    super(cause.message, { cause });
    this.name = 'PermanentSendError';
  }
}
