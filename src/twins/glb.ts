/**
 * Reads a glTF binary well enough to trust it.
 *
 * A URL ending in .glb proves nothing — an admin can paste anything, and a
 * broken or mislabelled file would only surface as a blank viewer on a buyer's
 * phone. Parsing the container here means a bad upload is rejected at the point
 * someone can still fix it.
 *
 * Deliberately a hand-rolled header reader rather than a glTF library: the
 * container format is twelve bytes of header and a length-prefixed JSON chunk,
 * and pulling in a parser to read that would cost more than it explains.
 * https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#binary-gltf-layout
 */

/** 'glTF' as a little-endian uint32 — the first four bytes of every .glb. */
const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;

export interface GlbSummary {
  /** Triangles across every primitive, so delivery budget is knowable. */
  triangles: number;
  meshes: number;
  materials: number;
  textures: number;
  /** Compression in use, if any — the difference between 15 MB and 90 MB. */
  compression: 'draco' | 'meshopt' | 'none';
  /** KTX2 supercompressed textures stay compressed in VRAM. */
  ktx2: boolean;
  bytes: number;
}

export class GlbError extends Error {}

/**
 * Parse the JSON chunk of a .glb and summarise what a viewer will have to draw.
 *
 * Only the header and first chunk are read; the binary payload is left alone,
 * so this stays cheap even on a large file.
 */
export function summariseGlb(buffer: Buffer): GlbSummary {
  if (buffer.byteLength < 20) {
    throw new GlbError('That file is too small to be a glTF binary.');
  }

  if (buffer.readUInt32LE(0) !== GLB_MAGIC) {
    throw new GlbError(
      'That is not a glTF binary. Export the model as .glb — a .gltf, .obj or .fbx will not load in the viewer.',
    );
  }

  const version = buffer.readUInt32LE(4);
  if (version !== 2) {
    throw new GlbError(`glTF version ${version} is not supported. Export as glTF 2.0.`);
  }

  const jsonLength = buffer.readUInt32LE(12);
  const jsonType = buffer.readUInt32LE(16);
  if (jsonType !== CHUNK_JSON) {
    throw new GlbError('That glTF binary is malformed — its first chunk is not JSON.');
  }

  let gltf: GltfDoc;
  try {
    gltf = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8')) as GltfDoc;
  } catch {
    throw new GlbError('That glTF binary is malformed — its JSON chunk could not be read.');
  }

  const extensions = new Set(gltf.extensionsUsed ?? []);
  const compression: GlbSummary['compression'] = extensions.has('KHR_draco_mesh_compression')
    ? 'draco'
    : extensions.has('EXT_meshopt_compression')
      ? 'meshopt'
      : 'none';

  return {
    triangles: countTriangles(gltf),
    meshes: gltf.meshes?.length ?? 0,
    materials: gltf.materials?.length ?? 0,
    textures: gltf.textures?.length ?? 0,
    compression,
    ktx2: extensions.has('KHR_texture_basisu'),
    bytes: buffer.byteLength,
  };
}

/**
 * Triangle count across every primitive.
 *
 * Indexed primitives report their count on the index accessor; unindexed ones
 * on POSITION. Only triangle modes are counted — a mode of 4, 5 or 6 — since
 * lines and points are not what a renderer struggles with.
 */
function countTriangles(gltf: GltfDoc): number {
  const accessors = gltf.accessors ?? [];
  let total = 0;

  for (const mesh of gltf.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      // glTF defaults mode to 4 (TRIANGLES) when absent.
      const mode = prim.mode ?? 4;
      if (mode < 4 || mode > 6) continue;

      const accessorIndex = prim.indices ?? prim.attributes?.POSITION;
      if (accessorIndex === undefined) continue;

      const count = accessors[accessorIndex]?.count ?? 0;
      // TRIANGLES consumes three vertices per face; STRIP and FAN produce one
      // face per vertex after the first two.
      total += mode === 4 ? Math.floor(count / 3) : Math.max(0, count - 2);
    }
  }

  return total;
}

interface GltfDoc {
  extensionsUsed?: string[];
  accessors?: { count?: number }[];
  materials?: unknown[];
  textures?: unknown[];
  meshes?: {
    primitives?: {
      mode?: number;
      indices?: number;
      attributes?: { POSITION?: number };
    }[];
  }[];
}
