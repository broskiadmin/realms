import * as THREE from 'three';
import { natural, REALISTIC } from './quality';
import { copperTex, stoneTex, woodTex } from './textures';

/** Four-band ramp for MeshToonMaterial — gives the chunky cel-shaded look. */
export const toonRamp = (() => {
  const data = new Uint8Array([70, 140, 205, 255]);
  const tex = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
})();

/** Either shading model — both expose colour, emissive, maps and opacity. */
export type Surface = THREE.MeshToonMaterial | THREE.MeshStandardMaterial;

export interface SurfaceParams {
  color?: THREE.ColorRepresentation;
  map?: THREE.Texture | null;
  normalMap?: THREE.Texture;
  normalScale?: number;
  vertexColors?: boolean;
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
  side?: THREE.Side;
  transparent?: boolean;
  depthTest?: boolean;
  /** Physically based only. */
  roughness?: number;
  metalness?: number;
}

/**
 * The one place materials are made: cel-shaded toon normally, physically based
 * (with the palette pulled toward natural tones) in Realistic mode.
 */
export function surface(p: SurfaceParams): Surface {
  const color = natural(new THREE.Color(p.color ?? '#ffffff'));
  const common = {
    color,
    map: p.map ?? null,
    normalMap: p.normalMap ?? null,
    normalScale: new THREE.Vector2(p.normalScale ?? 1, p.normalScale ?? 1),
    vertexColors: p.vertexColors ?? false,
    emissive: new THREE.Color(p.emissive ?? '#000000'),
    emissiveIntensity: p.emissiveIntensity ?? 1,
    side: p.side ?? THREE.FrontSide,
    transparent: p.transparent ?? false,
    depthTest: p.depthTest ?? true,
  };
  return REALISTIC
    ? new THREE.MeshStandardMaterial({ ...common, roughness: p.roughness ?? 0.85, metalness: p.metalness ?? 0 })
    : new THREE.MeshToonMaterial({ ...common, gradientMap: toonRamp });
}

const toonCache = new Map<string, Surface>();

/**
 * Shared material per colour (+ optional glow and greyscale detail map),
 * so hundreds of props reuse a handful of materials.
 */
export function toon(color: string, glow = 0, detail?: THREE.Texture): Surface {
  const key = `${color}|${glow}|${detail?.uuid ?? ''}`;
  let m = toonCache.get(key);
  if (!m) {
    m = surface({
      color,
      map: detail ?? null,
      emissive: glow > 0 ? color : '#000000',
      emissiveIntensity: glow,
    });
    if (detail) {
      // Detail maps average ~0.8 grey; brighten so textured props keep their palette.
      m.color.multiplyScalar(1.22);
    }
    toonCache.set(key, m);
  }
  return m;
}

export const pieceMaterials = {
  wood: surface({ ...woodTex, normalScale: 1.1, roughness: 0.8 }),
  stone: surface({ ...stoneTex, normalScale: 1.1, roughness: 0.92 }),
  copper: surface({ ...copperTex, normalScale: 1.1, roughness: 0.38, metalness: 0.75 }),
};

/** Shared low-poly geometries. */
export const geo = {
  trunk: new THREE.CylinderGeometry(0.22, 0.34, 2.6, 8),
  blob: new THREE.IcosahedronGeometry(1, 1),
  cone: new THREE.ConeGeometry(1, 1.7, 9),
  rock: [
    new THREE.DodecahedronGeometry(1, 0),
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.DodecahedronGeometry(1, 1),
  ],
  crystal: new THREE.OctahedronGeometry(0.35, 0),
  box: new THREE.BoxGeometry(1, 1, 1),
};
