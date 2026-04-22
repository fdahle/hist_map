import { logger } from "../utils/logger";

export function useCrsCompatibility(map, layerStore) {
  const checkCrsCompatibility = async (layerConf, layerId) => {
    const mapCrs = map.getView().getProjection().getCode();
    const epsgCode = mapCrs.split(":")[1];

    if (layerConf.crs_support !== undefined) {
      if (layerConf.crs_support === false) {
        layerStore.setCrsCompatibility(layerId, false);
      } else if (Array.isArray(layerConf.crs_support)) {
        const upper = layerConf.crs_support.map((c) => String(c).toUpperCase());
        layerStore.setCrsCompatibility(layerId, upper.includes(mapCrs.toUpperCase()));
      }
      return;
    }

    try {
      if (layerConf.type === "tile") {
        layerStore.setCrsCompatibility(layerId, !!layerConf.crs_options);
        return;
      }

      if (layerConf.type === "wmts") {
        let baseUrl = layerConf.url
          .replace(/\{[a-z]-[a-z]\}/g, layerConf.url.match(/\{([a-z])-[a-z]\}/)?.[1] ?? "a")
          .replace(/[?#].*$/, "")
          .replace(/\/$/, "");

        const candidates = [
          `${baseUrl}?SERVICE=WMTS&REQUEST=GetCapabilities`,
          `${baseUrl}/WMTSCapabilities.xml`,
        ];

        let doc = null;
        for (const capUrl of candidates) {
          try {
            const res = await fetch(capUrl, { signal: AbortSignal.timeout(8000) });
            if (!res.ok) continue;
            const xml = await res.text();
            doc = new DOMParser().parseFromString(xml, "text/xml");
            if (doc.querySelector("parsererror")) { doc = null; continue; }
            break;
          } catch { continue; }
        }

        if (!doc) {
          layerStore.setCrsCompatibility(layerId, null);
          return;
        }

        const sets = doc.querySelectorAll("TileMatrixSet");
        for (const set of sets) {
          const id = set.querySelector(":scope > Identifier, :scope > ows\\:Identifier")?.textContent?.trim();
          if (id !== layerConf.matrixSet) continue;
          const supportedCrs =
            set.querySelector(":scope > SupportedCRS, :scope > ows\\:SupportedCRS")?.textContent?.trim() ?? "";
          const compatible =
            supportedCrs.includes(epsgCode) ||
            supportedCrs.toUpperCase().includes(mapCrs.toUpperCase());
          layerStore.setCrsCompatibility(layerId, compatible);
          return;
        }

        layerStore.setCrsCompatibility(layerId, false);
        return;
      }

      if (layerConf.type === "wms") {
        layerStore.setCrsCompatibility(layerId, null);
        return;
      }
    } catch (e) {
      logger.warn("LayerManager", `CRS check failed for "${layerConf.name}":`, e.message);
    }
  };

  return { checkCrsCompatibility };
}
