import { createRequesterFn } from '@gitbeaker/requester-utils';

import { createRetryingRequestHandler } from './retrying-request';

// The GitLab client's requester with the plugin's own request handler, which
// keeps retries of 429 and 502 within a short window. The options handler
// passes the client's prepared request options through unchanged, as the
// client's own requester does.
export const requesterFn = createRequesterFn((_serviceOptions, requestOptions) => Promise.resolve(requestOptions), createRetryingRequestHandler());
