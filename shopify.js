#!/usr/bin/env node
/*global process, Buffer*/
(function() {
  "use strict";
  var fs = require('fs');

  var commander = require('commander');
  var request = require('request');
  var ftpd = require('ftpd');

  commander
    .version(require('./package.json').version)
    .option('-p, --port [port]', 'listen on specified port')
    .option('-b, --bind [address]', 'bind to specified address')
    .parse(process.argv);


  var config = {
    port: commander.port || 2121,
    bind: commander.bind || '127.0.0.1'
  };
  var ftp = createServer(config);
  ftp.listen(config.port, config.bind, function() {
    log('FTP server listening on ' + config.bind + ':' + config.port);
  });

  function createServer(config) {
    var ftp = new ftpd.FtpServer(config.bind, {
      pasvPortRangeStart: config.pasvPortRangeStart || 4000,
      pasvPortRangeEnd: config.pasvPortRangeEnd || 5000,
      getInitialCwd: function(connection, callback) {
        connection.emit('get-initial-cwd', callback);
      },
      getRoot: function(connection) {
        return '/';
      },
      useReadFile: true,
      useWriteFile: true
    });
    //todo: this is kinda hacky
    ftp.on('client:connected', clientConnected.bind(null, config));
    return ftp;
  }


  function clientConnected(config, ftpCon) {
    config = Object.create(config);
    log('FTP connection from ' + ftpCon.socket.remoteAddress);
    ftpCon.on('command:user', function(username, success, failure) {
      var parsed = parseUser(username);
      config.username = username;
      config.api_key = parsed.api_key;
      config.name = parsed.name;
      success();
    });

    ftpCon.on('command:pass', function(password, success, failure) {
      config.password = password;
      var proxy = new Proxy(config);
      proxy.getThemes(function(error, themes) {
        if (error) return failure(error);
        proxy.initThemes = themes;
        success(config.username, proxy);
      });
    });

    ftpCon.on('close', function() {
      log('Connection closed');
    });

    ftpCon.on('get-initial-cwd', function(callback) {
      callback(null, '/');
    });
  }



  function Proxy(config) {
    this.config = config;
    this.itemCache = {
      '/': {role: 'directory'}
    };
  }

  Proxy.prototype = {
    readdir: function(path, callback) {
      // special case: when we authenticated we received a initial list of
      // themes. we don't want to re-fetch right away, so we cache this list
      // for the *first* readdir
      var initThemes = this.initThemes;
      delete this.initThemes;
      console.log('readdir', path);
      if (path === '/') {
        if (initThemes) {
          callback(null, getNames(initThemes));
        } else {
          this.getThemes(function(error, themes) {
            if (error) return callback(error);
            callback(null, getNames(themes));
          }.bind(this));
        }
      } else {
        this.getTheme(path, function(error, theme) {
          if (error) return callback(error);
          this.getAssets(theme, function(error) {
            if (error) return callback(error);
            var names = {};
            var prefix = path + '/';
            Object.keys(this.itemCache).forEach(function(itemPath) {
              if (itemPath.indexOf(prefix) === 0) {
                var name = itemPath.slice(prefix.length).split('/')[0];
                names[name] = 1;
              }
            });
            callback(null, Object.keys(names));
          }.bind(this));
        }.bind(this));
      }
    },

    //get theme from cache for specified file path
    getTheme: function(path, callback) {
      var themeName = path.slice(1).split('/')[0];
      var theme = this.itemCache['/' + themeName];
      if (theme) return callback(null, theme);
      this.getThemes(function(error) {
        if (error) return callback(error);
        var theme = this.itemCache['/' + themeName];
        if (!theme) {
          error = new Error('Not found: /' + themeName);
          console.error(error.stack);
          return callback(error)
        }
        callback(null, theme);
      }.bind(this));
    },

    getThemes: function(callback) {
      this.get('/admin/themes', function(error, body) {
        if (error) return callback(error);
        console.log('fetched themes');
        var themes = body.themes;
        themes.forEach(function(theme) {
          theme.name = theme.name.replace(/\//g, '-');
          this.itemCache['/' + theme.name] = theme;
        }, this);
        callback(null, themes);
      }.bind(this));
    },

    getAssets: function(theme, callback) {
      this.get('/admin/themes/' + theme.id + '/assets', function(error, body) {
        if (error) return callback(error);
        console.log('fetched assets for:', theme.name);
        var assets = body.assets;
        var itemCache = this.itemCache;
        var directories = {};
        assets.forEach(function(asset) {
          itemCache['/' + theme.name + '/' + asset.key] = asset;
          var parts = asset.key.split('/');
          asset.name = parts.pop();
          //for directory path a/b/c add a, a/b, a/b/c to list of directories
          parts.forEach(function(name, i) {
            var dirName = parts.slice(0, i + 1).join('/');
            if (!directories[dirName]) {
              directories[dirName] = [];
            }
          });
          var dirName = parts.join('/');
          directories[dirName].push(asset);
        });
        Object.keys(directories).forEach(function(dirName) {
          itemCache['/' + theme.name + '/' + dirName] = {
            name: dirName,
            role: 'directory',
            created_at: theme.created_at,
            updated_at: theme.updated_at
          };
        });
        callback(null, directories);
      }.bind(this));
    },

    stat: function(path, callback) {
      this.getTheme(path, function(error, theme) {
        if (error) return callback(error);
        var item = this.itemCache[path];
        if (!item) {
          //todo: why do we have to fetch here?
          this.getAssets(theme, function(error) {
            if (error) return callback(error);
            if (!this.itemCache[path]) {
              error = new Error('Not found: ' + path);
              console.error(error.stack);
              return callback(error)
            }
            this.stat(path, callback);
          }.bind(this));
          return;
        }
        var type = (item.role) ? 'directory' : 'file';
        callback(null, new StatsObject(type, item));
      }.bind(this));
    },

    mkdir: function(path, mode, callback) {
      // cannot create directories
      var error = new Error('EACCES, permission denied');
      error.code = 'EACCES';
      return callback(error);
    },

    rmdir: function(path, callback) {
      // cannot remove directories
      var error = new Error('EACCES, permission denied');
      error.code = 'EACCES';
      return callback(error);
    },

    // limitation: cannot move/copy between themes
    rename: function(src, dst, callback) {
      // should be of format /theme/folder/file.name
      var srcParts = src.slice(1).split('/');
      var dstParts = dst.slice(1).split('/');
      if (srcParts.length < 3 || dstParts.length < 3) {
        var error = new Error('EACCES, permission denied');
        error.code = 'EACCES';
        return callback(error);
      }
      this.getTheme(src, function(error, theme) {
        if (error) return callback(error);
        //todo: ensure the asset is not a directory
        var srcPath = src.slice(1).split('/').slice(1).join('/');
        var dstPath = dst.slice(1).split('/').slice(1).join('/');
        var data = {
          asset: {
            key: dstPath,
            source_key: srcPath
          }
        };
        this.put('/admin/themes/' + theme.id + '/assets', data, function(error, body) {
          if (error) return callback(error);
          var qs = {
            'asset[key]': srcPath
          };
          this.delete('/admin/themes/' + theme.id + '/assets', qs, function(error, body) {
            callback(error);
          });
        }.bind(this));
      }.bind(this));
    },

    // limitation: not all files can be deleted
    unlink: function(path, callback) {
      this.getTheme(path, function(error, theme) {
        if (error) return callback(error);
        path = path.slice(1).split('/').slice(1).join('/');
        var qs = {
          'asset[key]': path
        };
        this.delete('/admin/themes/' + theme.id + '/assets', qs, function(error, body) {
          callback(error);
        });
      }.bind(this));
    },

    createReadStream: function(path, opts) {
      console.log('createReadStream', path, opts);
      throw new Error('Not implemented');
    },

    createWriteStream: function(path, opts) {
      console.log('createReadStream', path, opts);
      throw new Error('Not implemented');
    },

    readFile: function(path, callback) {
      var item = this.itemCache[path];
      this.getTheme(path, function(error, theme) {
        if (error) return callback(error);
        if (!item) {
          //todo: why do we have to fetch here?
          this.getAssets(theme, function(error) {
            if (error) return callback(error);
            if (!this.itemCache[path]) {
              error = new Error('Not found: ' + path);
              console.log(error.stack);
              return callback(error)
            }
            this.readFile(path, callback);
          }.bind(this));
          return;
        }
        path = path.slice(1).split('/').slice(1).join('/');
        if (item.public_url) {
          request({url: item.public_url, encoding: null}, function(error, response, body) {
            if (error) return callback(error);
            callback(null, body);
          });
        } else {
          var qs = {
            'asset[key]': path
          };
          this.get('/admin/themes/' + theme.id + '/assets', qs, function(error, body) {
            if (error) return callback(error);
            var asset = body.asset;
            var data = (asset.value) ? new Buffer(asset.value) : new Buffer(asset.attachment, 'base64');
            callback(null, data);
          });
        }
      }.bind(this));
    },

    writeFile: function(path, data, callback) {
      this.getTheme(path, function(error, theme) {
        if (error) return callback(error);
        path = path.slice(1).split('/').slice(1).join('/');
        var params = {
          asset: {
            key: path,
            attachment: data.toString('base64')
          }
        };
        this.put('/admin/themes/' + theme.id + '/assets', params, function(error, body) {
          callback(error);
        }.bind(this));
      }.bind(this));
    },

    get: function(resource, qs, callback) {
      var args = Array.prototype.slice.call(arguments);
      callback = args.pop();
      qs = (typeof args[args.length - 1] === 'object') ? args.pop() : null;
      request(this.url(resource, qs), function(error, response, body) {
        if (error) return callback(error);
        if (response.statusCode !== 200) {
          return callback(new Error('HTTP Response Status: ' + response.statusCode))
        }
        var contentType = response.headers['content-type'].split(';')[0].toLowerCase();
        if (contentType === 'application/json') {
          try {
            body = JSON.parse(body);
          } catch(e) {
            return callback(new Error('Unable to parse response JSON; Content-Length: ' + response.headers['content-length']));
          }
          return callback(null, body)
        } else {
          return callback(new Error('Unexpected Content-Type'));
        }
      });
    },

    put: function(resource, data, callback) {
      var args = Array.prototype.slice.call(arguments);
      callback = args.pop();
      data = (typeof args[args.length - 1] === 'object') ? args.pop() : {};
      request(
        {method: 'PUT', url: this.url(resource), body: data, json: true},
        function(error, response, body) {
          if (error) return callback(error);
          callback(null, body)
        }
      );
    },

    delete: function(resource, qs, callback) {
      var args = Array.prototype.slice.call(arguments);
      callback = args.pop();
      qs = (typeof args[args.length - 1] === 'object') ? args.pop() : null;
      request(
        {method: 'DELETE', url: this.url(resource, qs), json: true},
        function(error, response, body) {
          if (error) {
            callback(error);
          } else {
            callback(null, body);
          }
        }
      );
    },

    url: function(resource, qs) {
      var config = this.config;
      var result = 'https://' + config.api_key + ':' + config.password + '@' + config.name + '.myshopify.com' + resource + '.json';
      if (qs) {
        qs = Object.keys(qs).map(function(key) {
          return encodeURIComponent(key) + '=' + encodeURIComponent(qs[key]);
        });
        result += '?' + qs.join('&');
      }
      return result;
    }
  };

  function StatsObject(type, item) {
    this.name = item.name || '';
    this.type = type;
    this.size = item.size || 0;
    this.mtime = (typeof item.updated_at === 'string') ? new Date(Date.parse(item.updated_at)) : item.updated_at;
    this.ctime = (typeof item.created_at === 'string') ? new Date(Date.parse(item.created_at)) : item.created_at;
    this.atime = this.mtime;
  }
  StatsObject.prototype = {
    isFile: function() {
      return (this.type === 'file');
    },
    isDirectory: function() {
      return (this.type === 'directory');
    },
    isBlockDevice: function() { return false; },
    isCharacterDevice: function() { return false; },
    isSymbolicLink: function() { return false; },
    isFIFO: function() { return false; },
    isSocket: function() { return false; }
  };


  // Allow us to embed our api key + name in the username
  //  example: e660fd027591bed89e9688d443e48fee@mystore or e660fd027591bed89e9688d443e48fee#mystore
  function parseUser(string) {
    var parts = string.split(/[@#]/);
    return {
      api_key: parts[0],
      name: parts[1]
    };
  }

  function getNames(list) {
    return list.map(function(item) {
      return item.name;
    });
  }

  function log() {
    console.error.apply(console, arguments);
  }
})();