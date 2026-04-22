import VectorLayer from "ol/layer/Vector";
import VectorImageLayer from "ol/layer/VectorImage";
import { Select, DragBox } from "ol/interaction";
import { click, shiftKeyOnly } from "ol/events/condition";
import { createSelectionStyleFunction } from "../utils/styleFactory";

export function useMapSelection(map, layerStore, selectionStore) {
  let selectInteraction = null;
  let dragBoxInteraction = null;

  const syncSelectionToStore = () => {
    const allSelected = selectInteraction.getFeatures().getArray();
    if (allSelected.length === 0) {
      selectionStore.clearSelection();
    } else {
      const featureData = allSelected.map((f) => {
        const properties = f.getProperties();
        const { geometry, ...props } = properties;
        return { properties: props };
      });
      selectionStore.setSelectedFeatures(featureData);
    }
  };

  const setupSelection = () => {
    const selectionStyleFunction = createSelectionStyleFunction(
      layerStore.getLayerById,
    );

    selectInteraction = new Select({
      condition: click,
      toggleCondition: shiftKeyOnly,
      style: selectionStyleFunction,
      filter: (feature) => feature.get('_layerId') != null,
    });

    selectInteraction.on("select", (e) => {
      e.deselected.forEach((deselected) => {
        deselected.setStyle(null);
      });
      syncSelectionToStore();
    });

    dragBoxInteraction = new DragBox({ condition: shiftKeyOnly });

    dragBoxInteraction.on("boxend", () => {
      const boxExtent = dragBoxInteraction.getGeometry().getExtent();
      const selFeatures = selectInteraction.getFeatures();
      const alreadySelected = new Set(selFeatures.getArray().map((f) => f.getId()));

      map.getLayers().forEach((layer) => {
        if (!(layer instanceof VectorLayer) && !(layer instanceof VectorImageLayer)) return;
        if (!layer.getVisible()) return;
        layer.getSource().forEachFeatureIntersectingExtent(boxExtent, (feature) => {
          if (!alreadySelected.has(feature.getId())) {
            selFeatures.push(feature);
            alreadySelected.add(feature.getId());
            feature.setStyle(selectionStyleFunction(feature));
          }
        });
      });

      syncSelectionToStore();
    });

    map.addInteraction(dragBoxInteraction);
    map.addInteraction(selectInteraction);
  };

  const setSelectionActive = (active) => {
    if (selectInteraction) selectInteraction.setActive(active);
    if (dragBoxInteraction) dragBoxInteraction.setActive(active);
    if (!active) selectionStore.clearSelection();
  };

  const cleanupSelection = () => {
    if (dragBoxInteraction) { map.removeInteraction(dragBoxInteraction); dragBoxInteraction = null; }
    if (selectInteraction) { map.removeInteraction(selectInteraction); selectInteraction = null; }
  };

  const getSelectInteraction = () => selectInteraction;

  return { setupSelection, setSelectionActive, getSelectInteraction, cleanupSelection };
}
