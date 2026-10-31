import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { player } from '../game/fx';
import { fbm, mulberry32, noise2, smoothstep } from '../game/noise';
import { BIOMES, ISLANDS, edgeT, islandHeight, radiusAt, randomSpot, topAt, type IslandDef } from '../game/world';
import { surface } from './materials';
import { natural, REALISTIC } from './quality';
import { terrainPhoto } from './photoTextures';
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
    // Realistic mode: photo-scanned maps arrive asynchronously and take over (uPhoto = 1).
    Object.assign(shader.uniforms, terrainPhoto);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNorm;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWNorm = normalize(mat3(modelMatrix) * objectNormal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D tGrass; uniform sampler2D tRock;
        uniform sampler2D tGrassPhoto; uniform sampler2D tRockPhoto; uniform float uPhoto;
        varying vec3 vWPos; varying vec3 vWNorm;
        vec3 triplanar(sampler2D t, vec3 p, vec3 w, float s) {
          return texture2D(t, p.zy * s).rgb * w.x + texture2D(t, p.xz * s).rgb * w.y + texture2D(t, p.xy * s).rgb * w.z;
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 bw = pow(abs(vWNorm), vec3(4.0));
        bw /= (bw.x + bw.y + bw.z);
        float flatness = smoothstep(0.55, 0.8, vWNorm.y);
        if (uPhoto > 0.5) {
          // Two scales blended to break up visible tiling; vertex colour keeps a hint of each biome.
          vec3 grass = mix(texture2D(tGrassPhoto, vWPos.xz * 0.12).rgb, texture2D(tGrassPhoto, vWPos.xz * 0.031 + 0.37).rgb, 0.35);
          vec3 rock = mix(triplanar(tRockPhoto, vWPos, bw, 0.1), triplanar(tRockPhoto, vWPos, bw, 0.027), 0.35);
          vec3 photo = mix(rock, grass, flatness);
          // Slight green lift: the scanned meadow reads olive/yellow under the warm sun.
          diffuseColor.rgb = photo * mix(vec3(1.0), diffuseColor.rgb * 2.4, 0.3) * mix(vec3(1.0), vec3(0.86, 1.0, 0.8), flatness);
        } else {
          vec3 rock = triplanar(tRock, vWPos, bw, 0.18);
          vec3 grass = texture2D(tGrass, vWPos.xz * 0.3).rgb;
          diffuseColor.rgb *= mix(rock, grass, flatness) * 1.18;
        }`,
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

/**
 * Realistic tuft: 8 thin, tapered, curved blades (3 segments each) with dark
 * roots and sun-bleached tips. Normals lean upward so the field lights evenly.
 */
function realisticTuftGeometry(): THREE.BufferGeometry {
  const rnd = mulberry32(7);
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const SEG = 3;
  for (let b = 0; b < 8; b++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * 0.14;
    const bx = Math.cos(a) * r;
    const bz = Math.sin(a) * r;
    const face = rnd() * Math.PI * 2;
    const fx = Math.cos(face);
    const fz = Math.sin(face);
    const h = 0.22 + rnd() * 0.3;
    const w = 0.012 + rnd() * 0.01;
    const bend = 0.08 + rnd() * 0.16;
    const nx = -fz * 0.4;
    const nz = fx * 0.4;
    const nl = Math.hypot(nx, 1, nz);
    const base = pos.length / 3;
    for (let s = 0; s <= SEG; s++) {
      const t = s / SEG;
      const y = h * t;
      const off = bend * t * t;
      const half = w * (1 - t * 0.92);
      const cx = bx + Math.cos(a) * off;
      const cz = bz + Math.sin(a) * off;
      pos.push(cx - fx * half, y, cz - fz * half, cx + fx * half, y, cz + fz * half);
      for (let k = 0; k < 2; k++) nor.push(nx / nl, 1 / nl, nz / nl);
      const shade = 0.3 + 0.62 * t;
      const tip = t > 0.85 ? (t - 0.85) * 0.8 : 0;
      for (let k = 0; k < 2; k++) col.push(shade + tip * 0.25, shade + tip * 0.2, shade * 0.8);
    }
    for (let s = 0; s < SEG; s++) {
      const i = base + s * 2;
      idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

/** Realistic flower: thin stem with a small daisy-like head. */
function realisticFlowerGeometry(): THREE.BufferGeometry {
  const stem = new THREE.CylinderGeometry(0.004, 0.005, 0.32, 4).translate(0, 0.16, 0);
  const head = new THREE.CylinderGeometry(0.03, 0.022, 0.008, 10).translate(0, 0.325, 0);
  return mergeGeometries([stem.toNonIndexed(), head.toNonIndexed()])!;
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

/** Grass is bucketed into square chunks so off-screen and distant chunks are skipped entirely. */
const CHUNK = 16;
/** Chunks whose centre is farther than this are hidden (fog hides the cut-off). */
const GRASS_RANGE = REALISTIC ? 80 : 140;
const dryTint = new THREE.Color('#b8a65a');

export function Grass() {
  const { chunks, flowers } = useMemo(() => {
    const tuftGeo = REALISTIC ? realisticTuftGeometry() : tuftGeometry();
    const flowerGeo = REALISTIC ? realisticFlowerGeometry() : new THREE.IcosahedronGeometry(0.09, 0).translate(0, 0.4, 0);
    const rng = mulberry32(42);
    const buckets = new Map<string, { m: THREE.Matrix4[]; c: THREE.Color[] }>();
    const fm: THREE.Matrix4[] = [];
    const fc: THREE.Color[] = [];
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    for (const isl of ISLANDS) {
      const pal = BIOMES[isl.biome];
      // Realistic mode: ~7x denser field of thin blades.
      const count = Math.floor(Math.PI * isl.radius * isl.radius * isl.grassDensity * (REALISTIC ? 7 : 1));
      // Living grass is a fairly saturated green; skip most of natural()'s muting for the blades.
      const ga = REALISTIC ? new THREE.Color(pal.grass[0]).offsetHSL(0.01, -0.12, -0.12) : natural(new THREE.Color(pal.grass[0]));
      const gb = REALISTIC ? new THREE.Color(pal.grass[1]).offsetHSL(-0.02, -0.1, -0.1) : natural(new THREE.Color(pal.grass[1]));
      for (let i = 0; i < count; i++) {
        const p = randomSpot(isl, rng, 0.9);
        const y = islandHeight(isl, p.x, p.z);
        if (y === null || edgeT(isl, p.x, p.z) > 0.9) continue;
        const s = REALISTIC ? 0.75 + rng() * 0.6 : 0.55 + rng() * 0.5;
        q.setFromAxisAngle(up, rng() * Math.PI * 2);
        const key = `${Math.floor(p.x / CHUNK)},${Math.floor(p.z / CHUNK)}`;
        let b = buckets.get(key);
        if (!b) buckets.set(key, (b = { m: [], c: [] }));
        b.m.push(new THREE.Matrix4().compose(new THREE.Vector3(p.x, y - 0.05, p.z), q, new THREE.Vector3(s, s, s)));
        const col = ga.clone().lerp(gb, rng());
        // Realistic meadows have natural lush and sun-dried patches.
        if (REALISTIC) col.lerp(dryTint, Math.max(0, fbm(p.x * 0.045 + 31, p.z * 0.045 - 17, 3)) * 0.7);
        b.c.push(col);
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
      // Bounds over all instances so the renderer can frustum-cull the whole chunk.
      im.computeBoundingSphere();
      return im;
    };
    const chunks = [...buckets.values()].map((b) => {
      const mesh = make(tuftGeo, grassMaterial, b.m, b.c);
      return { mesh, center: mesh.boundingSphere!.center.clone() };
    });
    return { chunks, flowers: make(flowerGeo, flowerMaterial, fm, fc) };
  }, []);

  useFrame(() => {
    const p = player.pos;
    for (const c of chunks) {
      const dx = c.center.x - p.x;
      const dz = c.center.z - p.z;
      c.mesh.visible = dx * dx + dz * dz < GRASS_RANGE * GRASS_RANGE;
    }
  });

  return (
    <>
      {chunks.map((c, i) => (
        <primitive key={i} object={c.mesh} />
      ))}
      <primitive object={flowers} />
    </>
  );
}
