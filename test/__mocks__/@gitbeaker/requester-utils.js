// Manual mock for `@gitbeaker/requester-utils`. The plugin only needs
// createRequesterFn from it; the request handler it wraps is tested on its own.
function createRequesterFn(optionsHandler, requestHandler) {
  return function requesterFn() {
    return { optionsHandler, requestHandler };
  };
}

export { createRequesterFn };
