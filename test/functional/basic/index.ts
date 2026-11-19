// @flow

import whoAmI from './whoami';
import ping from './ping';

export default (server: any, _gitlab: any) => {
  describe('basic test endpoints', () => {
    whoAmI(server);
    ping(server);
  });
};
