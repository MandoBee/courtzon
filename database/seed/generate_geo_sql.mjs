import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const turf = require('@turf/turf');

const ADM0_FILE = 'C:\\Users\\mniaz\\Desktop\\Egypt\\geoBoundaries-EGY-ADM0.json';
const ADM1_FILE = 'C:\\Users\\mniaz\\Desktop\\Egypt\\geoBoundaries-EGY-ADM1.json';
const ADM2_FILE = 'C:\\Users\\mniaz\\Desktop\\Egypt\\geoBoundaries-EGY-ADM2.json';

const OUTPUT_DIR = 'C:\\Users\\mniaz\\Desktop\\CourtZon-V2\\database\\seed';

function loadGeoJSON(file) {
  const raw = JSON.parse(readFileSync(file, 'utf-8'));
  return raw.features || [];
}

function minifyGeometry(geometry) {
  const coords = geometry.coordinates;
  const type = geometry.type;

  function roundCoord(coord) {
    if (Array.isArray(coord[0])) {
      return coord.map(c => roundCoord(c));
    }
    return [parseFloat(coord[0].toFixed(6)), parseFloat(coord[1].toFixed(6))];
  }

  function simplifyRings(rings, tolerance = 0.001) {
    return rings.map(ring => {
      const simplified = [ring[0]];
      for (let i = 1; i < ring.length - 1; i++) {
        const prev = simplified[simplified.length - 1];
        const curr = ring[i];
        if (Math.abs(curr[0] - prev[0]) > tolerance || Math.abs(curr[1] - prev[1]) > tolerance) {
          simplified.push(curr);
        }
      }
      simplified.push(ring[ring.length - 1]);
      return simplified;
    });
  }

  let processed;
  if (type === 'Polygon') {
    processed = simplifyRings(coords.map(r => roundCoord(r)));
  } else if (type === 'MultiPolygon') {
    processed = coords.map(poly => simplifyRings(poly.map(r => roundCoord(r))));
  }

  const result = { type, coordinates: processed };
  return JSON.stringify(result);
}

function slugify(name) {
  if (!name) return '';
  let s = name.toLowerCase().trim();
  s = s.replace(/[^a-z0-9\s-]/g, '');
  s = s.replace(/[\s-]+/g, '-');
  s = s.replace(/^-+|-+$/g, '');
  return s;
}

// ADM0 - Country
function processCountry(features) {
  if (features.length !== 1) {
    console.error('Expected 1 ADM0 feature, got', features.length);
    return null;
  }
  const feature = features[0];
  const geoStr = minifyGeometry(feature.geometry);
  return { name: 'Egypt', slug: 'egypt', iso2: 'EG', iso3: 'EGY', phone_code: '+20', capital: 'Cairo', currency: 'EGP', polygon: geoStr };
}

// ADM1 - Provinces
function processProvinces(features) {
  const knownGovernorates = {
    'Alexandria Governorate': { name: 'Alexandria', code: 'EG-ALX' },
    'Aswan Governorate': { name: 'Aswan', code: 'EG-ASN' },
    'Asyut Governorate': { name: 'Asyut', code: 'EG-AST' },
    'Beheira Governorate': { name: 'Beheira', code: 'EG-BH' },
    'Beni Suef Governorate': { name: 'Beni Suef', code: 'EG-BNS' },
    'Cairo Governorate': { name: 'Cairo', code: 'EG-C' },
    'Dakahlia Governorate': { name: 'Dakahlia', code: 'EG-DK' },
    'Damietta Governorate': { name: 'Damietta', code: 'EG-DT' },
    'Faiyum Governorate': { name: 'Faiyum', code: 'EG-FYM' },
    'Gharbia Governorate': { name: 'Gharbia', code: 'EG-GH' },
    'Giza Governorate': { name: 'Giza', code: 'EG-GZ' },
    'Ismailia Governorate': { name: 'Ismailia', code: 'EG-IS' },
    'Kafr El Sheikh Governorate': { name: 'Kafr El Sheikh', code: 'EG-KFS' },
    'Luxor Governate': { name: 'Luxor', code: 'EG-LX' },
    'Matrouh Governorate': { name: 'Matrouh', code: 'EG-MT' },
    'Minya Governate': { name: 'Minya', code: 'EG-MN' },
    'Monufia Governorate': { name: 'Monufia', code: 'EG-MNF' },
    'New Valley Governorate': { name: 'New Valley', code: 'EG-WAD' },
    'North Sinai Governorate': { name: 'North Sinai', code: 'EG-SIN' },
    'Port Said Governorate': { name: 'Port Said', code: 'EG-PTS' },
    'Qalyubia Governorate': { name: 'Qalyubia', code: 'EG-KB' },
    'Qena Governorate': { name: 'Qena', code: 'EG-KN' },
    'Red Sea Governorate': { name: 'Red Sea', code: 'EG-BA' },
    'Sharqia Governorate': { name: 'Sharqia', code: 'EG-SHR' },
    'Sohag Governorate': { name: 'Sohag', code: 'EG-SHG' },
    'South Sinai Governorate': { name: 'South Sinai', code: 'EG-JS' },
    'Suez Governorate': { name: 'Suez', code: 'EG-SUZ' },
  };

  // Also match by shapeISO
  return features.map(f => {
    const props = f.properties || {};
    const shapeName = props.shapeName || '';
    const shapeISO = props.shapeISO || '';

    let gov = knownGovernorates[shapeName];
    if (!gov) {
      const match = Object.values(knownGovernorates).find(g => g.code === shapeISO);
      if (match) gov = match;
    }
    if (!gov) {
      const name = shapeName.replace(' Governorate', '').replace(' Governate', '').trim();
      gov = { name, code: shapeISO || slugify(name) };
    }

    const geoStr = minifyGeometry(f.geometry);
    return { ...gov, polygon: geoStr };
  });
}

// ADM2 - Cities
function processCities(ad2Features, provinceFeatures) {
  const provincePolys = provinceFeatures.map(f => {
    const props = f.properties || {};
    const shapeName = props.shapeName || '';
    const shapeISO = props.shapeISO || '';
    return { feature: f, shapeName, shapeISO, turfPoly: turf.feature(f.geometry) };
  });

  return ad2Features.map(f => {
    const props = f.properties || {};
    const shapeName = props.shapeName || '';
    const centroid = turf.centroid(f.geometry);
    const pt = centroid.geometry.coordinates;

    // Find containing province
    let matchedProvince = null;
    for (const p of provincePolys) {
      if (turf.booleanPointInPolygon(centroid, p.turfPoly)) {
        matchedProvince = p;
        break;
      }
    }

    const provinceCode = matchedProvince ? matchedProvince.shapeISO : '';
    const geoStr = minifyGeometry(f.geometry);
    
    // Determine type
    let type = 'area';
    const lower = shapeName.toLowerCase();
    if (lower.includes('city') || lower.includes(' ') === false && shapeName.length < 15) {
      type = 'city';
    } else if (lower.includes('district') || lower.includes('qism')) {
      type = 'district';
    } else if (lower.includes('neighborhood') || lower.includes('village') || lower.includes('ezbet')) {
      type = 'neighborhood';
    }

    return { name: shapeName, type, provinceCode, polygon: geoStr };
  });
}

function escapeSQL(val) {
  if (val === null || val === undefined) return 'NULL';
  return "'" + val.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}

// =============== MAIN ===============

async function main() {
  // Check if turf is available
  let turf;
  try {
    turf = require('@turf/turf');
  } catch {
    console.log('Installing @turf/turf...');
    const { execSync } = await import('child_process');
    execSync('npm install @turf/turf', { cwd: 'C:\\Users\\mniaz\\Desktop\\CourtZon-V2\\database\\seed', stdio: 'inherit' });
    turf = require('@turf/turf');
  }

  const ad0 = loadGeoJSON(ADM0_FILE);
  const ad1 = loadGeoJSON(ADM1_FILE);
  const ad2 = loadGeoJSON(ADM2_FILE);

  console.log(`ADM0 features: ${ad0.length}`);
  console.log(`ADM1 features: ${ad1.length}`);
  console.log(`ADM2 features: ${ad2.length}`);

  // 1. Countries
  const country = processCountry(ad0);
  let sql = `-- ============================================================================\n`;
  sql += `-- CourtZon V2 – Egypt Country Polygon\n`;
  sql += `-- Generated from geoBoundaries-EGY-ADM0\n`;
  sql += `-- ============================================================================\n\n`;

  sql += `-- Ensure Egypt country exists\n`;
  sql += `INSERT IGNORE INTO countries (iso_code, iso_code_3, name, native_name, phone_code, default_currency) VALUES\n`;
  sql += `(${escapeSQL('EG')}, ${escapeSQL('EGY')}, ${escapeSQL('Egypt')}, ${escapeSQL('مصر')}, ${escapeSQL('+20')}, ${escapeSQL('EGP')});\n\n`;

  sql += `-- Update Egypt navigation polygon\n`;
  sql += `UPDATE countries\n`;
  sql += `SET navigation_polygon = ${escapeSQL(country.polygon)}\n`;
  sql += `WHERE iso_code = 'EG';\n\n`;

  writeFileSync(`${OUTPUT_DIR}\\countries_polygons.sql`, sql);
  console.log('Generated countries_polygons.sql');

  // 2. Provinces
  const provinces = processProvinces(ad1);

  sql = `-- ============================================================================\n`;
  sql += `-- CourtZon V2 – Egypt Governorates Polygons\n`;
  sql += `-- Generated from geoBoundaries-EGY-ADM1\n`;
  sql += `-- ============================================================================\n\n`;

  sql += `-- SET @eg_id = (SELECT id FROM countries WHERE iso_code = 'EG');\n\n`;

  for (const prov of provinces) {
    const slug = slugify(prov.name);
    sql += `-- ${prov.name}\n`;
    sql += `INSERT IGNORE INTO provinces (country_id, name, code, type) VALUES\n`;
    sql += `  ((SELECT id FROM countries WHERE iso_code = 'EG'), ${escapeSQL(prov.name)}, ${escapeSQL(prov.code)}, 'governorate');\n`;
    sql += `UPDATE provinces\n`;
    sql += `SET navigation_polygon = ${escapeSQL(prov.polygon)}\n`;
    sql += `WHERE code = ${escapeSQL(prov.code)};\n`;
    sql += `UPDATE provinces SET slug = ${escapeSQL(slug)} WHERE code = ${escapeSQL(prov.code)} AND slug IS NULL;\n\n`;
  }

  writeFileSync(`${OUTPUT_DIR}\\provinces_polygons.sql`, sql);
  console.log('Generated provinces_polygons.sql');

  // 3. Cities
  const cities = processCities(ad2, ad1);

  sql = `-- ============================================================================\n`;
  sql += `-- CourtZon V2 – Egypt Cities/Districts Polygons\n`;
  sql += `-- Generated from geoBoundaries-EGY-ADM2\n`;
  sql += `-- ============================================================================\n\n`;

  sql += `-- Schema changes\n`;
  sql += `ALTER TABLE cities ADD COLUMN IF NOT EXISTS type VARCHAR(50) NULL;\n`;
  sql += `ALTER TABLE cities ADD COLUMN IF NOT EXISTS slug VARCHAR(200) NULL;\n`;
  sql += `ALTER TABLE provinces ADD COLUMN IF NOT EXISTS slug VARCHAR(200) NULL;\n\n`;

  sql += `-- Indexes\n`;
  sql += `CREATE INDEX IF NOT EXISTS idx_city_name ON cities(name);\n`;
  sql += `CREATE INDEX IF NOT EXISTS idx_city_slug ON cities(slug);\n`;
  sql += `CREATE INDEX IF NOT EXISTS idx_province_name ON provinces(name);\n`;
  sql += `CREATE INDEX IF NOT EXISTS idx_country_name ON countries(name);\n\n`;

  let cityCount = 0;
  for (const city of cities) {
    if (!city.provinceCode) continue; // skip if no province match
    const slug = slugify(city.name);
    sql += `-- ${city.name} (${city.type})\n`;
    sql += `INSERT IGNORE INTO cities (province_id, name, type) VALUES\n`;
    sql += `  ((SELECT id FROM provinces WHERE code = ${escapeSQL(city.provinceCode)}), ${escapeSQL(city.name)}, ${escapeSQL(city.type)});\n`;
    sql += `UPDATE cities c\n`;
    sql += `  JOIN provinces p ON p.id = c.province_id\n`;
    sql += `SET c.navigation_polygon = ${escapeSQL(city.polygon)}\n`;
    sql += `WHERE p.code = ${escapeSQL(city.provinceCode)} AND c.name = ${escapeSQL(city.name)};\n`;
    sql += `UPDATE cities SET slug = ${escapeSQL(slug)} WHERE name = ${escapeSQL(city.name)} AND slug IS NULL;\n\n`;
    cityCount++;
  }

  sql += `-- ${cityCount} cities processed\n`;

  writeFileSync(`${OUTPUT_DIR}\\cities_polygons.sql`, sql);
  console.log(`Generated cities_polygons.sql (${cityCount} cities)`);

  console.log('\nDone! SQL files generated in database/seed/');
}

main().catch(console.error);
