#!/bin/bash

SATELLITE_CONFIG_PATH=/boot/satellite-config

# path could be a symlink
SATELLITE_CONFIG_PATH=$(realpath $SATELLITE_CONFIG_PATH)

# config file doesn't exist, try and find it
if ! [ -f "$SATELLITE_CONFIG_PATH" ]; then
  if [ -f "/boot/firmware/satellite-config" ]; then
    ln -s /boot/firmware/satellite-config $SATELLITE_CONFIG_PATH
  else
    echo "Warning: Failed to find config"
  fi
fi
