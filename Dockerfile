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
FROM verdaccio/verdaccio:6.11.3
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

# Healthy while verdaccio answers /-/ping on its port. The check does not
# reach GitLab: a GitLab outage fails logins, not the registry itself.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --start-interval=2s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:$VERDACCIO_PORT/-/ping" || exit 1
