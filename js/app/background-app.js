define([
  'jquery',
  'underscore',
  'transmissionClient'
], function($, _, TransmissionClient) {

  var BackgroundApp = {

  };

  BackgroundApp.AppController = function(client) {

  };

  BackgroundApp.AppController.prototype.start = function() {
    var ctx = this;
    var config = null;

    _.bindAll(this, 'torrentOnClick');

    // set defaults
    chrome.storage.local.get({
      config: {
        rpcUser: '',
        rpcPass: '',
        rpcURL: 'http://localhost:9091/transmission/rpc',
        webURL: 'http://localhost:9091',
        displayNotifications: true,
        refreshRate: 5,
        selectedList: 'all'
      },
      torrents: {}
    }, function(items) {
      if (chrome.runtime.lastError) {
        logger.error('Error when retrieving config from local storage: ', chrome.runtime.lastError);
      } else {
        config = items.config;
        chrome.storage.local.set(items);
        ctx.updateInterval = setInterval(ctx.update, config.refreshRate * 1000);

        chrome.contextMenus.create({
            "title": ".torrent To Transmission",
            "contexts": ["link"],
            "onclick": ctx.torrentOnClick,
        });

        ctx.transmissionClient = new TransmissionClient(config.rpcURL, config.rpcUser, config.rpcPass);
        // var json = {
        //     "method": "session-stats"
        // };

        // ctx.transmissionClient.transmissionRequest(json);
      }
    });
  }

  BackgroundApp.AppController.prototype.torrentOnClick = function(info, tab) {
    this.transmissionClient.addTorrent(info.linkUrl).then(function(data) {
      console.log('success', arguments);
    }, function(err) {
      console.error('fail', arguments);
    });
  };

  BackgroundApp.AppController.prototype.update = function() {
    // console.log('update: ', arguments);
  };

  return BackgroundApp;
});
