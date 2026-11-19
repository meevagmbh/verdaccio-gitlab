import { CREDENTIALS, PACKAGE } from '../config.functional';
import { API_ERROR, HTTP_STATUS } from '../../lib/constants';

export default (server: any, _gitlab: any) => {
  describe('package access tests', () => {
    beforeEach(() => {
      return server.auth(CREDENTIALS.user, CREDENTIALS.password);
    });

    test('should allow access to an existing proxied package', () => {
      return server
        .getPackage(PACKAGE.EXISTING_NAME)
        .status(HTTP_STATUS.OK)
        .then(body => {
          expect(body).toHaveProperty('name');
          expect(body.name).toBe(PACKAGE.EXISTING_NAME);
        });
    });

    // 404 shows the read check passed and the package is just missing.
    test('should allow a group member to read a private package of the group', () => {
      return server.getPackage(PACKAGE.MEMBER_SCOPED_MISSING_NAME).status(HTTP_STATUS.NOT_FOUND);
    });

    test('should deny reading a private package of a group the user is not a member of', () => {
      return server
        .getPackage(PACKAGE.FOREIGN_SCOPED_NAME)
        .status(HTTP_STATUS.FORBIDDEN)
        .then(body => {
          expect(body.error).toMatch(/permissions/);
        });
    });

    test('should fail with non-existing package', () => {
      return server
        .getPackage(PACKAGE.NON_EXISTING_NAME)
        .status(HTTP_STATUS.NOT_FOUND)
        .body_error(API_ERROR.NO_PACKAGE)
        .then(body => {
          expect(body).toHaveProperty('error');
          expect(body.error).toMatch(/no/);
        });
    });
  });
};
