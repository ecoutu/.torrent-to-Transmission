requirejs([
  'jquery',
  './app/background-app'
], function ($, BackgroundApp) {
  var backgroundApp = new BackgroundApp.AppController();
  backgroundApp.start();
});
