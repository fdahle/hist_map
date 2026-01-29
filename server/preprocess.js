import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import * as shapefile from "shapefile"; //
import * as turf from "@turf/turf";

// --- CONFIGURATION ---
const CONFIG = {
  // 1. SIMPLIFICATION
  // Higher = simpler geometry (fewer points).
  // 0.001 is very conservative, 0.1 is aggressive. Start with 0.01.
  simplifyTolerance: 10,

  // 2. PRECISION
  // How many decimal places to keep.
  // For EPSG:3031 (meters), '0' (integers) is usually precise enough (1 meter accuracy).
  coordinatePrecision: 0,
};

const INPUT_DIR = path.resolve("../input");
const OUTPUT_DIR = path.resolve("data");

const processShapes = async () => {
  // set path to shapes directory
  const shapeDir = path.join(INPUT_DIR, "shapes");

  // get all files in the shapes directory
  const files = fs
    .readdirSync(shapeDir)
    .filter((f) => f.endsWith(".json") || f.endsWith(".geojson"));

  // process each file
  for (const file of files) {
    const filePath = path.join(shapeDir, file);
    let geojson = null;

    // handle json/geojson files
    if (file.endsWith(".json") || file.endsWith(".geojson")) {
      console.log(`Processing GeoJSON file: ${file}`);
      const rawData = fs.readFileSync(filePath);
      geojson = JSON.parse(rawData);
    }

    // handle shapefiles
    else if (file.endsWith(".shp")) {
      console.log(`Processing Shapefile: ${file}`);
      // convert shapefile to geojson
      geojson = await shapefile.read(filePath);
    }

    if (geojson) {
      // simply geometry
      try {
        console.log(
          `  - Simplifying (tolerance: ${CONFIG.simplifyTolerance})...`,
        );
        geojson = turf.simplify(geojson, {
          tolerance: CONFIG.simplifyTolerance,
          highQuality: true, // Takes longer but better results
          mutate: true, // Updates object in place
        });
      } catch (err) {
        console.warn("  ! Simplification failed, skipping step.", err);
      }

      // 2. truncate Coordinates (Reduce precision)
      console.log(
        `  - Truncating coordinates to ${CONFIG.coordinatePrecision} decimals...`,
      );
      geojson = turf.truncate(geojson, {
        precision: CONFIG.coordinatePrecision,
        coordinates: 2, // Remove 'z' (elevation) coordinates if they exist
        mutate: true,
      });

      // create a unique layer ID
      const layerId = uuidv4();
      geojson._layer_id = layerId;

      // ensure data is a FeatureCollection
      if (geojson.type === "Feature") {
        geojson = { type: "FeatureCollection", features: [geojson] };
      }

      // add unique IDs to features if missing
      geojson.features = geojson.features.map((feature) => {
        if (!feature.properties) feature.properties = {};
        feature.properties._id = uuidv4();
        return feature;
      });

      const outputName = file.split(".")[0] + ".geojson";
      fs.writeFileSync(
        path.join(OUTPUT_DIR, outputName),
        JSON.stringify(geojson),
      );
      console.log(`Successfully saved processed file: ${outputName}`);
    }
  }
};

processShapes().catch((err) => {
  console.error("Error processing shapes:", err);
});
