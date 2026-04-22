import { buildLayerSharedStyle } from "../utils/styleFactory";
import { buildColormapStyle } from "../utils/layerFactory";

export function useLayerStyling(layerStore, getSelectInteraction) {
  const applyLayerColor = (layerId) => {
    const layerObj = layerStore.getLayerById(layerId);
    if (!layerObj || !layerObj.layerInstance) return;

    // For grouped layers the style function already reads from the store;
    // just force OL to re-render the image tile.
    if (layerObj.groupBy) {
      layerObj.layerInstance.changed();
      return;
    }

    const newStyle = buildLayerSharedStyle(
      layerObj.color,
      layerObj.strokeColor ?? null,
      layerObj.fillColor ?? null,
      layerObj.geometryType,
      layerObj.pointType ?? null,
    );
    layerObj.layerInstance.setStyle(newStyle);

    // Clear per-feature style overrides (e.g. from a previous selection)
    // so the new layer style takes effect on all non-selected features.
    const source = layerObj.layerInstance.getSource?.();
    if (source) {
      const selectInteraction = getSelectInteraction();
      const selectedIds = selectInteraction
        ? new Set(selectInteraction.getFeatures().getArray().map(f => f.getId()))
        : new Set();
      source.getFeatures().forEach(f => {
        if (!selectedIds.has(f.getId())) f.setStyle(null);
      });
    }

    layerObj.layerInstance.changed();
  };

  const applyLayerColormap = (layerId, colormapId) => {
    const layerObj = layerStore.getLayerById(layerId);
    if (!layerObj?.layerInstance || layerObj.type !== 'geotiff') return;
    const hasNoData =
      layerObj.metadata?.noDataValue !== null &&
      layerObj.metadata?.noDataValue !== undefined;
    const newStyle = buildColormapStyle(colormapId, hasNoData, layerObj.colormapInverted ?? false);
    layerObj.layerInstance.setStyle(newStyle);
  };

  const applySubCategories = (layerId) => {
    const layerObj = layerStore.getLayerById(layerId);
    if (layerObj?.layerInstance) layerObj.layerInstance.changed();
  };

  return { applyLayerColor, applyLayerColormap, applySubCategories };
}
