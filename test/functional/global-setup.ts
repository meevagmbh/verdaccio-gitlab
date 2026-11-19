import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';

import { yellow, green, blue, magenta } from 'kleur/colors';
import type { TestProject } from 'vitest/node';

import { VerdaccioConfig } from '../lib/verdaccio-server';
import VerdaccioProcess from '../lib/server_process';
import Server from '../lib/server';

import { DOMAIN_SERVERS } from './config.functional';
import GitlabServer from './lib/mock_gitlab_server';

declare module 'vitest' {
  export interface ProvidedContext {
    registryUrl: string;
  }
}

// Asks the OS for a free port. Fixed ports collide with ports the host
// reserves, for example on WSL with mirrored networking.
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on('error', reject);
    probe.listen(0, DOMAIN_SERVERS, () => {
      const { port } = probe.address() as net.AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

// Writes a copy of the stored verdaccio config with the run's GitLab mock
// port, an absolute storage path and a plugins folder that links this
// checkout as `verdaccio-gitlab`. Verdaccio then loads the plugin whatever
// the checkout directory is called.
function writeRunConfig(storeDir: string, configName: string, storagePath: string, gitlabPort: number): string {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verdaccio-gitlab-functional-'));
  const pluginsDir = path.join(runDir, 'plugins');
  fs.mkdirSync(pluginsDir);
  fs.symlinkSync(path.resolve(__dirname, '../..'), path.join(pluginsDir, 'verdaccio-gitlab'), 'dir');

  const replacements: Array<[RegExp, string]> = [
    [/^storage: .*$/m, `storage: ${JSON.stringify(storagePath)}`],
    [/url: http:\/\/localhost:\d+\//, `url: http://localhost:${gitlabPort}/`],
  ];
  let yaml = fs.readFileSync(path.join(storeDir, configName), 'utf8');
  for (const [pattern, value] of replacements) {
    if (!pattern.test(yaml)) {
      throw new Error(`${configName} has no line matching ${pattern}`);
    }
    yaml = yaml.replace(pattern, value);
  }
  yaml += `\nplugins: ${JSON.stringify(pluginsDir)}\n`;

  const configPath = path.join(runDir, configName);
  fs.writeFileSync(configPath, yaml);
  return configPath;
}

// Starts the GitLab mock and verdaccio once for the whole run, hands the
// registry url to the tests, and returns the teardown that stops them again.
export default async function setup(project: TestProject) {
  const SILENCE_LOG = !process.env.VERDACCIO_DEBUG;
  // @ts-ignore
  const DEBUG_INJECT: boolean = process.env.VERDACCIO_DEBUG_INJECT ? process.env.VERDACCIO_DEBUG_INJECT : false;
  const forkList: any[] = [];
  const runDirs: string[] = [];
  const pathStore = path.join(__dirname, 'store');
  const listServers = [
    {
      config: 'config-1.yaml',
      storage: 'test-storage1',
    },
  ];
  console.log(blue('setup: starting servers'));
  console.log(green('Setup Verdaccio Servers'));

  const gitlab: any = await new GitlabServer().start(0);
  const gitlabPort = (gitlab.server.address() as net.AddressInfo).port;

  for (const config of listServers) {
    const port = await freePort();
    const storagePath = path.join(pathStore, config.storage);
    const configPath = writeRunConfig(pathStore, config.config, storagePath, gitlabPort);
    runDirs.push(path.dirname(configPath));
    const verdaccioConfig = new VerdaccioConfig(storagePath, configPath, `http://${DOMAIN_SERVERS}:${port}/`, port);
    console.log(magenta(`Running registry ${config.config} on port ${port}`));
    const server = new Server(verdaccioConfig.domainPath);
    const process = new VerdaccioProcess(verdaccioConfig, server, SILENCE_LOG, DEBUG_INJECT);

    const fork = await process.init();
    console.log(blue(`Fork PID ${fork[1]}`));
    forkList.push(fork);
    project.provide('registryUrl', verdaccioConfig.domainPath);
  }

  return () => {
    console.log(yellow('Teardown Test Environment.'));
    // shutdown verdaccio
    for (const server of forkList) {
      server[0].stop();
    }
    // close web server
    gitlab.server.close();
    for (const dir of runDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    console.log(blue('teardown: all servers closed'));
  };
}
