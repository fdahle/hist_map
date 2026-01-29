import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import * as shapefile from "shapefile";
import * as turf from "@turf/turf";
import proj4 from "proj4";
import { reproject } from "reproject";
import epsg from "epsg-index/all.json" with { type: "json" };
import { parse } from "csv-parse/sync";

// define input/output directories
const INPUT_DIR = path.resolve("../input");
const OUTPUT_DIR = path.resolve("data");

// global config
const CONFIG = {
  targetCrs: "EPSG:3031",
  simplifyTolerance: 50,
  coordinatePrecision: 0,
};

// Load the mapping config
const MAPPING_PATH = path.join(INPUT_DIR, "input_config.json");
const MAPPING = fs.existsSync(MAPPING_PATH)
  ? JSON.parse(fs.readFileSync(MAPPING_PATH, "utf-8"))
  : {};

console.log("TODO: CRS MUST BE CHANGED IN PROPERTIES");

const processShapes = async () => {
  const shapeDir = path.join(INPUT_DIR, "shapes");

  // 1. Updated filter to include .shp
  const files = fs
    .readdirSync(shapeDir)
    .filter(
      (f) =>
        f.endsWith(".json") || f.endsWith(".geojson") || f.endsWith(".shp"),
    );

  for (const file of files) {
    const filePath = path.join(shapeDir, file);
    // Construct the key as it appears in mapping.json (e.g., "shapes/file.json")
    const mappingKey = `shapes/${file}`;
    const fileConfig = MAPPING[mappingKey];

    // init geojson variable that will be populated
    let geojson = null;

    // parse json/geojson files
    if (file.endsWith(".json") || file.endsWith(".geojson")) {
      console.log(`Processing GeoJSON file: ${file}`);
      geojson = JSON.parse(fs.readFileSync(filePath));

      // parse shapefiles
    } else if (file.endsWith(".shp")) {
      console.log(`Processing Shapefile: ${file}`);
      geojson = await shapefile.read(filePath);
    }

    // Proceed only if the geojson variable is populated
    if (geojson) {
      // Ensure FeatureCollection
      if (geojson.type === "Feature") {
        geojson = { type: "FeatureCollection", features: [geojson] };
      }

      // 2. CRS Detection & Reprojection
      const sourceCrs = detectCrs(geojson);
      if (sourceCrs !== CONFIG.targetCrs) {
        console.log(
          `  - Reprojecting from ${sourceCrs} to ${CONFIG.targetCrs}...`,
        );
        const fromDef = epsg[sourceCrs.split(":")[1]]?.proj4 || sourceCrs;
        const toDef =
          epsg[CONFIG.targetCrs.split(":")[1]]?.proj4 || CONFIG.targetCrs;
        try {
          // perform reprojection
          geojson = reproject(geojson, fromDef, toDef, epsg);

          // catch reprojection errors
        } catch (err) {
          console.error(`  ! Reprojection failed: ${err.message}`);
        }
      }

      // 3. Attribute Joining Logic
      let csvLookup = null;
      if (fileConfig?.attributes) {
        console.log(
          `  - Joining attributes from ${fileConfig.attributes.attributesFile}...`,
        );
        csvLookup = loadCsvLookup(
          fileConfig.attributes.attributesFile,
          fileConfig.attributes.attributesKey,
          fileConfig.attributes.attributesDelimiter,
        );
      }

      // 4. Feature Processing Loop
      geojson.features = geojson.features.map((feature) => {
        if (!feature.properties) feature.properties = {};

        // A. Apply Join
        if (csvLookup && fileConfig.attributes.ownKey) {
          const val = feature.properties[fileConfig.attributes.ownKey];
          const match = csvLookup.get(String(val));
          if (match) {
            feature.properties = { ...feature.properties, ...match };
          }
        }

        // B. Apply Thumbnails
        if (fileConfig?.metadata?.hasThumbnails) {
          let thumbUrl = fileConfig.metadata.thumbnailTemplate;
          // Replace all {property_name} in template with actual values
          const placeholders = thumbUrl.match(/{([^}]+)}/g) || [];
          placeholders.forEach((p) => {
            const key = p.replace(/{|}/g, "");
            thumbUrl = thumbUrl.replace(p, feature.properties[key] || "");
          });
          feature.properties._thumbnail_url = thumbUrl;
        }

        // C. Simplify
        try {
          feature = turf.simplify(feature, {
            tolerance: CONFIG.simplifyTolerance,
            highQuality: true,
            mutate: false,
          });
        } catch (e) {
          /* keep original on fail */
        }

        feature.properties._id = uuidv4();
        return feature;
      });

      // 5. Truncate Coordinate precision
      geojson = turf.truncate(geojson, {
        precision: CONFIG.coordinatePrecision,
        mutate: true,
      });

      // set some metadata
      geojson._layerId = uuidv4();
      if (fileConfig?.metadata) geojson.metadata = fileConfig.metadata;
      if (geojson.crs) delete geojson.crs;
      geojson.crs = {
        type: "name",
        properties: {
          name: `urn:ogc:def:crs:EPSG::${CONFIG.targetCrs.split(":")[1]}`,
        },
      };

      // Reorder object: Put CRS at the top manually
      const orderedGeojson = {
        crs: geojson.crs,
        ...geojson,
      };

      // 6. Write Output GeoJSON
      const outputName = file.replace(/\.[^/.]+$/, "") + ".geojson";
      fs.writeFileSync(
        path.join(OUTPUT_DIR, outputName),
        JSON.stringify(orderedGeojson),
      );
      console.log(`  Successfully saved: ${outputName}`);
    } else {
      console.warn(`  ! Skipping file due to unsupported format: ${file}`);
    }
  }
};

// Helper to load CSV into a Map for fast lookup
const loadCsvLookup = (relativeCsvPath, keyColumn, delimiter = ",") => {
  const fullPath = path.resolve(INPUT_DIR, relativeCsvPath);
  if (!fs.existsSync(fullPath)) {
    console.warn(`  ! CSV file not found: ${fullPath}`);
    return null;
  }
  const rawCsv = fs.readFileSync(fullPath, "utf-8");
  const records = parse(rawCsv, {
    columns: true,
    skip_empty_lines: true,
    delimiter: delimiter,
  });
  const lookup = new Map();
  records.forEach((row) => lookup.set(String(row[keyColumn]), row));
  return lookup;
};

// Helper to detect CRS from GeoJSON
const detectCrs = (geojson) => {
  if (geojson.crs?.properties?.name) {
    const name = geojson.crs.properties.name;
    if (name.includes("CRS84")) return "EPSG:4326";
    const match = name.match(/EPSG::?(\d+)/);
    return match ? `EPSG:${match[1]}` : name;
  }
  return "EPSG:4326";
};

processShapes().catch(console.error);
