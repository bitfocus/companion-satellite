#!/usr/bin/env bash
set -e

echo "This will attempt to install Companion Satellite as a system service on this device."
echo "It is designed to be run on headless servers, but can be used on desktop machines if you are happy to not have the tray icon."
echo "A user called 'satellite' will be created to run the service, and various scripts will be installed to manage the service"

if [ $(/usr/bin/id -u) -ne 0 ]; then
    echo "Must be run as root"
    exit 1
fi

SATELLITE_BRANCH="${SATELLITE_BRANCH:-master}"

# add a system user
adduser --disabled-password satellite --gecos ""

# install some dependencies
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y git zip unzip curl libusb-1.0-0-dev libudev-dev cmake libfontconfig1 nano
apt-get clean

# install fnm to manage node version
# we do this to /opt/fnm, so that the satellite user can use the same installation
export FNM_DIR=/opt/fnm
echo "export FNM_DIR=/opt/fnm" >> /root/.bashrc
curl -fsSL https://fnm.vercel.app/install | bash -s -- --install-dir /opt/fnm
export PATH=/opt/fnm:$PATH
eval "`fnm env --shell bash`"

# clone the repository
git clone https://github.com/bitfocus/companion-satellite.git -b $SATELLITE_BRANCH /usr/local/src/companion-satellite
cd /usr/local/src/companion-satellite

# configure git for future updates
git config --global pull.rebase false

# run the update script
./pi-image/update.sh $SATELLITE_BRANCH

# enable start on boot
systemctl enable satellite

# copy config file into place
cp ./pi-image/satellite-config /boot/satellite-config

# add the fnm node to this users path
# TODO - verify permissions
echo "export PATH=/opt/fnm/aliases/default/bin:\$PATH" >> /home/satellite/.bashrc

echo "Companion Satellite is installed!"
echo "You should edit the configuration file at \"/boot/satellite-config\" then can start it with \"sudo systemctl start satellite\" or \"sudo satellite-update\""
