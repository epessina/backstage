/*
 * Copyright 2020 Spotify AB
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import os from 'os';
import fs from 'fs-extra';
import path from 'path';
import { TemplateEntityV1alpha1 } from '@backstage/catalog-model';
import { parseLocationAnnotation } from '../helpers';
import { InputError, Git } from '@backstage/backend-common';
import { PreparerBase, PreparerOptions } from './types';
import { BitbucketIntegrationConfig } from '@backstage/integration';
import parseGitUrl from 'git-url-parse';

export class BitbucketPreparer implements PreparerBase {
  static fromConfig(config: BitbucketIntegrationConfig) {
    return new BitbucketPreparer(
      config.username,
      config.token,
      config.appPassword,
    );
  }

  constructor(
    private readonly username?: string,
    private readonly token?: string,
    private readonly appPassword?: string,
  ) {}

  async prepare(
    template: TemplateEntityV1alpha1,
    opts: PreparerOptions,
  ): Promise<string> {
    const { protocol, location } = parseLocationAnnotation(template);
    const workingDirectory = opts.workingDirectory ?? os.tmpdir();
    const logger = opts.logger;

    if (!['bitbucket', 'url'].includes(protocol)) {
      throw new InputError(
        `Wrong location protocol: ${protocol}, should be 'url'`,
      );
    }
    const templateId = template.metadata.name;

    const repo = parseGitUrl(location);
    const repositoryCheckoutUrl = repo.toString('https');

    const tempDir = await fs.promises.mkdtemp(
      path.join(workingDirectory, templateId),
    );

    const templateDirectory = path.join(
      `${path.dirname(repo.filepath)}`,
      template.spec.path ?? '.',
    );

    const checkoutLocation = path.resolve(tempDir, templateDirectory);

    const auth = this.getAuth();
    const git = auth
      ? Git.fromAuth({
          ...auth,
          logger,
        })
      : Git.fromAuth({ logger });

    await git.clone({
      url: repositoryCheckoutUrl,
      dir: tempDir,
    });

    return checkoutLocation;
  }

  private getAuth(): { username: string; password: string } | undefined {
    if (this.username && this.appPassword) {
      return { username: this.username, password: this.appPassword };
    }

    if (this.token) {
      return {
        username: 'x-token-auth',
        password: this.token! || this.appPassword!,
      };
    }

    return undefined;
  }
}
