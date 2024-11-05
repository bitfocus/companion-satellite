Sometimes you may wish to set a static IP address on your Satellite Pi.

To do this, use the `nmcli` command:

You can view your Raspberry Pi's connections with the following command:

`sudo nmcli -p connection show`

To set the IP address (in this instance on "Wired Connection 1"), run the following commands to set the Satellite IP and Subnet, Default Gateway and DNS Server.

```
sudo nmcli con mod "Wired connection 1" ipv4.addresses 10.1.1.123/24 ipv4.method manual
sudo nmcli con mod "Wired connection 1" ipv4.gateway 10.1.1.1
sudo nmcli con mod "Wired connection 1" ipv4.dns "10.1.1.1"
```
If you are on the console directly, you can restart the network as follows, otherwise reboot.

You can now restart the network with the following command:
```
sudo nmcli con down "Wired connection 1" && \sudo nmcli con up "Wired connection 1"
```
Alternatively, you may reboot the device.
