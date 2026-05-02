import * as THREE from 'three';
import { storeToRefs } from 'pinia';
import { useViewer3DStore } from '@/stores/viewer3D/viewer3dStore';

/**
 * @param {Object} ctx
 * @param {Function} ctx.emit
 */
export function useMarkers3D({ emit }) {
  const viewer3DStore = useViewer3DStore();
  const { scene } = storeToRefs(viewer3DStore);

  const parseMarkersXML = (xmlText, fileName) => {
    const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    if (doc.querySelector('parsererror')) {
      throw new Error('Invalid XML file — could not parse.');
    }

    const markerElements = Array.from(doc.querySelectorAll('marker'));
    const markers = [];

    for (const el of markerElements) {
      if (el.getAttribute('enabled') === 'false') continue;
      const label = el.getAttribute('label') || `Marker ${el.getAttribute('id')}`;
      const ref = el.querySelector('reference');
      if (!ref || ref.getAttribute('enabled') === 'false') continue;

      const x = parseFloat(ref.getAttribute('x'));
      const y = parseFloat(ref.getAttribute('y'));
      const z = parseFloat(ref.getAttribute('z'));
      if (isNaN(x) || isNaN(y) || isNaN(z)) continue;

      markers.push({ label, x, y, z });
    }

    if (markers.length === 0) {
      throw new Error('No enabled markers found in the file.');
    }

    const xs = markers.map(m => m.x);
    const ys = markers.map(m => m.y);
    const zs = markers.map(m => m.z);
    const dx = Math.max(...xs) - Math.min(...xs);
    const dy = Math.max(...ys) - Math.min(...ys);
    const dz = Math.max(...zs) - Math.min(...zs);
    const diagonal = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const flagH = Math.max(10, diagonal / 50);

    const POLE_COLOR = 0xdddddd;
    const FLAG_COLOR = 0xe63946;

    const group = new THREE.Group();
    group.name = fileName;
    group.userData.type = 'markers';
    group.userData.markerCount = markers.length;

    for (const m of markers) {
      const flagGroup = new THREE.Group();
      flagGroup.position.set(m.x, m.y, m.z);
      flagGroup.rotation.x = -Math.PI / 2;
      flagGroup.name = m.label;

      const poleGeo = new THREE.CylinderGeometry(flagH * 0.015, flagH * 0.015, flagH, 6);
      const poleMat = new THREE.MeshBasicMaterial({ color: POLE_COLOR });
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.y = flagH / 2;
      flagGroup.add(pole);

      const fw = flagH * 0.55;
      const fh = flagH * 0.35;
      const flagGeo = new THREE.BufferGeometry();
      flagGeo.setAttribute('position', new THREE.Float32BufferAttribute([
        0,       flagH,        0,
        fw,      flagH - fh * 0.4, 0,
        0,       flagH - fh,   0,
      ], 3));
      flagGeo.setIndex([0, 1, 2, 0, 2, 1]);
      flagGeo.computeVertexNormals();
      const flagMat = new THREE.MeshBasicMaterial({ color: FLAG_COLOR, side: THREE.DoubleSide });
      flagGroup.add(new THREE.Mesh(flagGeo, flagMat));

      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 56;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = 'rgba(255,255,255,0.88)';
      ctx.beginPath();
      ctx.roundRect(3, 3, canvas.width - 6, canvas.height - 6, 7);
      ctx.fill();
      ctx.fillStyle = '#222';
      ctx.font = 'bold 22px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(m.label, canvas.width / 2, canvas.height / 2);
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas) })
      );
      sprite.position.set(fw * 0.5, flagH * 1.25, 0);
      sprite.scale.set(flagH * 1.4, flagH * 0.32, 1);
      flagGroup.add(sprite);

      group.add(flagGroup);
    }

    scene.value.add(group);
    emit('model-loaded', { url: fileName, index: 0, object: group });
  };

  const loadMarkersFile = (file) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        parseMarkersXML(e.target.result, file.name);
      } catch (err) {
        emit('loading-error', { url: file.name, error: err.message });
      }
    };

    reader.onerror = () => {
      emit('loading-error', { url: file.name, error: 'Failed to read file' });
    };

    reader.readAsText(file);
  };

  return { loadMarkersFile, parseMarkersXML };
}
