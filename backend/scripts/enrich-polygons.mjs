import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, 'polygon-cache');

// ─── CONFIG ────────────────────────────────────────────────────────────────────

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'CourtZon2026',
  database: process.env.DB_NAME || 'courtzon_v2',
};

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// Simpson's rule: keep points with area > threshold (fraction of original)
// Higher = more simplification
const SIMPLIFY_TOLERANCE = 0.001;

const OVERPASS_DELAY_MS = 3000; // Be respectful to OSM API

// ─── SIMPLIFICATION (Ramer-Douglas-Peucker) ───────────────────────────────────

function perpendicularDistance(point, lineStart, lineEnd) {
  const [x, y] = point;
  const [x1, y1] = lineStart;
  const [x2, y2] = lineEnd;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const num = Math.abs(dy * x - dx * y + x2 * y1 - y2 * x1);
  const den = Math.sqrt(dx * dx + dy * dy);
  return den === 0 ? Math.sqrt((x - x1) ** 2 + (y - y1) ** 2) : num / den;
}

function douglasPeucker(points, epsilon) {
  if (points.length <= 2) return points;

  let maxDist = 0;
  let maxIdx = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], points[0], points[points.length - 1]);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = douglasPeucker(points.slice(0, maxIdx + 1), epsilon);
    const right = douglasPeucker(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }

  return [points[0], points[points.length - 1]];
}

function simplifyRing(ring, tolerance) {
  if (ring.length < 4) return ring;
  // Close the ring properly
  const closed = ring.slice(0, -1);
  const simplified = douglasPeucker(closed, tolerance);
  // Re-close
  simplified.push(simplified[0]);
  return simplified;
}

function simplifyGeoJSON(geojson, tolerance) {
  if (geojson.type === 'Polygon') {
    return {
      type: 'Polygon',
      coordinates: geojson.coordinates.map(ring => simplifyRing(ring, tolerance)),
    };
  }
  if (geojson.type === 'MultiPolygon') {
    return {
      type: 'MultiPolygon',
      coordinates: geojson.coordinates.map(poly =>
        poly.map(ring => simplifyRing(ring, tolerance)),
      ),
    };
  }
  return geojson;
}

// ─── OVERPASS QUERY ────────────────────────────────────────────────────────────

function overpassQuery(name, type = 'city') {
  // Build a query that searches for the area by name with admin_level filter
  // admin_levels: 6=city, 7=municipality, 8=town/village, 9=suburb, 10=neighbourhood
  let adminLevels;
  switch (type) {
    case 'city': adminLevels = '6,7,8'; break;
    case 'district': adminLevels = '8,9,10'; break;
    case 'neighborhood': adminLevels = '9,10'; break;
    default: adminLevels = '8,9,10';
  }

  return `[out:json][timeout:30];
(
  area["name:en"="${name}"]["admin_level"~"^(${adminLevels})$"]->.search;
  area["name"="${name}"]["admin_level"~"^(${adminLevels})$"]->.searchAlt;
);
(.search; .searchAlt;);
out geom;`;
}

async function fetchFromOverpass(query) {
  const resp = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!resp.ok) throw new Error(`Overpass HTTP ${resp.status}`);
  return resp.json();
}

// ─── MAIN ──────────────────────────────────────────────────────────────────────

async function enrich() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  const conn = await mysql.createConnection(DB_CONFIG);

  // Get all cities with NULL or empty polygons
  const [rows] = await conn.execute(
    `SELECT c.id, c.name, c.type, c.province_id, p.name AS province_name
     FROM cities c
     JOIN provinces p ON p.id = c.province_id
     WHERE p.country_id = 1
       AND (c.navigation_polygon IS NULL OR c.navigation_polygon = '')
     ORDER BY c.id`,
  );

  console.log(`Found ${rows.length} cities missing polygons`);

  let enriched = 0;
  let skipped = 0;

  for (const row of rows) {
    const cachePath = path.join(CACHE_DIR, `${row.id}.json`);

    // Check cache
    if (fs.existsSync(cachePath)) {
      try {
        const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        if (cached && cached.type) {
          const simplified = simplifyGeoJSON(cached, SIMPLIFY_TOLERANCE);
          await conn.execute(
            'UPDATE cities SET navigation_polygon = ? WHERE id = ?',
            [JSON.stringify(simplified), row.id],
          );
          enriched++;
          console.log(`  [CACHE] ${row.name} (id=${row.id})`);
          continue;
        }
      } catch { /* invalid cache, re-fetch */ }
    }

    // Fetch from OSM
    const query = overpassQuery(row.name, row.type || 'city');
    console.log(`  Fetching: ${row.name} (${row.province_name})...`);

    try {
      const data = await fetchFromOverpass(query);

      // Find best matching feature (prefer admin boundary over other types)
      const features = data.elements || [];
      let bestPoly = null;

      for (const el of features) {
        if (el.geometry && el.geometry.length > 2) {
          const coords = el.geometry.map(g => [g.lon, g.lat]);
          // Ensure closed ring
          if (coords[0][0] !== coords[coords.length - 1][0] ||
              coords[0][1] !== coords[coords.length - 1][1]) {
            coords.push(coords[0]);
          }
          const poly = { type: 'Polygon', coordinates: [coords] };
          bestPoly = poly;
          break; // Take the first valid result
        }
      }

      if (bestPoly) {
        const simplified = simplifyGeoJSON(bestPoly, SIMPLIFY_TOLERANCE);
        await conn.execute(
          'UPDATE cities SET navigation_polygon = ? WHERE id = ?',
          [JSON.stringify(simplified), row.id],
        );
        // Cache
        fs.writeFileSync(cachePath, JSON.stringify(bestPoly), 'utf8');
        enriched++;
        console.log(`  ✓ ${row.name} — ${simplified.coordinates[0].length} points`);
      } else {
        skipped++;
        console.log(`  ✗ ${row.name} — no boundary found on OSM`);
      }
    } catch (err) {
      skipped++;
      console.error(`  ✗ ${row.name} — error: ${err.message}`);
    }

    // Be nice to OSM API
    if (rows.indexOf(row) < rows.length - 1) {
      await new Promise(r => setTimeout(r, OVERPASS_DELAY_MS));
    }
  }

  console.log(`\nDone. Enriched: ${enriched}, Skipped: ${skipped}`);
  await conn.end();
}

enrich().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
