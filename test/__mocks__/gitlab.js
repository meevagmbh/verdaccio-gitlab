// Manual mock for the `gitlab` library.
//
// The API calls are shared jest.fn() instances rather than fresh closures per
// `new Gitlab()`, so tests can assert how many requests a single
// authenticate() actually makes. They are exposed as `Gitlab.__calls`.
//
// `Users.current` honours the token: previously it resolved unconditionally,
// which meant a wrong password authenticated successfully. The two "should
// fail authentication" tests only passed because the assertion threw inside
// the plugin's promise chain and its own .catch re-invoked the callback with
// an error.
const VALID_USER = 'myUser';
const VALID_TOKEN = 'myPass';

const usersCurrent = jest.fn(token => {
  if (token !== VALID_TOKEN) {
    return Promise.reject(new Error('401 - {"message":"401 Unauthorized"}'));
  }

  return Promise.resolve({ username: VALID_USER });
});

const groupsAll = jest.fn(() =>
  Promise.resolve([
    {
      path: 'myGroup',
      full_path: 'myGroup',
    },
  ])
);

const projectsAll = jest.fn(() =>
  Promise.resolve([
    {
      path_with_namespace: 'anotherGroup/myProject',
    },
  ])
);

const mock = jest.fn().mockImplementation((options) => {
  const token = (options || {}).token;

  return {
    Users: {
      current: () => usersCurrent(token),
    },
    Groups: {
      all: params => groupsAll(params),
    },
    Projects: {
      all: params => projectsAll(params),
    },
  };
});

mock.__calls = { usersCurrent, groupsAll, projectsAll };

export default mock;
