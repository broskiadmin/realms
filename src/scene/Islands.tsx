import { useMemo } from 'react';
import * as THREE from 'three';
import { fbm, mulberry32, noise2, smoothstep } from '../game/noise';
import { BIOMES, ISLANDS, edgeT, islandHeight, radiusAt, randomSpot, topAt, type IslandDef } from '../game/world';
import { surface } from './materials';
import { natural, REALISTIC } from './quality';
import { grassDetail, rockDetail } from './textures';

// Realistic mode doubles mesh resolution for smoother silhouettes and lighting.
const NR = REALISTIC ? 60 : 30; // rings on the grassy top
const NS = REALISTIC ? 240 : 120; // segments around
const NU = REALISTIC ? 36 : 18; // rings on the rocky underside

function buildIslandGeometry(isl: IslandDef): THREE.BufferGeometry {
  const pal = BIOMES[isl.biome];
  const grassA = natural(new THREE.Color(pal.grass[0]));
  const grassB = natural(new THREE.Color(pal.grass[1]));
  const dirt = natural(new THREE.Color(pal.dirt));
  const rockA = natural(new THREE.Color(pal.rock[0]));
  const rockB = natural(new THREE.Color(pal.rock[1]));
  const pos: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();

  for (let r = 0; r <= NR; r++) {
    const t = r / NR;
    for (let s = 0; s < NS; s++) {
      const a = (s / NS) * Math.PI * 2;
      const R = radiusAt(isl, a);
      const x = isl.cx + Math.cos(a) * R * t;
      const z = isl.cz + Math.sin(a) * R * t;
      pos.push(x, topAt(isl, x, z, t), z);
      c.copy(grassA).lerp(grassB, 0.5 + 0.5 * fbm(x * 0.08, z * 0.08, 2));
      c.lerp(dirt, smoothstep(0.93, 1, t));
      col.push(c.r, c.g, c.b);
    }
  }
  for (let k = 1; k <= NU; k++) {
    const u = k / NU;
    for (let s = 0; s < NS; s++) {
      const a = (s / NS) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const R = radiusAt(isl, a);
      const jag = 1 + 0.2 * noise2(ca * 2.2 + u * 3.1, sa * 2.2 + isl.seed * 5);
      const rf = Math.pow(1 - u, 0.75) * jag * (1 + 0.08 * Math.sin(u * Math.PI));
      const y = isl.baseY - 0.7 - isl.depth * Math.pow(u, 1.2) + (u < 1 ? noise2(ca * 3 + 9, sa * 3 + u * 6) * 0.8 : 0);
      pos.push(isl.cx + ca * R * rf, y, isl.cz + sa * R * rf);
      if (u < 0.1) {
        c.copy(dirt);
      } else {
        const band = Math.floor((y - isl.baseY) * 0.7) & 1;
        c.copy(band ? rockA : rockB).multiplyScalar(1 - 0.35 * u);
      }
      col.push(c.r, c.g, c.b);
    }
  }

  const rows = NR + 1 + NU;
  const idx: number[] = [];
  for (let i = 0; i < rows - 1; i++) {
    for (let s = 0; s < NS; s++) {
      const a = i * NS + s;
      const b = i * NS + ((s + 1) % NS);
      const cc = (i + 1) * NS + s;
      const d = (i + 1) * NS + ((s + 1) % NS);
      idx.push(a, b, cc, b, d, cc);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/**
 * Island terrain: vertex colours carry the palette; a triplanar detail pass
 * (grass on flat ground, rock on cliffs) adds texture without UVs or stretching.
 */
const islandMaterial = (() => {
  const m = surface({ vertexColors: true, roughness: 0.95 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.tGrass = { value: grassDetail };
    shader.uniforms.tRock = { value: rockDetail };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNorm;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWNorm = normalize(mat3(modelMatrix) * objectNormal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tGrass;\nuniform sampler2D tRock;\nvarying vec3 vWPos;\nvarying vec3 vWNorm;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 bw = pow(abs(vWNorm), vec3(4.0));
        bw /= (bw.x + bw.y + bw.z);
        vec3 rock = texture2D(tRock, vWPos.zy * 0.18).rgb * bw.x
                  + texture2D(tRock, vWPos.xz * 0.18).rgb * bw.y
                  + texture2D(tRock, vWPos.xy * 0.18).rgb * bw.z;
        vec3 grass = texture2D(tGrass, vWPos.xz * 0.3).rgb;
        float flatness = smoothstep(0.55, 0.8, vWNorm.y);
        diffuseColor.rgb *= mix(rock, grass, flatness) * 1.18;`,
      );
  };
  return m;
})();

export function Islands() {
  const geos = useMemo(() => ISLANDS.map(buildIslandGeometry), []);
  return (
    <>
      {ISLANDS.map((isl, i) => (
        <mesh key={isl.id} geometry={geos[i]} material={islandMaterial} receiveShadow castShadow userData={{ kind: 'island', id: isl.id }} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Wind-swept grass tufts + flowers (decor only — not raycast targets).

function tuftGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const blades = 5;
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI + Math.random() * 0.4;
    const lean = 0.12 + Math.random() * 0.1;
    const w = 0.07;
    const h = 0.45 + Math.random() * 0.3;
    const dx = Math.cos(a) * w;
    const dz = Math.sin(a) * w;
    const ox = Math.cos(a + Math.PI / 2) * 0.08 * (i - 2);
    const oz = Math.sin(a + Math.PI / 2) * 0.08 * (i - 2);
    pos.push(ox - dx, 0, oz - dz, ox + dx, 0, oz + dz, ox + Math.cos(a + 1.57) * lean, h, oz + Math.sin(a + 1.57) * lean);
    const root = REALISTIC ? 0.75 : 0.55;
    col.push(root, root, root, root, root, root, 1.25, 1.25, 1.15);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  return g;
}

export const windUniform = { value: 0 };

function windMaterial(opts: THREE.MeshLambertMaterialParameters, strength: number): THREE.Material {
  // Realistic mode uses PBR so grass picks up the sky's image-based light (Lambert ignores it and goes murky).
  const m = REALISTIC ? new THREE.MeshStandardMaterial({ ...opts, roughness: 0.9, metalness: 0 }) : new THREE.MeshLambertMaterial(opts);
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 wpos = modelMatrix * instanceMatrix * vec4(position, 1.0);
        float sway = position.y * position.y * ${strength.toFixed(2)};
        transformed.x += sin(uTime * 1.8 + wpos.x * 0.35 + wpos.z * 0.15) * sway;
        transformed.z += cos(uTime * 1.3 + wpos.z * 0.3) * sway * 0.6;`,
      );
  };
  return m;
}

const grassMaterial = windMaterial({ vertexColors: true, side: THREE.DoubleSide }, 0.6);
const flowerMaterial = windMaterial({}, 0.4);

const FLOWER_COLORS = ['#ffffff', '#ffe066', '#ff8fc7', '#c39bff', '#ff7b54'];

export function Grass() {
  const { tufts, flowers } = useMemo(() => {
    const tuftGeo = tuftGeometry();
    const flowerGeo = new THREE.IcosahedronGeometry(0.09, 0);
    flowerGeo.translate(0, 0.4, 0);
    const rng = mulberry32(42);
    const tm: THREE.Matrix4[] = [];
    const tc: THREE.Color[] = [];
    const fm: THREE.Matrix4[] = [];
    const fc: THREE.Color[] = [];
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    for (const isl of ISLANDS) {
      const pal = BIOMES[isl.biome];
      // Realistic mode: ~3.5x denser, slightly taller grass.
      const count = Math.floor(Math.PI * isl.radius * isl.radius * isl.grassDensity * (REALISTIC ? 3.5 : 1));
      const ga = natural(new THREE.Color(pal.grass[0]));
      const gb = natural(new THREE.Color(pal.grass[1]));
      for (let i = 0; i < count; i++) {
        const p = randomSpot(isl, rng, 0.9);
        const y = islandHeight(isl, p.x, p.z);
        if (y === null || edgeT(isl, p.x, p.z) > 0.9) continue;
        const s = (0.55 + rng() * 0.5) * (REALISTIC ? 1.25 : 1);
        q.setFromAxisAngle(up, rng() * Math.PI * 2);
        tm.push(new THREE.Matrix4().compose(new THREE.Vector3(p.x, y - 0.05, p.z), q, new THREE.Vector3(s, s, s)));
        tc.push(ga.clone().lerp(gb, rng()));
        if (pal.flowers && rng() < 0.06) {
          fm.push(new THREE.Matrix4().compose(new THREE.Vector3(p.x + 0.15, y - 0.05, p.z), q, new THREE.Vector3(1, 0.8 + rng() * 0.5, 1)));
          fc.push(natural(new THREE.Color(FLOWER_COLORS[Math.floor(rng() * FLOWER_COLORS.length)])));
        }
      }
    }
    const make = (g: THREE.BufferGeometry, mat: THREE.Material, ms: THREE.Matrix4[], cs: THREE.Color[]) => {
      const im = new THREE.InstancedMesh(g, mat, ms.length);
      ms.forEach((m, i) => im.setMatrixAt(i, m));
      cs.forEach((c, i) => im.setColorAt(i, c));
      im.instanceMatrix.needsUpdate = true;
      im.frustumCulled = false;
      return im;
    };
    return {
      tufts: make(tuftGeo, grassMaterial, tm, tc),
      flowers: make(flowerGeo, flowerMaterial, fm, fc),
    };
  }, []);
  return (
    <>
      <primitive object={tufts} />
      <primitive object={flowers} />
    </>
  );
}
