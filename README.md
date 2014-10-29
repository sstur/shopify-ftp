##Shopify FTP Proxy

This runs a local FTP server (on localhost) that will communicate with Shopify over HTTP API and allows you to upload/download/edit templates and assets using your favorite FTP client.
 
###Installation:

    npm install shopify-ftp

###Usage:

    shopify ftp [--port 2121] [--host 127.0.0.1]


##Get Shopify API Key(s)

You will need a Shopify API key-pair.

 * Go to: [{store-name}.myshopify.com/admin/apps](https://myshopify.com/admin/apps)
 * Click "Private Apps" in the top right corner
 * Click on an existing private app or create a new one
 * Copy the API key and Password

###Connecting over FTP

Open your favorite FTP client, for instance [FileZilla](https://filezilla-project.org/) and create a new connection with the following details:

 * Host: `127.0.0.1`
 * Port: `2121`
 * Username: `{api-key}@{store-name}`
 * Password: `{api-password}`

Then save/connect and you should be able to browse your assets and templates including upload, delete, rename, download and move.

Note: your username contains __both__ your API key and your store name (separated by `@`).

For even more fun, go get [ExpanDrive](http://www.expandrive.com/) and mount as a local directory.

Have fun.
