define([
  'jquery',
  'underscore',
  'rsvp'
], function($, _, RSVP) {

  var TransmissionClient = function(url, user, password) {
    this.url = url;
    this.user = user;
    this.password = password;
    this.tag = 12345;
  };

  TransmissionClient.prototype.addTorrent = function(url) {
    var data = {
      method: 'torrent-add',
      arguments: {
        'filename': url,
        paused: false
      },
      tag: this.tag
    };

    return this.transmissionRequest(data);
  };

  TransmissionClient.prototype.transmissionRequest = function(data) {
    var ctx = this;
    var headers = {
      'X-Transmission-Session-Id': this.sessionId
    };

    data.tag = this.tag;

    return $.ajax({
      type: 'POST',
      url: this.url,
      data: JSON.stringify(data),
      headers: headers,
      user: this.user,
      password: this.password
    }).done(function(data, textStatus, jqXHR) {
      return new RSVP.Promise(function(reject, resolve) {
        resolve(data);
      });
    }).fail(function(jqXHR, textStatus, err) {
      console.error('Transmission request error, status code: ' + jqXHR.status + ', error: ' + err);
      return new RSVP.Promise(function(resolve, reject) {
        if (jqXHR.status === 409) {
          ctx.sessionId = jqXHR.getResponseHeader('X-Transmission-Session-Id');
          return ctx.transmissionRequest(data);
        } else {
          if (jqXHR.status === 0) {
            reject('no response');
          } else {
            reject(textStatus);
          }
        }
      });
    });
  };

  return TransmissionClient;
});
