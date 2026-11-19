import path from 'path';

import { yellow, green, blue, magenta } from 'kleur/colors';

import { VerdaccioConfig } from '../lib/verdaccio-server';
import VerdaccioProcess from '../lib/server_process';
import Server from '../lib/server';

import { PORT_GITLAB_EXPRESS_MOCK, DOMAIN_SERVERS, PORT_SERVER_1 } from './config.functional';
import GitlabServer from './lib/mock_gitlab_server';

// Starts the GitLab mock and verdaccio once for the whole run, and returns
// the teardown that stops them again.
export default async function setup() {
  const SILENCE_LOG = !process.env.VERDACCIO_DEBUG;
  // @ts-ignore
  const DEBUG_INJECT: boolean = process.env.VERDACCIO_DEBUG_INJECT ? process.env.VERDACCIO_DEBUG_INJECT : false;
  const forkList: any[] = [];
  const pathStore = path.join(__dirname, 'store');
  const listServers = [
    {
      port: PORT_SERVER_1,
      config: '/config-1.yaml',
      storage: '/test-storage1',
    },
  ];
  console.log(blue('setup: starting servers'));
  console.log(green('Setup Verdaccio Servers'));

  const gitlab: any = await new GitlabServer().start(PORT_GITLAB_EXPRESS_MOCK);

  for (const config of listServers) {
    const verdaccioConfig = new VerdaccioConfig(
      path.join(pathStore, config.storage),
      path.join(pathStore, config.config),
      `http://${DOMAIN_SERVERS}:${config.port}/`,
      config.port
    );
    console.log(magenta(`Running registry ${config.config} on port ${config.port}`));
    const server = new Server(verdaccioConfig.domainPath);
    const process = new VerdaccioProcess(verdaccioConfig, server, SILENCE_LOG, DEBUG_INJECT);

    const fork = await process.init();
    console.log(blue(`Fork PID ${fork[1]}`));
    forkList.push(fork);
  }

  return () => {
    console.log(yellow('Teardown Test Environment.'));
    // shutdown verdaccio
    for (const server of forkList) {
      server[0].stop();
    }
    // close web server
    gitlab.server.close();
    console.log(blue('teardown: all servers closed'));
  };
}
