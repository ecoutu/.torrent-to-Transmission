requirejs.config({
  baseUrl: 'js',
  shim: {
    'underscore': {
      exports: '_'
    },
    'backbone': {
      deps: ['underscore'],
      exports: 'Backbone'
    }
  },
  paths: {
    'jquery': './bower_components/jquery/dist/jquery',
    'underscore': './bower_components/underscore/underscore',
    'backbone': './bower_components/backbone/backbone',
    'rsvp': './bower_components/rsvp/rsvp',
    'transmissionClient': './lib/transmission-client'
  }
});
