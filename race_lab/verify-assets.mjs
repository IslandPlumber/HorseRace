/**
 * Verify the real exported geometry and animation with Three.js on the CPU.
 *
 * Run from any directory: node race_lab/verify-assets.mjs
 *
 * IMPORTANT: createImageBitmap is intentionally stubbed below. This check does
 * not decode, render, or judge photographs. Embedded image bytes are covered by
 * the GLB checksum, while their appearance is reviewed separately in the main
 * real-browser screenshots. The stub lets GLTFLoader construct real meshes,
 * skeletons and animation tracks in Node without a DOM or graphics driver.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const expectedIds = ['trump', 'biden', 'mcconnell', 'bernie', 'elon', 'gordon', 'snoop'];
const manifest = JSON.parse(await fs.readFile(path.join(root, 'asset-manifest.json'), 'utf8'));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
assert.deepEqual(manifest.actors.map(actor => actor.id), expectedIds, 'Exactly seven expected actors, in roster order');
assert.equal(new Set(manifest.actors.map(actor => actor.id)).size, expectedIds.length, 'No duplicate actor IDs');
const sourceBytes = await fs.readFile(path.resolve(root, manifest.source));
assert.equal(sha256(sourceBytes), manifest.source_sha256, 'Source scene still matches the recorded export input');
assert.equal(manifest.source_unchanged, true);

globalThis.self = globalThis;
// Deliberately NOT an image decoder. Visual fidelity is a separate browser check.
globalThis.createImageBitmap = async () => ({width: 1, height: 1, close() {}});
const loader = new GLTFLoader();
const results = [];

for (const actor of manifest.actors) {
  const filename = path.resolve(root, actor.file);
  assert(filename.startsWith(path.join(root, 'assets') + path.sep), 'Actor must resolve inside assets/');
  const bytes = await fs.readFile(filename);
  assert.equal(bytes.byteLength, actor.bytes, `${actor.id}: recorded byte length`);
  assert.equal(sha256(bytes), actor.sha256, `${actor.id}: recorded SHA256`);
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.byteLength);
  const jsonLength = bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a, 'First GLB chunk is JSON');
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
  const binHeader = 20 + jsonLength;
  assert.equal(bytes.readUInt32LE(binHeader + 4), 0x004e4942, 'Second GLB chunk is BIN');
  assert.equal(binHeader + 8 + bytes.readUInt32LE(binHeader), bytes.byteLength);
  assert.equal(gltf.buffers.length, 1);
  assert.equal(gltf.buffers[0].uri, undefined, 'No external binary dependency');
  assert(gltf.images.length > 0, 'Actual image payloads present');
  for (const image of gltf.images) {
    assert.equal(image.uri, undefined, 'No external image dependency');
    assert(Number.isInteger(image.bufferView), 'Image is embedded in the GLB BIN buffer');
    const view = gltf.bufferViews[image.bufferView];
    assert(view.byteLength > 0 && view.buffer === 0);
    assert(['image/jpeg', 'image/png', 'image/webp'].includes(image.mimeType));
  }
  assert.equal(gltf.cameras, undefined, 'No shot camera is bundled with the actor');
  assert.equal(gltf.animations.length, 1, 'One combined reusable clip');
  assert.equal(gltf.animations[0].name, 'gait');
  assert.equal(gltf.skins.length, 1, 'The actual horse skin is retained');
  const rootIndices = gltf.nodes.flatMap((node, index) => node.extras?.actor_id === actor.id ? [index] : []);
  assert.equal(rootIndices.length, 1, 'One identified reusable actor root');
  const actorRoot = rootIndices[0];
  assert.deepEqual(gltf.nodes[actorRoot].translation ?? [0, 0, 0], [0, 0, 0], 'Source race placement removed');
  assert(!gltf.animations[0].channels.some(channel => channel.target.node === actorRoot), 'Clip cannot overwrite race root motion');

  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const parsed = await loader.parseAsync(arrayBuffer, '');
  assert.equal(parsed.animations.length, 1);
  assert.equal(parsed.animations[0].name, 'gait');
  assert(Math.abs(parsed.animations[0].duration - 4) < 0.001, 'Clip lasts four seconds');
  const meshes = [];
  parsed.scene.traverse(object => { if (object.isSkinnedMesh) meshes.push(object); });
  assert(meshes.length > 0, 'Actual skinned meshes are instantiated');
  const mixer = new THREE.AnimationMixer(parsed.scene);
  mixer.clipAction(parsed.animations[0]).play();

  function sampleSkinVertices() {
    parsed.scene.updateMatrixWorld(true);
    for (const mesh of meshes) mesh.skeleton.update();
    return meshes.flatMap(mesh => {
      const points = [];
      const count = mesh.geometry.attributes.position.count;
      const step = Math.max(1, Math.floor(count / 300));
      for (let index = 0; index < count; index += step) {
        const point = mesh.getVertexPosition(index, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
        assert(point.toArray().every(Number.isFinite), 'Finite deformed vertex coordinates');
        points.push(point);
      }
      return points;
    });
  }

  mixer.setTime(0.3);
  const firstPose = sampleSkinVertices();
  mixer.setTime(0.8);
  const secondPose = sampleSkinVertices();
  assert.equal(firstPose.length, secondPose.length);
  const motion = Math.max(...firstPose.map((point, index) => point.distanceTo(secondPose[index])));
  assert(motion > 0.1, `${actor.id}: clip must deform real geometry`);
  const before = sampleSkinVertices();
  const translation = new THREE.Vector3(20, 0, 0);
  parsed.scene.position.copy(translation);
  const after = sampleSkinVertices();
  const translationError = Math.max(...before.map((point, index) => point.clone().add(translation).distanceTo(after[index])));
  assert(translationError < 0.0001, `${actor.id}: parent movement must carry all skin vertices`);
  results.push({
    id: actor.id,
    bytes: bytes.byteLength,
    sha256_matches: true,
    embedded_images: gltf.images.length,
    external_dependencies: 0,
    clip: parsed.animations[0].name,
    clip_seconds: parsed.animations[0].duration,
    skin_meshes: meshes.length,
    sampled_skin_vertices: firstPose.length,
    maximum_vertex_motion_m: motion,
    parent_translation_m: translation.toArray(),
    maximum_parent_translation_error_m: translationError,
  });
  mixer.stopAllAction();
  mixer.uncacheRoot(parsed.scene);
  console.log(`PASS ${actor.id}: embedded GLB, four-second gait, moving skin, accurate parent translation`);
}

const report = {
  checked_at_utc: new Date().toISOString(),
  result: 'passed',
  actors_checked: results.length,
  source_sha256_matches: true,
  method: 'CPU-only Three.js GLTFLoader / AnimationMixer / sampled skinned vertex coordinates',
  texture_decoding_stubbed: true,
  visual_scope: 'This script does not decode or render photographs. Actual photographs and materials are checked separately in the main real-browser review.',
  separate_browser_review_files: ['race-a.png', 'race-b.png'],
  actors: results,
};
await fs.mkdir(path.join(root, 'review'), {recursive: true});
await fs.writeFile(path.join(root, 'review', 'asset-validation.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Asset checks passed for all ${results.length} actors. Evidence: review/asset-validation.json`);
