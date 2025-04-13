#!/bin/bash -e

# this is the bulk of the update script
# It is a separate file, so that the freshly cloned copy is invoked, not the old copy

# fail if this happens, to avoid breaking existing arm installations
CURRENT_ARCH=$(dpkg --print-architecture)
if [[ "$CURRENT_ARCH" != "x64" && "$CURRENT_ARCH" != "amd64" && "$CURRENT_ARCH" != "arm64" ]]; then
	echo "$CURRENT_ARCH is not a supported cpu architecture for running Companion Satellite."
	echo "If you are running on an arm device (such as a Raspberry Pi), make sure to use an arm64 image."
	echo "YOUR INSTALLATION HAS NOT BEEN CHANGED. You must reinstall a new satellite image to update."
	exit 0
fi

# don't prompt before downloading yarn
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

# imitiate the fnm setup done in .bashrc
export FNM_DIR=/opt/fnm
export PATH=/opt/fnm:$PATH
eval "`fnm env`"

cd /usr/local/src/companion-satellite

# update the node version
fnm use --install-if-missing
fnm default $(fnm current)
corepack enable

if [ $(getent group dialout) ]; then
  adduser -q satellite dialout # for serial based surfaces
fi

# ensure some dependencies are installed
ensure_installed() {
  if ! dpkg --verify "$1" 2>/dev/null; then
	# Future: batch the installs, if there are multiple
	apt-get install -qq -y $1
  fi
}
ensure_installed "wget unattended-upgrades"

# Run interactive version picker
yarn --cwd "pi-image/update-prompt" install >/dev/null
node "pi-image/update-prompt/main.js" $1 $2

# Get result
if [ -f /tmp/satellite-version-selection ]; then
	SELECTED_URL=$(cat /tmp/satellite-version-selection)
	SELECTED_NAME=$(cat /tmp/satellite-version-selection-name)
	rm -f /tmp/satellite-version-selection
	rm -f /tmp/satellite-version-selection-name
fi

if [ -n "$SELECTED_URL" ]; then 
	echo "Installing from $SELECTED_URL"

	# download it
	wget "$SELECTED_URL" -O /tmp/satellite-update.tar.gz -q  --show-progress

	# extract download
	echo "Extracting..."
	rm -R -f /tmp/satellite-update
	mkdir /tmp/satellite-update
	tar -xzf /tmp/satellite-update.tar.gz --strip-components=1 -C /tmp/satellite-update
	rm /tmp/satellite-update.tar.gz

	# copy across the useful files
	rm -R -f /opt/companion-satellite
	npx --yes @electron/asar e /tmp/satellite-update/resources/app.asar /tmp/satellite-update/resources/app
	mkdir /opt/companion-satellite
	mv /tmp/satellite-update/resources/app /opt/companion-satellite/satellite
	mkdir /opt/companion-satellite/webui
	mv /tmp/satellite-update/resources/webui /opt/companion-satellite/webui/dist
	# mv /tmp/satellite-update/*.rules /opt/companion-satellite/
	rm -R /tmp/satellite-update

	echo "$SELECTED_NAME" > /opt/companion-satellite/BUILD

	# remove the old dependencies
	rm -R -f node_modules || true
	rm -R -f webui/node_modules || true

	echo "Finishing"
else
	echo "Skipping update"
fi

# update some tooling
if [ -d "/etc/udev/rules.d/" ]; then
	cp satellite/assets/linux/50-satellite.rules /etc/udev/rules.d/
	udevadm control --reload-rules || true
fi

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
