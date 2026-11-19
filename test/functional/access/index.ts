import { CREDENTIALS, PACKAGE, UPLINK_STUB_DESCRIPTION } from '../config.functional';
import { API_ERROR, HTTP_STATUS } from '../../lib/constants';
import fixturePkg from '../fixtures/package';

export default (server: any, _gitlab: any) => {
  describe('package access tests', () => {
    beforeEach(() => {
      return server.auth(CREDENTIALS.user, CREDENTIALS.password);
    });

    test('should allow access to an existing proxied package', () => {
      return server
        .getPackage(PACKAGE.EXISTING_NAME)
        .status(HTTP_STATUS.OK)
        .then((body) => {
          expect(body).toHaveProperty('name');
          expect(body.name).toBe(PACKAGE.EXISTING_NAME);
          // Served by the local uplink stub, not by registry.npmjs.org.
          const latest = body['dist-tags'].latest;
          expect(body.versions[latest].description).toBe(UPLINK_STUB_DESCRIPTION);
        });
    });

    // A reporter role is below auth.gitlab.publish ($maintainer) but meets
    // auth.gitlab.access ($reporter); 404 shows the read check passed.
    test('should allow a reporter of a group to read its private packages', () => {
      return server.getPackage(PACKAGE.READ_ONLY_SCOPED_NAME).status(HTTP_STATUS.NOT_FOUND);
    });

    // 404 shows the read check passed and the package is just missing.
    test('should allow a group member to read a private package of the group', () => {
      return server.getPackage(PACKAGE.MEMBER_SCOPED_MISSING_NAME).status(HTTP_STATUS.NOT_FOUND);
    });

    test('should deny reading a private package of a group the user is not a member of', () => {
      return server
        .getPackage(PACKAGE.FOREIGN_SCOPED_NAME)
        .status(HTTP_STATUS.FORBIDDEN)
        .then((body) => {
          expect(body.error).toMatch(/permissions/);
        });
    });

    test('should allow any logged-in user to read a section without gitlab: true', () => {
      return server.getPackage(PACKAGE.OPEN_SCOPED_NAME).status(HTTP_STATUS.NOT_FOUND);
    });

    test('should deny publishing to a section without publish', () => {
      return server.putPackage(PACKAGE.OPEN_SCOPED_NAME, fixturePkg(PACKAGE.OPEN_SCOPED_NAME)).status(HTTP_STATUS.FORBIDDEN);
    });

    test('should fail with non-existing package', () => {
      return server
        .getPackage(PACKAGE.NON_EXISTING_NAME)
        .status(HTTP_STATUS.NOT_FOUND)
        .body_error(API_ERROR.NO_PACKAGE)
        .then((body) => {
          expect(body).toHaveProperty('error');
          expect(body.error).toMatch(/no/);
        });
    });
  });
};
