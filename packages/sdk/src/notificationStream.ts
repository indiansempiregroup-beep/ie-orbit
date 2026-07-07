export type NotificationStreamEvent = {
  type: string;
  data: Record<string, unknown>;
};

export type NotificationStreamConfig = {
  url: string;
  headers?: HeadersInit;
  signal?: AbortSignal;
  onEvent: (event: NotificationStreamEvent) => void;
};

function parseSseBlock(block: string): NotificationStreamEvent | null {
  let eventType = 'message';
  let data = '';

  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) {
      eventType = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      data += line.slice(5).trim();
    }
  }

  if (!data) {
    return null;
  }

  try {
    const parsed = JSON.parse(data) as { type?: string; data?: Record<string, unknown> };
    return {
      type: parsed.type || eventType,
      data: parsed.data ?? (parsed as Record<string, unknown>),
    };
  } catch {
    return { type: eventType, data: { raw: data } };
  }
}

export async function consumeNotificationStream(config: NotificationStreamConfig): Promise<void> {
  const response = await fetch(config.url, {
    method: 'GET',
    headers: {
      Accept: 'text/event-stream',
      ...config.headers,
    },
    signal: config.signal,
  });

  if (!response.ok) {
    throw new Error(`Notification stream failed (${response.status})`);
  }
  if (!response.body) {
    throw new Error('Notification stream has no body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      if (!part.trim() || part.trimStart().startsWith(':')) {
        continue;
      }
      const event = parseSseBlock(part);
      if (event) {
        config.onEvent(event);
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export type NotificationStreamSubscription = {
  close: () => void;
};

export function subscribeToNotificationStream(
  config: Omit<NotificationStreamConfig, 'signal'> & {
    onError?: (error: unknown) => void;
  },
): NotificationStreamSubscription {
  const controller = new AbortController();
  let closed = false;
  let retryMs = 1000;

  void (async () => {
    while (!closed) {
      try {
        await consumeNotificationStream({
          ...config,
          signal: controller.signal,
        });
        if (closed) {
          return;
        }
        retryMs = 1000;
      } catch (error) {
        if (closed || controller.signal.aborted) {
          return;
        }
        config.onError?.(error);
        await sleep(retryMs);
        retryMs = Math.min(retryMs * 2, 30000);
      }
    }
  })();

  return {
    close: () => {
      closed = true;
      controller.abort();
    },
  };
}
