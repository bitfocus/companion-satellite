To connect the Satellite surface to your Companion setup, you need to configure the remote host.

1. Right-click on the Companion Satellite icon in the system tray.
![Context Menu](images/contextmenu.png?raw=true 'Context Menu')

1. Choose "Change Host" in the context menu.
![Change Host](images/changehost.png?raw=true 'Change Host')

1. Type in the IP Address of the remote server.
![IP Address](images/ipaddress.png?raw=true 'IP Address')

1. Once you've configured the Remote Host, the Stream Deck(s) will establish a connection with the host.
In the Companion server's web GUI, you can see the satellite surface(s) connected. Any satellite connection will by listed by type as `Satellite` and will have an id starting with `satellite-` followed by the serial number of the Stream Deck surface. You can optionally name each surface for convenience.
![Surfaces](images/server_surfaces.png?raw=true 'Server Surfaces')

If the host IP Address is not a valid Companion instance, your surfaces will show this:
![Disconnected](images/disconnected.png?raw=true 'Disconnected')