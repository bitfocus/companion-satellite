packer {
  required_plugins {
    arm-image = {
      version = "0.2.5"
      source  = "github.com/solo-io/arm-image"
    }
  }
}

variable "branch" {
  type    = string
  default = "master"
}

source "arm-image" "satellitepi" {
  iso_checksum              = "sha256:72c773781a0a57160eb3fa8bb2a927642fe60c3af62bc980827057bcecb7b98b"
  iso_url                   = "https://downloads.raspberrypi.org/raspios_lite_arm64/images/raspios_lite_arm64-2022-09-26/2022-09-22-raspios-bullseye-arm64-lite.img.xz"
  last_partition_extra_size = 2147483648
  qemu_binary               = "qemu-aarch64-static"
}

build {
  sources = ["source.arm-image.satellitepi"]

  provisioner "shell" {
    #system setup
    inline = [
      # # enable ssh
      # "touch /boot/ssh",

      # change the hostname
      "CURRENT_HOSTNAME=`cat /etc/hostname | tr -d \" \t\n\r\"`",
      "echo satellitepi > /etc/hostname",
      "sed -i \"s/127.0.1.1.*$CURRENT_HOSTNAME/127.0.1.1\tsatellitepi/g\" /etc/hosts",

      # add a system user
      "adduser --disabled-password satellite --gecos \"\"",

      # install some dependencies
      "apt-get update",
      "apt-get upgrade -y",
      "apt-get install -y git unzip curl libusb-1.0-0-dev libudev-dev cmake",
      "apt-get clean"
    ]
  }

  provisioner "shell" {
    # run as root
    execute_command = "chmod +x {{ .Path }}; {{ .Vars }} su root -c {{ .Path }}"
    inline_shebang  = "/bin/bash -e"
    inline = [
      # install fnm to manage node version
      # we do this to /opt/fnm, so that the satellite user can use the same installation
      "export FNM_DIR=/opt/fnm",
      "echo \"export FNM_DIR=/opt/fnm\" >> /root/.bashrc",
      "curl -fsSL https://fnm.vercel.app/install | bash -s -- --install-dir /opt/fnm",
      "export PATH=/opt/fnm:$PATH",
      "eval \"`fnm env --shell bash`\"",
      
			# clone the repository
      "git clone https://github.com/bitfocus/companion-satellite.git -b ${var.branch} /usr/local/src/companion-satellite",
      "cd /usr/local/src/companion-satellite",
      
			# configure git for future updates
      "git config --global pull.rebase false",
      
			# run the update script
      "./pi-image/update.sh ${var.branch}",
      
			# enable start on boot
      "systemctl enable satellite",

			# copy config file into place
			"cp ./pi-image/satellite-config /boot/satellite-config"
    ]
  }

  provisioner "shell" {
    # run as satellite user
    execute_command = "chmod +x {{ .Path }}; {{ .Vars }} su satellite -c {{ .Path }}"
    inline_shebang  = "/bin/bash -e"
    inline = [
      "cd /usr/local/src/companion-satellite",

      # add the fnm node to this users path
      "echo \"export PATH=/opt/fnm/aliases/default/bin:\\$PATH\" >> ~/.bashrc"

    ]
  }

}