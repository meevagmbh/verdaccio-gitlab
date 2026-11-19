import { createRetryingRequestHandler, DEFAULT_RETRY_OPTIONS, retryDelays } from '../../src/retrying-request';

// GitLab answers 429 and 502 for transient trouble. Concurrent logins share
// one walk, so every one of them waits for as long as its retries run: the
// retries must stay inside a short window and give up after it.

function respond(status: number, body: unknown = {}, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

function fakeFetch(...responses: Response[]) {
  const requests: Request[] = [];
  const fetchFn = jest.fn((request: Request) => {
    requests.push(request);
    const next = responses.length > 1 ? responses.shift()! : responses[0];
    return Promise.resolve(next.clone());
  });
  return { fetchFn, requests };
}

const fastRetries = { retryWindowMs: 15, baseDelayMs: 1 };

describe('retrying request handler', () => {
  test('the default retry delays add up to no more than 5 seconds', () => {
    const delays = retryDelays(DEFAULT_RETRY_OPTIONS);

    expect(delays).toEqual([250, 500, 1000, 2000]);
    expect(delays.reduce((sum, delay) => sum + delay, 0)).toBeLessThanOrEqual(5000);
  });

  test('a successful response is returned with body, headers and status', async () => {
    const { fetchFn, requests } = fakeFetch(respond(200, [{ path: 'g' }], { link: '<https://x/next>; rel="next"' }));
    const handler = createRetryingRequestHandler(fastRetries, fetchFn);

    const response = await handler('groups', {
      prefixUrl: 'https://gitlab.example.com/api/v4',
      searchParams: 'min_access_level=40&per_page=100',
      method: 'GET',
      headers: { 'private-token': 'secret' },
    });

    expect(response).toEqual({
      body: [{ path: 'g' }],
      headers: expect.objectContaining({ link: '<https://x/next>; rel="next"' }),
      status: 200,
    });
    expect(requests[0].url).toBe('https://gitlab.example.com/api/v4/groups?min_access_level=40&per_page=100');
    expect(requests[0].headers.get('private-token')).toBe('secret');
  });

  test('a 502 followed by a success is retried once', async () => {
    const { fetchFn } = fakeFetch(respond(502), respond(200, { username: 'u' }));
    const handler = createRetryingRequestHandler(fastRetries, fetchFn);

    const response = await handler('user', { prefixUrl: 'https://gitlab.example.com/api/v4', method: 'GET' });

    expect(response.body).toEqual({ username: 'u' });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  test('a lasting 429 gives up once the next delay would leave the retry window', async () => {
    const { fetchFn } = fakeFetch(respond(429));
    const handler = createRetryingRequestHandler(fastRetries, fetchFn);

    await expect(handler('user', { prefixUrl: 'https://gitlab.example.com/api/v4', method: 'GET' })).rejects.toThrow(/429/);
    // delays 1 + 2 + 4 + 8 = 15 ms fit into the window; the next (16) does not
    expect(fetchFn).toHaveBeenCalledTimes(5);
  });

  test('other error statuses are not retried and carry the GitLab message', async () => {
    const { fetchFn } = fakeFetch(respond(401, { message: '401 Unauthorized' }));
    const handler = createRetryingRequestHandler(fastRetries, fetchFn);

    await expect(handler('user', { prefixUrl: 'https://gitlab.example.com/api/v4', method: 'GET' })).rejects.toThrow('401 Unauthorized');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
