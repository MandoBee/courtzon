/**
 * Local dev: https://localhost is usually Apache/XAMPP on :443 (bad cert), NOT Docker.
 * CourtZon Docker UI: http://127.0.0.1:5173
 */
(function () {
  var h = location.hostname;
  if (h !== 'localhost' && h !== '127.0.0.1') return;
  if (location.protocol !== 'https:') return;
  location.replace(
    'http://127.0.0.1:5173' + location.pathname + location.search + location.hash
  );
})();
