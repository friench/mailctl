export class MailApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body: unknown,
  ) {
    super(message);
    this.name = 'MailApiError';
  }
}

export interface MailApiClientOptions {
  baseUrl: string;
  apiKey: string;
}

/** Thin REST client for mail-api, authenticated with an X-Api-Key. */
export class MailApiClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(opts: MailApiClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.apiKey = opts.apiKey;
  }

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': this.apiKey },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (res.status === 204) return { ok: true };

    const raw = await res.text();
    let data: unknown = undefined;
    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch {
        data = raw;
      }
    }

    if (!res.ok) {
      const message =
        data && typeof data === 'object' && data !== null && 'error' in data
          ? String((data as { error: unknown }).error)
          : `Request failed with HTTP ${res.status}`;
      throw new MailApiError(res.status, message, data);
    }
    return data;
  }

  get(path: string): Promise<unknown> {
    return this.request('GET', path);
  }
  post(path: string, body?: unknown): Promise<unknown> {
    return this.request('POST', path, body);
  }
  patch(path: string, body?: unknown): Promise<unknown> {
    return this.request('PATCH', path, body);
  }
  delete(path: string): Promise<unknown> {
    return this.request('DELETE', path);
  }
}

/** URL-encode a path segment (e.g. an id or key). */
export function seg(value: string): string {
  return encodeURIComponent(value);
}
