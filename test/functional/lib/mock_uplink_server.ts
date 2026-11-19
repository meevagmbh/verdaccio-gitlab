import express from 'express';
import chalk from 'chalk';

import { PACKAGE, UPLINK_STUB_DESCRIPTION } from '../config.functional';

// Stands in for registry.npmjs.org as verdaccio's uplink. The functional
// tests then neither depend on the public registry being reachable nor on
// what it currently serves. It knows one package; anything else is a 404.
export default class UplinkServer {
  private app: any;
  public server: any;

  public constructor() {
    this.app = express();
  }

  public start(port: number): Promise<UplinkServer> {
    return new Promise((resolve, reject) => {
      this.app.get('/:name', (req, res) => {
        if (req.params.name !== PACKAGE.EXISTING_NAME) {
          res.status(404).send({ error: 'not found' });
          return;
        }
        const version = '1.0.0';
        const base = `${req.protocol}://${req.get('host')}`;
        res.send({
          name: PACKAGE.EXISTING_NAME,
          description: UPLINK_STUB_DESCRIPTION,
          'dist-tags': { latest: version },
          versions: {
            [version]: {
              name: PACKAGE.EXISTING_NAME,
              version,
              description: UPLINK_STUB_DESCRIPTION,
              dist: {
                shasum: '0000000000000000000000000000000000000000',
                tarball: `${base}/${PACKAGE.EXISTING_NAME}/-/${PACKAGE.EXISTING_NAME}-${version}.tgz`,
              },
            },
          },
        });
      });

      this.server = this.app.listen(port, (error) => {
        if (error) {
          reject(error);
          return;
        }
        console.log(chalk.blue(`uplink stub listening on port: ${this.server.address().port}`));
        resolve(this);
      });
    });
  }
}
