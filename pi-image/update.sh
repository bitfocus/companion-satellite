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
corepack enable

# install dependencies
yarn config set httpTimeout 100000
yarn

# build typescript
yarn build

# update some tooling
cp assets/linux/50-satellite.rules /etc/udev/rules.d/
udevadm control --reload-rules || true

# update startup script
cp pi-image/satellite.service /etc/systemd/system

# ADD REST_PORT to old config files
if [ -f /boot/satellite-config ]; then
    if grep -q REST_PORT /boot/satellite-config; then
    echo "config ok"
    else
    echo "
    # Port for the REST server (0 to disable)
    REST_PORT=9999" >> /boot/satellite-config
    fi
    chmod 666 /boot/satellite-config
fi

systemctl daemon-reload

# install some scripts
ln -s -f /usr/local/src/companion-satellite/pi-image/satellite-license /usr/local/bin/satellite-license
ln -s -f /usr/local/src/companion-satellite/pi-image/satellite-help /usr/local/bin/satellite-help
ln -s -f /usr/local/src/companion-satellite/pi-image/satellite-update /usr/local/sbin/satellite-update
ln -s -f /usr/local/src/companion-satellite/pi-image/satellite-edit-config /usr/local/sbin/satellite-edit-config

# install the motd
ln -s -f /usr/local/src/companion-satellite/pi-image/motd /etc/motd 
