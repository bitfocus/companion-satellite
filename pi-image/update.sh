#!/bin/bash -e

# this is the bulk of the update script
# It is a separate file, so that the freshly cloned copy is invoked, not the old copy

# imitiate the fnm setup done in .bashrc
export FNM_DIR=/opt/fnm
export PATH=/opt/fnm:$PATH
eval "`fnm env`"

cd /usr/local/src/companion-satellite

# update the node version
fnm use --install-if-missing
fnm default $(fnm current)
npm --unsafe-perm install -g yarn

# install dependencies
yarn config set network-timeout 100000 -g
yarn

# build typescript
yarn build

# update some tooling
cp pi-image/50-satellite.rules /etc/udev/rules.d/

# update startup script
cp pi-image/satellite.service /etc/systemd/system
systemctl daemon-reload

# install some scripts
ln -s -f /usr/local/src/companion-satellite/pi-image/satellite-license /usr/local/bin/satellite-license
ln -s -f /usr/local/src/companion-satellite/pi-image/satellite-help /usr/local/bin/satellite-help
ln -s -f /usr/local/src/companion-satellite/pi-image/satellite-update /usr/local/sbin/satellite-update
ln -s -f /usr/local/src/companion-satellite/pi-image/satellite-edit-config /usr/local/sbin/satellite-edit-config

# install the motd
ln -s -f /usr/local/src/companion-satellite/pi-image/motd /etc/motd 
