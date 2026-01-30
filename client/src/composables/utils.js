// client/src/composables/utils.js
import { Style, Icon } from "ol/style";

export function capitalize(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function formatKey(key) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

// Helper to generate a unique ID
export const generateUUID = () => {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// Create an OpenLayers Style from an SVG string
export const createPinStyle = (color) => {
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32">
    <path fill="${color}" stroke="white" stroke-width="1.5"
      d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
    <circle cx="12" cy="9" r="2.5" fill="white"/>
  </svg>`;

  const encodedSvg = encodeURIComponent(svg);

  return new Style({
    image: new Icon({
      anchor: [0.5, 1], // Bottom center
      src: `data:image/svg+xml;charset=utf-8,${encodedSvg}`,
      scale: 1,
    }),
  });
};
