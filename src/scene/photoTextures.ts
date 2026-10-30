import * as THREE from 'three';
import { eachCachedSurface, pieceMaterials } from './materials';
import { REALISTIC } from './quality';
import { barkDetail, rockDetail } from './textures';

/**
 * Realistic mode only: swap the procedural textures for CC0 photo-scanned sets
 * from Poly Haven (fetched into public/assets/ph by scripts/fetch-assets.sh).
 * Everything loads asynchronously and patches live materials; if the files are
 * missing the game simply keeps its procedural textures.
 */

const DIR = `${import.meta.env.BASE_URL}assets/ph/`;
const loader = new THREE.TextureLoader();

interface PhotoSet {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
}

function load(name: string, repeat: number): Promise<PhotoSet> {
  const one = (suffix: string, srgb: boolean) =>
    loader.loadAsync(`${DIR}${name}_${suffix}.jpg`).then((t) => {
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeat, repeat);
      t.anisotropy = 16;
      return t;
    });
  return Promise.all([one('diff', true), one('nor_gl', false), one('rough', false)]).then(([map, normalMap, roughnessMap]) => ({
    map,
    normalMap,
    roughnessMap,
  }));
}

function apply(m: THREE.Material, set: PhotoSet, tint: string, normalScale = 1) {
  if (!(m instanceof THREE.MeshStandardMaterial)) return;
  m.map = set.map;
  m.normalMap = set.normalMap;
  m.normalScale.set(normalScale, normalScale);
  m.roughnessMap = set.roughnessMap;
  m.roughness = 1;
  m.color.set(tint);
  m.needsUpdate = true;
}

/** Terrain shader uniforms (see Islands.tsx): photo maps replace the procedural detail when ready. */
export const terrainPhoto = {
  tGrassPhoto: { value: null as THREE.Texture | null },
  tRockPhoto: { value: null as THREE.Texture | null },
  uPhoto: { value: 0 },
};

let started = false;

export function loadPhotoTextures() {
  if (!REALISTIC || started) return;
  started = true;
  const warn = (what: string) => () => console.warn(`[realms] photo textures for ${what} unavailable — run scripts/fetch-assets.sh`);

  load('aerial_grass_rock', 1)
    .then((grass) =>
      load('rocky_terrain_02', 1).then((rock) => {
        terrainPhoto.tGrassPhoto.value = grass.map;
        terrainPhoto.tRockPhoto.value = rock.map;
        terrainPhoto.uPhoto.value = 1;
        // Boulders and ore rocks share the procedural rock detail map.
        eachCachedSurface((m) => {
          if (m.map === rockDetail) apply(m, rock, '#b8b2aa', 1.2);
        });
      }),
    )
    .catch(warn('terrain'));

  load('bark_brown_02', 1)
    .then((bark) =>
      eachCachedSurface((m) => {
        if (m.map === barkDetail) apply(m, bark, '#d8c8b8', 1.4);
      }),
    )
    .catch(warn('bark'));

  load('weathered_planks', 1).then((s) => apply(pieceMaterials.wood, s, '#ffffff', 1.3)).catch(warn('wood'));
  load('castle_brick_07', 1).then((s) => apply(pieceMaterials.stone, s, '#ffffff', 1.3)).catch(warn('stone'));
  load('metal_plate', 1)
    .then((s) => {
      apply(pieceMaterials.copper, s, '#e0905e', 1.2);
      const m = pieceMaterials.copper;
      if (m instanceof THREE.MeshStandardMaterial) m.metalness = 0.9;
    })
    .catch(warn('copper'));
}
