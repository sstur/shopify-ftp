##Shopify FTP Proxy

This runs a local FTP server (on localhost) that will communicate with Shopify over HTTP API and allows you to upload/download/edit your theme files and assets using your favorite FTP client.

Note: this tool is built with [Node.js](https://nodejs.org) and is installed via [npm](https://www.npmjs.org) so make sure to have Node installed. I have tested this only on Mac but it should work fine on Windows. Please [submit an issue](https://github.com/sstur/shopify-ftp/issues) if you come across any bugs.
 
###Installation:

    npm install shopify-ftp

###Usage:

    shopify ftp [--port 2121] [--host 127.0.0.1]


###Get Shopify API Key(s)

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

I'd like to get this working with [ExpanDrive](http://www.expandrive.com/) to mount as a local directory. However, currently this won't work with ExpanDrive because we can't upload/download ranges (partial files) using the Shopify API.

[Follow me on Twitter](https://twitter.com/simonsturmer) for updates!

Have fun.
