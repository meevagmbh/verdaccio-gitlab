// Manual mock for the `@gitbeaker/rest` library.
//
// The API calls are shared jest.fn() instances rather than fresh closures per
// resource instance, so tests can assert how many requests a single
// authenticate() actually makes. They are exposed as `__calls`, together with
// the options each resource was constructed with.
//
// `Users.showCurrentUser` honours the token: previously it resolved
// unconditionally, which meant a wrong password authenticated successfully.
// The two "should fail authentication" tests only passed because the assertion
// threw inside the plugin's promise chain and its own .catch re-invoked the
// callback with an error.
const VALID_USER = 'myUser';
const VALID_TOKEN = 'myPass';
// A valid token of another GitLab user.
const OTHER_USER = 'otherUser';
const OTHER_TOKEN = 'otherUsersPass';

// Rejects like the plugin's request handler does: GitLab's answer is on
// error.cause.response.
function gitlabError(status, message) {
  return new Error(message, { cause: { response: { status } } });
}

const usersCurrent = jest.fn(token => {
  if (token === OTHER_TOKEN) {
    return Promise.resolve({ username: OTHER_USER });
  }
  if (token !== VALID_TOKEN) {
    return Promise.reject(gitlabError(401, '401 Unauthorized'));
  }

  return Promise.resolve({ username: VALID_USER });
});

// The user is maintainer (40) of myGroup and anotherGroup/myProject, and
// reporter (20) of readGroup and readGroup/readProject.
const MAINTAINER = 40;

function atLeast(params, level) {
  return ((params || {}).minAccessLevel || 0) <= level;
}

const groupsAll = jest.fn(params =>
  Promise.resolve([
    { path: 'myGroup', full_path: 'myGroup' },
    ...(atLeast(params, 20) ? [{ path: 'readGroup', full_path: 'readGroup' }] : []),
  ])
);

const projectsAll = jest.fn(params =>
  Promise.resolve([
    { path_with_namespace: 'anotherGroup/myProject' },
    ...(atLeast(params, 20) ? [{ path_with_namespace: 'readGroup/readProject' }] : []),
  ])
);

// Records the options each resource is created with, keyed by resource name.
const constructed = jest.fn();

function tokenOf(options) {
  return (options || {}).token;
}

class Users {
  constructor(options) {
    constructed('Users', options);
    this.token = tokenOf(options);
  }

  showCurrentUser() {
    return usersCurrent(this.token);
  }
}

class Groups {
  constructor(options) {
    constructed('Groups', options);
  }

  all(params) {
    return groupsAll(params);
  }
}

class Projects {
  constructor(options) {
    constructed('Projects', options);
  }

  all(params) {
    return projectsAll(params);
  }
}

const __calls = { usersCurrent, groupsAll, projectsAll, constructed, gitlabError, OTHER_TOKEN, MAINTAINER };

module.exports = { Users, Groups, Projects, __calls };
