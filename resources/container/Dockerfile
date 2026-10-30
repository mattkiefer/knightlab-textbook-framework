FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential git curl libgomp1 \
    r-base r-base-dev \
    libxml2-dev libcurl4-openssl-dev libssl-dev libuv1-dev \
    sudo nano less openssh-client ca-certificates procps gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

ARG USERNAME=student
ARG USER_UID=1000
ARG USER_GID=1000
RUN groupadd --gid $USER_GID $USERNAME \
    && useradd --uid $USER_UID --gid $USER_GID -m -s /bin/bash $USERNAME \
    && echo "$USERNAME ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/$USERNAME \
    && chmod 0440 /etc/sudoers.d/$USERNAME

COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

COPY requirements-node.json /tmp/package.json
RUN cd /tmp && npm install -g $(node -e "console.log(Object.keys(require('./package.json').dependencies).join(' '))")
ENV NODE_PATH=/usr/lib/node_modules

COPY requirements-r.R /tmp/requirements-r.R
RUN Rscript /tmp/requirements-r.R

COPY --chown=$USERNAME:$USERNAME datasets/ /home/$USERNAME/datasets/

USER $USERNAME
WORKDIR /home/$USERNAME
CMD ["sleep", "infinity"]
