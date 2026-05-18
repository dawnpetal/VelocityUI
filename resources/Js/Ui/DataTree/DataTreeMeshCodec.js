const DataTreeMeshCodec = (() => {
  const DRACO_SCRIPT_URL = 'Vendor/Draco/draco_wasm_wrapper.js';
  const DRACO_WASM_BASE = 'Vendor/Draco/';
  let _decoderPromise = null;
  let _scriptPromise = null;

  async function parseCompressedCoreMesh(bytes) {
    const draco = _extractDracoPayload(bytes);
    if (!draco) throw new Error('Compressed mesh payload has no Draco stream');
    return _decodeDracoMesh(draco);
  }

  function canParseCompressedCoreMesh(bytes) {
    return !!_extractDracoPayload(bytes);
  }

  function _extractDracoPayload(bytes) {
    if (!bytes?.length) return null;
    const dracoOffset = _bytesIndexOf(bytes, 'DRACO');
    if (dracoOffset < 4) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const dracoLength = view.getUint32(dracoOffset - 4, true);
    const end = dracoOffset + dracoLength;
    if (!dracoLength || end > bytes.length) return null;
    return bytes.slice(dracoOffset, end);
  }

  async function _decodeDracoMesh(dracoBytes) {
    const module = await _ensureDecoder();
    const decoder = new module.Decoder();
    const buffer = new module.DecoderBuffer();
    buffer.Init(dracoBytes, dracoBytes.length);
    const mesh = new module.Mesh();
    const status = decoder.DecodeBufferToMesh(buffer, mesh);
    try {
      if (!status.ok()) throw new Error(status.error_msg() || 'Draco decode failed');
      const positions = _readFloatAttribute(module, decoder, mesh, module.POSITION);
      if (!positions?.length) throw new Error('Draco mesh is missing positions');
      const normals =
        _readFloatAttribute(module, decoder, mesh, module.NORMAL) ||
        _readFirstGenericFloatAttribute(module, decoder, mesh, 3);
      const uvs = _readFloatAttribute(module, decoder, mesh, module.TEX_COORD);
      const indices = _readTriangleIndices(module, decoder, mesh);
      return { positions, indices, normals, uvs };
    } finally {
      module.destroy(status);
      module.destroy(mesh);
      module.destroy(buffer);
      module.destroy(decoder);
    }
  }

  function _readFloatAttribute(module, decoder, mesh, attributeType) {
    const attributeId = decoder.GetAttributeId(mesh, attributeType);
    if (attributeId < 0) return null;
    const attribute = decoder.GetAttribute(mesh, attributeId);
    const values = new module.DracoFloat32Array();
    try {
      if (!decoder.GetAttributeFloatForAllPoints(mesh, attribute, values)) return null;
      const out = new Float32Array(values.size());
      for (let i = 0; i < out.length; i += 1) out[i] = values.GetValue(i);
      return out;
    } finally {
      module.destroy(values);
      module.destroy(attribute);
    }
  }

  function _readFirstGenericFloatAttribute(module, decoder, mesh, components) {
    const count = mesh.num_attributes?.() || 0;
    for (let i = 0; i < count; i += 1) {
      const attribute = decoder.GetAttribute(mesh, i);
      try {
        if (
          attribute?.attribute_type?.() !== module.GENERIC ||
          attribute?.num_components?.() !== components
        ) {
          continue;
        }
        const values = new module.DracoFloat32Array();
        try {
          if (!decoder.GetAttributeFloatForAllPoints(mesh, attribute, values)) continue;
          const out = new Float32Array(values.size());
          for (let j = 0; j < out.length; j += 1) out[j] = values.GetValue(j);
          return out;
        } finally {
          module.destroy(values);
        }
      } finally {
        module.destroy(attribute);
      }
    }
    return null;
  }

  function _readTriangleIndices(module, decoder, mesh) {
    const out = new Uint32Array(mesh.num_faces() * 3);
    const face = new module.DracoInt32Array();
    try {
      for (let i = 0; i < mesh.num_faces(); i += 1) {
        decoder.GetFaceFromMesh(mesh, i, face);
        const offset = i * 3;
        out[offset] = face.GetValue(0);
        out[offset + 1] = face.GetValue(1);
        out[offset + 2] = face.GetValue(2);
      }
      return out;
    } finally {
      module.destroy(face);
    }
  }

  async function _ensureDecoder() {
    if (_decoderPromise) return _decoderPromise;
    _decoderPromise = (async () => {
      await _ensureDecoderScript();
      if (typeof DracoDecoderModule !== 'function') {
        throw new Error('Draco decoder runtime failed to load');
      }
      return DracoDecoderModule({
        locateFile: (file) => `${DRACO_WASM_BASE}${file}`,
      });
    })();
    return _decoderPromise;
  }

  function _ensureDecoderScript() {
    if (typeof DracoDecoderModule === 'function') return Promise.resolve();
    if (_scriptPromise) return _scriptPromise;
    _scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = DRACO_SCRIPT_URL;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Draco decoder runtime'));
      document.head.append(script);
    });
    return _scriptPromise;
  }

  function _bytesIndexOf(bytes, text, start = 0) {
    const needle = new TextEncoder().encode(text);
    outer: for (let i = Math.max(0, start); i <= bytes.length - needle.length; i += 1) {
      for (let j = 0; j < needle.length; j += 1) {
        if (bytes[i + j] !== needle[j]) continue outer;
      }
      return i;
    }
    return -1;
  }

  return {
    canParseCompressedCoreMesh,
    parseCompressedCoreMesh,
  };
})();
