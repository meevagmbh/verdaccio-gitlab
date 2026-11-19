// Manual mock for `@gitbeaker/requester-utils`, which ships as ESM only and
// cannot be required by Jest. The plugin only needs createRequesterFn from it;
// the request handler it wraps is tested on its own.
function createRequesterFn(optionsHandler, requestHandler) {
  return function requesterFn() {
    return { optionsHandler, requestHandler };
  };
}

module.exports = { createRequesterFn };
