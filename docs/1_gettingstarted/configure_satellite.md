To connect the Satellite surface to your Companion setup, you need to configure the connection.

1. Right-click on the Companion Satellite icon in the system tray.
   ![Context Menu](images/contextmenu.png?raw=true 'Context Menu')

   If you are running Companion Satellite on a headless machine, such as a Raspberry Pi, you can instead navigate to `http://192.168.100.100:9999` (substitute the correct ip address) and access the same configuration

1. Choose "Configure" in the context menu.
   This will open a new window
   ![Configure window](images/configure-page.png?raw=true 'Configure window')

1. Type in the IP Address or hostname of the remote server into the Address field, and click Save at the bottom.
   In most cases you **should not** change the port number from the default.

1. Optionally, you can configure other settings in here.

1. Shortly after you have clicked Save, the top section should update to confirm that it has connected
   ![Connected Status](images/configure-connected.png?raw=true 'Connected Status')

1. Next, switch to the 'Surface Plugins' tab, and make sure that the surface types you wish to use are all enabled
   ![Surface Plugins](images/surface-plugins.png?raw=true 'Surface Plugins')

1. Finally, you can confirm in the 'Connected Surfaces' tab that Satellite has correctly detected each surface
   ![Connected Surfaces](images/connected-surfaces.png?raw=true 'Connected Surfaces')

1. You will also be able to see your surfaces in Companion, where they will appear just like other surfaces, but with the ip address of the Satellite machine under the 'Location' column

While Satellite is in the disconnected state, your surfaces will show a placeholder card to indicate this, looking like:
![Disconnected](images/disconnected.jpg?raw=true 'Disconnected')
