import { useMemo } from 'react';
import { createNoise3D } from 'simplex-noise';
import * as THREE from 'three';
import { mulberry32 } from '../game/noise';
import { BIOMES, ISLANDS, type ResourceNode } from '../game/world';
import { windUniform } from './Islands';
import { toon } from './materials';
import { barkDetail } from './textures';

/**
 * Realistic-mode vegetation: trees made of a displaced trunk, real branches and
 * hundreds of alpha-tested leaf/needle cards, plus noise-sculpted boulders.
 */

// ---------------------------------------------------------------------------
// Card textures (drawn once, transparent background)

function cardTexture(draw: (g: CanvasRenderingContext2D, s: number, rnd: () => number) => void, seed: number): THREE.CanvasTexture {
  const s = 512;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  draw(c.getContext('2d')!, s, mulberry32(seed));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** A cluster of broad leaves on thin twigs. Greyscale-green so instance colours can tint per biome. */
const leafCard = cardTexture((g, s, rnd) => {
  g.strokeStyle = 'rgba(70,52,34,0.9)';
  g.lineWidth = 4;
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    g.moveTo(s / 2, s * 0.95);
    g.quadraticCurveTo(s / 2 + (rnd() - 0.5) * s * 0.3, s * 0.6, s * (0.15 + rnd() * 0.7), s * (0.1 + rnd() * 0.5));
    g.stroke();
  }
  for (let i = 0; i < 70; i++) {
    const x = s * (0.12 + rnd() * 0.76);
    const y = s * (0.06 + rnd() * 0.72);
    const len = s * (0.06 + rnd() * 0.05);
    const rot = rnd() * Math.PI * 2;
    const l = 30 + rnd() * 26;
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.fillStyle = `hsl(${95 + rnd() * 25}, ${45 + rnd() * 20}%, ${l}%)`;
    g.beginPath();
    g.moveTo(-len, 0);
    g.quadraticCurveTo(0, -len * 0.45, len, 0);
    g.quadraticCurveTo(0, len * 0.45, -len, 0);
    g.fill();
    g.strokeStyle = `hsla(90, 40%, ${l + 14}%, 0.6)`;
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(-len * 0.9, 0);
    g.lineTo(len * 0.9, 0);
    g.stroke();
    g.restore();
  }
}, 31);

/** A drooping conifer branch: central twig with dense needle strokes. */
const needleCard = cardTexture((g, s, rnd) => {
  for (let b = 0; b < 3; b++) {
    const x0 = s * (0.3 + b * 0.2);
    g.strokeStyle = 'rgba(80,58,38,0.95)';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(x0, s * 0.02);
    g.lineTo(x0 + (rnd() - 0.5) * 30, s * 0.98);
    g.stroke();
    for (let i = 0; i < 260; i++) {
      const t = rnd();
      const x = x0 + (rnd() - 0.5) * 12;
      const y = s * (0.03 + t * 0.94);
      const side = rnd() < 0.5 ? -1 : 1;
      const len = s * (0.05 + (1 - Math.abs(t - 0.45)) * 0.07) * (0.6 + rnd() * 0.5);
      g.strokeStyle = `hsl(${120 + rnd() * 25}, ${35 + rnd() * 20}%, ${18 + rnd() * 18}%)`;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + side * len, y + len * 0.55);
      g.stroke();
    }
  }
}, 32);

function cardMaterial(map: THREE.Texture, sway: number): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ map, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75, metalness: 0 });
  // Gentle wind: each card flutters with its own phase (from its instance position), more at the tip.
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniform;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vec3 ip = instanceMatrix[3].xyz;
      float ph = ip.x * 1.7 + ip.y * 2.3 + ip.z * 1.3;
      transformed.x += sin(uTime * 2.1 + ph) * ${sway.toFixed(3)} * position.y;
      transformed.z += cos(uTime * 1.7 + ph) * ${sway.toFixed(3)} * position.y;`,
    );
  };
  return m;
}
const leafMat = cardMaterial(leafCard, 0.07);
const needleMat = cardMaterial(needleCard, 0.03);

// Card quad pivots at its base so cards hang off branch tips naturally.
const cardGeo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);

// ---------------------------------------------------------------------------
// Trunk + branch geometry

const noise3 = createNoise3D(mulberry32(5150));

/** Tapered, gnarled cylinder with a flared base; radius r0 at the bottom. */
function trunkGeometry(height: number, r0: number, r1: number, seed: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r1, r0, height, 14, 10, false).translate(0, height / 2, 0);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const t = y / height;
    const flare = 1 + Math.max(0, 0.18 - t) * 3.2;
    const gnarl = 1 + 0.12 * noise3(x * 3 + seed, y * 1.4, z * 3);
    const sway = Math.sin(t * 2.4 + seed) * 0.12 * t;
    p.setXYZ(i, x * flare * gnarl + sway, y, z * flare * gnarl);
  }
  g.computeVertexNormals();
  return g;
}

const branchGeo = new THREE.CylinderGeometry(0.035, 0.08, 1, 7).translate(0, 0.5, 0);

interface TreeBuild {
  trunk: THREE.BufferGeometry;
  branches: THREE.Matrix4[];
  cards: THREE.InstancedMesh;
}

function hashSeed(id: string): number {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

function buildBroadleaf(n: ResourceNode, tint: THREE.Color[]): TreeBuild {
  const rnd = mulberry32(hashSeed(n.id));
  const h = 3.4 + rnd() * 1.4;
  const trunk = trunkGeometry(h, 0.32, 0.17, rnd() * 10);
  const branches: THREE.Matrix4[] = [];
  const tips: THREE.Vector3[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const nb = 6 + Math.floor(rnd() * 3);
  for (let i = 0; i < nb; i++) {
    const y = h * (0.55 + rnd() * 0.4);
    const yaw = (i / nb) * Math.PI * 2 + rnd() * 0.6;
    const tilt = 0.6 + rnd() * 0.5;
    const len = 1.2 + rnd() * 1.1;
    e.set(0, yaw, -tilt, 'YXZ');
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(0, y, 0), q, new THREE.Vector3(1, len, 1));
    branches.push(m.clone());
    tips.push(new THREE.Vector3(0, len, 0).applyQuaternion(q).add(new THREE.Vector3(0, y, 0)));
  }
  tips.push(new THREE.Vector3(0, h + 0.4, 0));
  const count = 190;
  const cards = new THREE.InstancedMesh(cardGeo, leafMat, count);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const tip = tips[i % tips.length];
    const pos = tip.clone().add(new THREE.Vector3((rnd() - 0.5) * 2.2, (rnd() - 0.3) * 1.6, (rnd() - 0.5) * 2.2));
    e.set((rnd() - 0.5) * 1.6, rnd() * Math.PI * 2, (rnd() - 0.5) * 1.6);
    const s = 1.0 + rnd() * 0.7;
    cards.setMatrixAt(i, m.compose(pos, q.setFromEuler(e), new THREE.Vector3(s, s, s)));
    // Inner leaves are darker (self-shadowed crown).
    const inner = 1 - Math.min(1, pos.distanceTo(new THREE.Vector3(0, h, 0)) / 3);
    cards.setColorAt(i, c.copy(tint[i % tint.length]).multiplyScalar(1.15 - inner * 0.45));
  }
  cards.castShadow = true;
  cards.receiveShadow = true;
  return { trunk, branches, cards };
}

function buildPine(n: ResourceNode, tint: THREE.Color[]): TreeBuild {
  const rnd = mulberry32(hashSeed(n.id));
  const h = 5.5 + rnd() * 2;
  const trunk = trunkGeometry(h, 0.26, 0.06, rnd() * 10);
  const count = 150;
  const cards = new THREE.InstancedMesh(cardGeo, needleMat, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const t = i / count;
    const y = h * (0.22 + t * 0.78);
    const reach = (1 - t) * 1.9 + 0.35;
    const yaw = i * 2.39996 + rnd() * 0.3; // golden-angle spiral of branches
    // Card hangs outward and droops: base at the trunk, length = reach.
    e.set(0, yaw, -(1.2 + rnd() * 0.35), 'YXZ');
    m.compose(new THREE.Vector3(0, y, 0), q.setFromEuler(e), new THREE.Vector3(0.7 + reach * 0.35, reach, 1));
    cards.setMatrixAt(i, m);
    cards.setColorAt(i, c.copy(tint[i % tint.length]).multiplyScalar(0.75 + t * 0.4));
  }
  cards.castShadow = true;
  cards.receiveShadow = true;
  return { trunk, branches: [], cards };
}

export function RealisticTree({ n, ud }: { n: ResourceNode; ud: Record<string, unknown> }) {
  const pal = BIOMES[ISLANDS[n.island].biome];
  const build = useMemo(() => {
    const tint = pal.foliage.map((f) => new THREE.Color(f).offsetHSL(0, -0.15, -0.05));
    const b = n.variant === 1 ? buildPine(n, tint) : buildBroadleaf(n, tint);
    b.cards.userData = ud;
    return b;
  }, [n, pal, ud]);
  const bark = toon(n.variant === 1 ? '#7a4b2a' : '#8b5a2b', 0, barkDetail);
  return (
    <>
      <mesh geometry={build.trunk} material={bark} castShadow receiveShadow userData={ud} />
      {build.branches.map((m, i) => (
        <mesh key={i} geometry={branchGeo} material={bark} matrix={m} matrixAutoUpdate={false} castShadow userData={ud} />
      ))}
      <primitive object={build.cards} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Boulders

function boulder(seed: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 5);
  const p = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n =
      0.22 * noise3(v.x * 1.2 + seed, v.y * 1.2, v.z * 1.2) +
      0.08 * noise3(v.x * 3.5, v.y * 3.5 + seed, v.z * 3.5) +
      0.025 * noise3(v.x * 9, v.y * 9, v.z * 9 + seed);
    v.multiplyScalar(1 + n);
    if (v.y < -0.35) v.y = -0.35 + (v.y + 0.35) * 0.25; // settle into the ground
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export const boulderGeos = [boulder(1), boulder(7), boulder(13)];
