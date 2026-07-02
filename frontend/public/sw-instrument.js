/**
 * Service Worker instrumentation — logs lifecycle events ONLY.
 * Does NOT wrap event.respondWith (to isolate the NetworkOnly bug).
 */
(function () {
  'use strict';

  var CZ_SW = '[CZ-SW]';

  self.addEventListener('install', function (event) {
    console.log(CZ_SW, 'install event');
    self.skipWaiting();
    event.waitUntil(
      Promise.resolve().then(function () {
        console.log(CZ_SW, 'install complete');
      })
    );
  });

  self.addEventListener('activate', function (event) {
    console.log(CZ_SW, 'activate event');
    event.waitUntil(
      self.clients.claim().then(function () {
        console.log(CZ_SW, 'clients.claim() succeeded — SW now controls all pages');
      }).catch(function (err) {
        console.error(CZ_SW, 'clients.claim() failed', err);
      })
    );
  });
})();
