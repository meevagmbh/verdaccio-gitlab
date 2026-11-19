FROM node:24-alpine AS builder

WORKDIR /opt/verdaccio-gitlab-build
COPY . .

# Registry to install from, e.g. a mirror. yarn 4 reads it from this variable.
ARG VERDACCIO_BUILD_REGISTRY=https://registry.npmjs.org
ENV YARN_NPM_REGISTRY_SERVER=$VERDACCIO_BUILD_REGISTRY \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0

# corepack installs the yarn version pinned in package.json#packageManager.
# `workspaces focus --production` then strips the dev dependencies again.
RUN corepack enable && \
    yarn install --immutable && \
    yarn code:docker-build && \
    yarn workspaces focus --all --production && \
    yarn cache clean --all



# Keep in step with the verdaccio devDependency in package.json.
FROM verdaccio/verdaccio:6.11.1
LABEL maintainer="https://github.com/meevagmbh/verdaccio-gitlab"

# Go back to root to be able to install the plugin
USER root

COPY --from=builder /opt/verdaccio-gitlab-build/build /opt/verdaccio-gitlab/build
COPY --from=builder /opt/verdaccio-gitlab-build/package.json /opt/verdaccio-gitlab/package.json
COPY --from=builder /opt/verdaccio-gitlab-build/node_modules /opt/verdaccio-gitlab/node_modules

ADD conf/docker.yaml /verdaccio/conf/config.yaml

# Inherited from parent image
WORKDIR $VERDACCIO_APPDIR
RUN ln -s /opt/verdaccio-gitlab/build /verdaccio/plugins/verdaccio-gitlab

# Inherited from parent image
USER $VERDACCIO_USER_UID
