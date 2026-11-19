import assert from 'assert';

import _ from 'lodash';

import { IRequestPromise } from '../types';

const requestData = Symbol('smart_request_data');

function injectResponse(smartObject: any, promise: Promise<any>): Promise<any> {
  promise[requestData] = smartObject[requestData];
  return promise;
}

export class PromiseAssert extends Promise<any> implements IRequestPromise {
  public constructor(options: any) {
    super(options);
  }

  public status(expected: number) {
    const selfData = this[requestData];

    return injectResponse(
      this,
      this.then(function(body) {
        try {
          assert.equal(selfData.response.statusCode, expected);
        } catch (err) {
          selfData.error.message = err.message;
          throw selfData.error;
        }
        return body;
      })
    );
  }

  public body_ok(expected: any) {
    const selfData = this[requestData];

    return injectResponse(
      this,
      this.then(function(body) {
        try {
          if (_.isRegExp(expected)) {
            assert(body.ok.match(expected), "'" + body.ok + "' doesn't match " + expected);
          } else {
            assert.equal(body.ok, expected);
          }
          assert.equal(body.error, null);
        } catch (err) {
          selfData.error.message = err.message;
          throw selfData.error;
        }

        return body;
      })
    );
  }

  public body_error(expected: any) {
    const selfData = this[requestData];

    return injectResponse(
      this,
      this.then(function(body) {
        try {
          if (_.isRegExp(expected)) {
            assert(body.error.match(expected), body.error + " doesn't match " + expected);
          } else {
            assert.equal(body.error, expected);
          }
          assert.equal(body.ok, null);
        } catch (err) {
          selfData.error.message = err.message;
          throw selfData.error;
        }
        return body;
      })
    );
  }

  public response(cb: any) {
    const selfData = this[requestData];

    return injectResponse(
      this,
      this.then(function(body) {
        cb(selfData.response);
        return body;
      })
    );
  }

  public send(data: any) {
    this[requestData].body = data;
    return this;
  }
}

function hasHeader(headers: Record<string, any>, name: string): boolean {
  return Object.keys(headers).some(key => key.toLowerCase() === name);
}

// Mirrors what the request package did with the options this suite passes:
// a `json` object becomes the JSON body, `json: true` parses the response
// body as JSON when it can, and `encoding: null` keeps the body a Buffer.
async function performRequest(options: any, state: any): Promise<any> {
  const headers = { ...options.headers };
  let body = state.body;

  if (_.isNil(body) && _.isPlainObject(options.json)) {
    body = JSON.stringify(options.json);
    if (!hasHeader(headers, 'content-type')) {
      headers['content-type'] = 'application/json';
    }
  }

  const res = await fetch(options.url, { method: options.method, headers, body });
  const raw = Buffer.from(await res.arrayBuffer());

  // store the response on symbol, in the shape the assertions read
  state.response = { statusCode: res.status, headers: Object.fromEntries(res.headers) };

  if (options.json) {
    try {
      return JSON.parse(raw.toString('utf8'));
    } catch {
      // not JSON: fall through and return the raw body, as request did
    }
  }

  return options.encoding === null ? raw : raw.toString(options.encoding || 'utf8');
}

function smartRequest(options: any): Promise<any> {
  const smartObject: any = {};

  smartObject[requestData] = {};
  smartObject[requestData].error = Error();
  Error.captureStackTrace(smartObject[requestData].error, smartRequest);

  const promiseResult: Promise<any> = new PromiseAssert(function(resolve, reject) {
    // Start on the next microtask, so a chained .send(data) can still set the body.
    queueMicrotask(() => {
      performRequest(options, smartObject[requestData]).then(resolve, reject);
    });
  });

  return injectResponse(smartObject, promiseResult);
}

export default smartRequest;
