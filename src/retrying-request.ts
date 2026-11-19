// Request handler for the GitLab client.
//
// GitLab answers 429 (rate limited) and 502 (bad gateway) for transient
// trouble. @gitbeaker/rest retries those ten times with exponential backoff,
// about 256 s in all, and that is not configurable. Concurrent logins share
// one walk, so every waiting login would sit out the whole backoff. This
// handler retries only while the backoff fits into a short window and then
// gives up, so a login fails within seconds instead of minutes.

export const RETRY_STATUSES = [429, 502];

export interface RetryOptions {
  // Upper bound for the summed delays between attempts.
  retryWindowMs: number;
  // Delay before the first retry; it doubles for each further retry.
  baseDelayMs: number;
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = { retryWindowMs: 5000, baseDelayMs: 250 };

export interface FormattedResponse {
  body: any;
  headers: Record<string, string>;
  status: number;
}

type FetchFn = (request: Request) => Promise<Response>;

// The delays between attempts: doubling from baseDelayMs while their sum
// stays within retryWindowMs.
export function retryDelays({ retryWindowMs, baseDelayMs }: RetryOptions): number[] {
  const delays: number[] = [];
  let total = 0;
  for (let delay = baseDelayMs; delay > 0 && total + delay <= retryWindowMs; delay *= 2) {
    delays.push(delay);
    total += delay;
  }
  return delays;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function parseBody(response: Response): Promise<any> {
  if (response.status === 204) {
    return null;
  }
  const contentType = (response.headers.get('content-type') || '').split(';')[0].trim();
  if (contentType === 'application/json') {
    return (await response.json()) || {};
  }
  if (contentType.startsWith('text/')) {
    return (await response.text()) || '';
  }
  return response.blob();
}

async function requestError(request: Request, response: Response): Promise<Error> {
  const content = await response.text();
  let description = content;
  if ((response.headers.get('content-type') || '').includes('application/json')) {
    try {
      const output = JSON.parse(content);
      const message = output?.error || output?.message || '';
      description = typeof message === 'string' ? message : JSON.stringify(message);
    } catch {
      // keep the raw body as the description
    }
  }
  return new Error(description || `${response.status} ${response.statusText}`, { cause: { description, request, response } });
}

export function createRetryingRequestHandler(options: RetryOptions = DEFAULT_RETRY_OPTIONS, fetchFn: FetchFn = request => fetch(request)) {
  const delays = retryDelays(options);

  return async function retryingRequestHandler(endpoint: string, requestOptions: Record<string, any> = {}): Promise<FormattedResponse> {
    // rateLimiters, agent and asStream are client features the plugin does not use.
    const { rateLimiters, agent, asStream, prefixUrl, searchParams, ...init } = requestOptions;

    const baseUrl = prefixUrl && !prefixUrl.endsWith('/') ? `${prefixUrl}/` : prefixUrl;
    const url = new URL(endpoint, baseUrl);
    url.search = searchParams || '';
    // Never follow redirects: one would carry the PRIVATE-TOKEN header to
    // whatever host the Location header names.
    const baseRequest = new Request(url, { ...init, redirect: 'manual' });

    for (let attempt = 0; ; attempt += 1) {
      const request = baseRequest.clone();
      const response = await fetchFn(request).catch(error => {
        if (error.name === 'TimeoutError' || error.name === 'AbortError') {
          throw new Error('Query timeout was reached', { cause: error });
        }
        throw error;
      });

      if (response.ok) {
        return { body: await parseBody(response), headers: Object.fromEntries(response.headers.entries()), status: response.status };
      }
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location') || 'an unknown location';
        throw new Error(
          `GitLab answered ${response.status} redirect to ${location}; redirects are not followed, so set auth.gitlab.url to the final address`
        );
      }
      if (!RETRY_STATUSES.includes(response.status)) {
        throw await requestError(request, response);
      }
      if (attempt >= delays.length) {
        throw new Error(`GitLab answered ${response.status} to ${attempt + 1} attempts within the ${options.retryWindowMs} ms retry window`);
      }
      await sleep(delays[attempt]);
    }
  };
}
