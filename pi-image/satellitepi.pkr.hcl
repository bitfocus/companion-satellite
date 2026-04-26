packer {
  required_plugins {
    arm-image = {
      version = "0.2.7"
      source  = "github.com/solo-io/arm-image"
    }
  }
}

variable "branch" {
  type    = string
  default = "main"
}

variable "build" {
  type    = string
  default = "beta"
}

source "arm-image" "satellitepi" {
  iso_checksum              = "sha256:4cd31df026fd82243805a326dc0cafd7383f7e3d30c9413e7044d507aae281e2"
  iso_url                   = "https://downloads.raspberrypi.com/raspios_lite_arm64/images/raspios_lite_arm64-2026-04-21/2026-04-21-raspios-trixie-arm64-lite.img.xz"
  last_partition_extra_size = 2147483648
  qemu_binary               = "qemu-aarch64-static"
}

build {
  sources = ["source.arm-image.satellitepi"]

  provisioner "file" {
    source = "install.sh"
    destination = "/tmp/install.sh"
  }

  provisioner "shell" {
    #system setup
    inline = [
      # # enable ssh
      # "touch /boot/ssh",

      # change the hostname
      "CURRENT_HOSTNAME=`cat /etc/hostname | tr -d \" \t\n\r\"`",
      "echo satellitepi > /etc/hostname",
      "sed -i \"s/127.0.1.1.*$CURRENT_HOSTNAME/127.0.1.1\tsatellitepi/g\" /etc/hosts",
    ]
  }

  provisioner "shell" {
    # run as root
    execute_command = "chmod +x {{ .Path }}; {{ .Vars }} su root -c {{ .Path }}"
    inline_shebang  = "/bin/bash -e"
    inline = [
      
			# run the script
      "export SATELLITE_BRANCH=${var.branch}",
      "export SATELLITE_BUILD=${var.build}",
      "chmod +x /tmp/install.sh",
      "/tmp/install.sh"
    ]
  }

}