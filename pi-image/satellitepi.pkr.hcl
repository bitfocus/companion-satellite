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
      "chmod +x /tmp/install.sh",
      "/tmp/install.sh"
    ]
  }

}