import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import * as shapefile from "shapefile"; //

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
      // create a unique layer ID
      const layerId = uuidv4();
      geojson._id = layerId;

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
