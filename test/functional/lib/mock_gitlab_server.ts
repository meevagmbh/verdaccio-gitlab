import express from 'express';
import bodyParser from 'body-parser';
import chalk from 'chalk';

import { GITLAB_DATA, CREDENTIALS } from '../config.functional';
import { GITLAB, HTTP_STATUS } from '../../lib/constants';

// GitLab's own defaults for list endpoints.
const DEFAULT_PER_PAGE = 20;
const MAX_PER_PAGE = 100;

type Membership = { access_level: number; parent_id?: number | null };

// A GitLab double for the three endpoints the plugin calls. The list
// endpoints behave like GitLab's: they honour min_access_level and
// top_level_only, and page with per_page and page, announcing further pages
// in the Link and X-Next-Page headers. A double that returned every entry at
// once would let role and paging regressions pass the functional tests.
export default class GitlabServer {
  private app: any;
  private server: any;
  private expectedToken: string;

  public constructor() {
    this.app = express();
    this.expectedToken = CREDENTIALS.password;
  }

  public start(port: number): Promise<any> {
    return new Promise((resolve, reject) => {
      this.app.use(bodyParser.json());
      this.app.use(
        bodyParser.urlencoded({
          extended: true,
        })
      );

      this.app.get('/api/v4/user', (req, res) => {
        this._checkAuthentication(req, res, () => {
          res.send(GITLAB_DATA.testUser);
        });
      });

      this.app.get('/api/v4/groups', (req, res) => {
        this._checkAuthentication(req, res, () => {
          const topLevelOnly = req.query.top_level_only === 'true';
          const groups = GITLAB_DATA.testUserGroups.filter((group) => !topLevelOnly || group.parent_id === null);
          this._sendPage(req, res, groups);
        });
      });

      this.app.get('/api/v4/projects', (req, res) => {
        this._checkAuthentication(req, res, () => {
          this._sendPage(req, res, GITLAB_DATA.testUserProjects);
        });
      });

      // Express 5 passes listen errors (such as EADDRINUSE) to this callback
      // instead of throwing them.
      this.server = this.app.listen(port, (error) => {
        if (error) {
          reject(error);
          return;
        }
        console.log(chalk.blue(`gitlab mock listening on port: ${this.server.address().port}`));
        resolve(this);
      });
      console.log(chalk.blue(`Running gitlab mock server via express`));
    });
  }

  // Sends one page of the entries the user reaches with at least
  // min_access_level, without the role field GitLab does not return.
  private _sendPage(req: any, res: any, entries: Membership[]) {
    const minAccessLevel = Number(req.query.min_access_level || 0);
    const perPage = Math.min(Number(req.query.per_page) || DEFAULT_PER_PAGE, MAX_PER_PAGE);
    const page = Math.max(Number(req.query.page) || 1, 1);

    const reachable = entries.filter((entry) => entry.access_level >= minAccessLevel);
    const pageEntries = reachable.slice((page - 1) * perPage, page * perPage).map(({ access_level: _role, ...entry }) => entry);

    if (page * perPage < reachable.length) {
      const next = new URL(`${req.protocol}://${req.get('host')}${req.originalUrl}`);
      next.searchParams.set('page', String(page + 1));
      res.set('Link', `<${next.toString()}>; rel="next"`);
      res.set('X-Next-Page', String(page + 1));
    }
    res.set('X-Page', String(page));
    res.set('X-Per-Page', String(perPage));
    res.set('X-Total', String(reachable.length));
    res.send(pageEntries);
  }

  private _checkAuthentication(req: any, res: any, cb: any) {
    if (req.get('private-token') === this.expectedToken) {
      cb();
    } else {
      res.status(HTTP_STATUS.UNAUTHORIZED).send(GITLAB.UNAUTHENTICATED);
    }
  }
}
