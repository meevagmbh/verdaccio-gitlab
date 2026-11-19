// Copyright 2018 Roger Meier <roger@bufferoverflow.ch>
// SPDX-License-Identifier: MIT

import { pluginUtils } from '@verdaccio/core';

import VerdaccioGitLab from './gitlab';
import { VerdaccioGitlabConfig } from './gitlab';

export default function (config: VerdaccioGitlabConfig, options: pluginUtils.PluginOptions) {
  return new VerdaccioGitLab(config, options);
}
