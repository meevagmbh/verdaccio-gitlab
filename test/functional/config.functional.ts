import { DOMAIN_SERVERS as localhost } from '../test.conf';

export const CREDENTIALS = {
  user: 'test',
  password: 'test',
  email: 'test@example.com',
};

export const WRONG_CREDENTIALS = {
  user: 'non_existing_user',
  password: 'wrong_password',
};

export const TARBALL = 'tarball-blahblah-file.name';
// Only the tarball urls in package fixtures use this port; the registry
// itself listens on a free port that global-setup.ts picks for each run.
export const PORT_SERVER_1 = '55551';

export const DOMAIN_SERVERS = localhost;

export const PACKAGE = {
  EXISTING_NAME: 'verdaccio',
  NON_EXISTING_NAME: 'non-existing-package',
  NAME: 'test-name',
  GROUP_NAME: 'test-group',
  SCOPED_GROUP_NAME: '@test-group/another-project',
  SCOPED_PROJECT_NAME: '@another-group/test-project',
  MEMBER_SCOPED_MISSING_NAME: '@test-group/not-published',
  FOREIGN_SCOPED_NAME: '@foreign-group/some-package',
  OPEN_SCOPED_NAME: '@open/some-package',
  // The user is only a reporter in this group: enough to read, not to publish.
  READ_ONLY_SCOPED_NAME: '@read-group/some-package',
  VERSION: '0.0.1',
};

// GitLab access levels, as the API reports them.
export const ACCESS_LEVEL = { REPORTER: 20, MAINTAINER: 40 };

// More projects than fit on one page of the plugin's queries (100), so a
// project at the end of the list is only found by following the pages.
const FILLER_PROJECT_COUNT = 120;

// Description of the package the local uplink stub serves.
export const UPLINK_STUB_DESCRIPTION = 'served by the functional test uplink stub';

export const GITLAB_DATA = {
  testUser: {
    id: 1,
    username: CREDENTIALS.user,
    email: CREDENTIALS.email,
    name: 'Test User',
    state: 'active',
  },
  // The groups and projects the test user is a member of, with the user's
  // role in each. The GitLab double filters them by min_access_level.
  testUserGroups: [
    { id: 1, name: 'Test Group', path: 'test-group', full_path: 'test-group', parent_id: null, access_level: ACCESS_LEVEL.MAINTAINER },
    { id: 4, name: 'Read Group', path: 'read-group', full_path: 'read-group', parent_id: null, access_level: ACCESS_LEVEL.REPORTER },
  ],
  testUserProjects: [
    ...Array.from({ length: FILLER_PROJECT_COUNT }, (_, i) => ({
      id: 100 + i,
      path_with_namespace: `filler-group/project-${i}`,
      access_level: ACCESS_LEVEL.MAINTAINER,
    })),
    // Last, so only a walk over every page grants `@another-group/test-project`.
    { id: 3, path_with_namespace: 'another-group/test-project', access_level: ACCESS_LEVEL.MAINTAINER },
  ],
};
