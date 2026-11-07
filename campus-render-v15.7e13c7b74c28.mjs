/**
 * Campus surface refinement only.  Positions, indices, transforms, hierarchy,
 * footprint outlines and circulation topology are never changed here.
 *
 * Build: run after the existing neutral-albedo/UV pass, before GLTF export.
 * Browser: run after GLTF parsing, before storing n.userData.material baselines.
 * Ground maps are still embedded by embed-materials.py.  The only runtime-only
 * asset is a small deterministic water normal, requiring no request or timer.
 */
import * as THREE from 'three';

const REVISION = 'campus-surfaces-v15';
let waterMicroNormal;

function physicalFrom(source) {
  if (source.isMeshPhysicalMaterial) return source.clone();
  const result = new THREE.MeshPhysicalMaterial();
  // MeshPhysicalMaterial.copy requires physical-only members on its source.
  // Copying the standard portion explicitly preserves maps, alpha and side.
  THREE.MeshStandardMaterial.prototype.copy.call(result, source);
  result.defines = { STANDARD: '', PHYSICAL: '' };
  return result;
}

function stableUnit(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0) / 4294967295;
}

function makeWaterMicroNormal() {
  if (waterMicroNormal) return waterMicroNormal;
  const size = 256, pixels = new Uint8Array(size * size * 4);
  // Integer wave numbers make every boundary periodic.  Multiple directions,
  // amplitudes and wavelengths avoid a regular corrugated or concentric look.
  const waves = [[7, 2, .028, .42], [11, 5, .018, 1.7], [-3, 9, .016, 2.8],
    [19, 7, .010, .9], [5, -16, .009, 2.1], [27, 13, .005, 4.2], [-14, 23, .005, 5.7]];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let sx = 0, sy = 0;
    for (const [kx, ky, amplitude, phase] of waves) {
      const wave = Math.cos(2 * Math.PI * (kx * x + ky * y) / size + phase);
      const length = Math.hypot(kx, ky);
      sx += amplitude * kx / length * wave;
      sy += amplitude * ky / length * wave;
    }
    const length = Math.hypot(sx, sy, 1), i = (y * size + x) * 4;
    pixels[i] = Math.round(127.5 * (1 - sx / length));
    pixels[i + 1] = Math.round(127.5 * (1 - sy / length));
    pixels[i + 2] = Math.round(127.5 * (1 + 1 / length));
    pixels[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.name = 'Campus_Water_Small_Wind_Ripples_V15';
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  // Hydro UVs are world XZ / 6 m: each ripple tile covers 3 m of water.
  texture.repeat.set(2, 2);
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  waterMicroNormal = texture;
  return texture;
}

function buildingOf(mesh, buildings) {
  let ancestor = mesh;
  while (ancestor) {
    if (buildings.has(ancestor.userData?.id)) return buildings.get(ancestor.userData.id);
    ancestor = ancestor.parent;
  }
  return null;
}

function roleFor(mesh, material, building) {
  const name = (material.name || '').toLowerCase(), part = mesh.name.toLowerCase();
  if (name.startsWith('sign_')) return 'sign';
  if (name === 'tex_turf') return 'turf';
  if (name === 'tex_asphalt') return 'asphalt';
  if (name === 'tex_paving') return 'paving';
  if (/campuswater|canal-water/.test(name) || /complete-internal-channel-water|reference-lake-water/.test(part)) return 'water';
  if (/glass|glazing|transparent_door/.test(name) || building && /glazing|glazed-entrance|transparent-door-leaves|recessed-window|source-aligned-glass|front-window/.test(part) && !/mullion|frame/.test(part)) return 'glass';
  if (/riverbank|shore-stone|fine_concrete_kerb|campus-kerb-concrete|gate-pale-stone|light-mineral-panels|grey_entrance_stone|stepped-concrete/.test(name)) return 'stone';
  if (/silver_standing_seam_roof/.test(name)) return /gym-.*roof/.test(part) ? 'metal-roof' : /roof/.test(part) ? 'mineral-roof' : 'metal';
  if (/aluminium|brushed_steel|mullions|railing|metal-fence|dark_railing/.test(name)) return 'metal';
  if (/sunshade|bronze|gold|sign|fascia|rubber|car_paint|marking|foliage|bark|branch|spray|shrub|sports/.test(name)) return 'preserve';
  if (building && /roof/.test(part) && !/frame|window|mullion|post|beam|parapet|edge|rib|lintel/.test(part)) return 'mineral-roof';
  if (/ivory_mineral|pale_concrete|grey_lower_walls|grey_ground_storey/.test(name)) return 'mineral';
  if (building && /source-footprint-massing|wall|body|plinth|floor-band|parapet|eaves|frame-lintel/.test(part) && !/window|shadow|recess/.test(name)) return 'mineral';
  return 'preserve';
}

/** Refine native three.js materials; returns an audit count, never changes geometry. */
export function applyCampusRealism(root, data) {
  const buildings = new Map((data?.buildings || []).map(b => [b.id, b]));
  const runtime = typeof document !== 'undefined';
  const cache = new Map(), stats = { revision: REVISION, meshes: 0, materialSlots: 0,
    roles: {}, groundMapWorldMetres: { turf: 24, asphalt: 4, paving: 4 },
    runtimeWaterNormal: runtime, positionsChanged: false, topologyChanged: false };
  const refine = (mesh, source, building) => {
    if (!source?.isMeshStandardMaterial) return source;
    const role = roleFor(mesh, source, building);
    if (role === 'sign' || role === 'preserve') return source;
    const key = `${source.uuid}:${role}:${building?.id || ''}`;
    if (cache.has(key)) return cache.get(key);
    const physical = role === 'water' || role === 'glass';
    const material = physical ? physicalFrom(source) : source.clone();
    material.userData = { ...source.userData, campusSurfaceRevision: REVISION, surfaceRole: role };
    if (role === 'water') {
      material.name = 'CampusWater_Dielectric_V15';
      material.color.set('#405e58');
      material.metalness = 0;
      material.roughness = .24;
      material.ior = 1.333;
      material.clearcoat = 0;
      material.transmission = 0;
      material.thickness = 0;
      material.specularIntensity = 1;
      material.specularColor.set('#ffffff');
      material.envMapIntensity = 1.1;
      material.transparent = false;
      material.opacity = 1;
      if (runtime) {
        material.normalMap = makeWaterMicroNormal();
        material.normalScale.set(.72, .72);
      }
      material.userData.surfaceBasis = 'Opaque turbid canal water, single nonmetal dielectric interface; no foam or edge decals';
    } else if (role === 'glass') {
      const dark = /deep|dark|smoked/.test(source.name.toLowerCase());
      const transparentDoor = source.transparent && source.opacity < .9;
      material.color.set(transparentDoor ? '#9eafb0' : dark ? '#43575c' : '#586e73');
      if (building) material.color.multiplyScalar(1 + (stableUnit(building.id) - .5) * .035);
      material.metalness = 0;
      material.roughness = transparentDoor ? .12 : dark ? .22 : .17;
      material.ior = 1.5;
      material.clearcoat = 0;
      material.transmission = 0;
      material.specularIntensity = 1;
      material.specularColor.set('#ffffff');
      material.envMapIntensity = 1.15;
      material.emissive.set('#000000');
      material.emissiveIntensity = 0;
      material.userData.surfaceBasis = 'Dielectric glazing; facade panes retain an opaque unlit-interior proxy where no interior is modeled';
    } else if (['turf', 'asphalt', 'paving'].includes(role)) {
      material.color.set('#ffffff');
      material.metalness = 0;
      material.roughness = role === 'turf' ? .98 : role === 'asphalt' ? .9 : .88;
      material.normalScale.setScalar(role === 'turf' ? .18 : role === 'asphalt' ? .3 : .42);
      material.envMapIntensity = .7;
    } else if (role === 'metal-roof') {
      material.color.set('#949c9e');
      material.metalness = .65;
      material.roughness = .48;
      material.envMapIntensity = .85;
    } else if (role === 'mineral-roof') {
      material.color.set('#b5b5aa');
      material.metalness = 0;
      material.roughness = .9;
      material.envMapIntensity = .65;
    } else if (role === 'metal') {
      material.roughness = Math.max(.34, source.roughness);
      material.envMapIntensity = .9;
    } else {
      material.metalness = 0;
      material.roughness = role === 'stone' ? .91 : .86;
      material.envMapIntensity = .7;
      if (role === 'mineral') {
        if (/ivory_mineral/.test(source.name.toLowerCase())) material.color.set('#cbc9bf');
        else if (/pale_concrete/.test(source.name.toLowerCase())) material.color.set('#deddd5');
        else if (mesh.name.startsWith('source-footprint-massing')) material.color.set(building?.type === 'dormitory' ? '#c1bbaa' : '#c9c5b9');
        else if (mesh.name.startsWith('floor-bands-parapets-and-eaves')) material.color.set('#d0cfc7');
      }
    }
    material.needsUpdate = true;
    cache.set(key, material);
    stats.materialSlots++;
    stats.roles[role] = (stats.roles[role] || 0) + 1;
    return material;
  };
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    const building = buildingOf(mesh, buildings);
    const before = mesh.material;
    mesh.material = Array.isArray(before) ? before.map(m => refine(mesh, m, building)) : refine(mesh, before, building);
    if (Array.isArray(before) ? before.some((m, i) => m !== mesh.material[i]) : before !== mesh.material) stats.meshes++;
  });
  root.userData = { ...root.userData, surfaceRenderingRevision: REVISION };
  return stats;
}
