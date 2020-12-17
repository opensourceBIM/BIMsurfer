import * as vec3 from "./glmatrix/vec3.js";
import * as mat4 from "./glmatrix/mat4.js";
import * as mat3 from "./glmatrix/mat3.js";

import { Utils } from "./utils.js";
import { DataInputStream } from "./datainputstream.js";
import {DefaultRenderLayer} from "./defaultrenderlayer.js"

import { AvlTree } from "./collections/avltree.js";

const PROTOCOL_VERSION = 20;


var WEBGL_TYPE_SIZES = {
    'SCALAR': 1,
    'VEC2': 2,
    'VEC3': 3,
    'VEC4': 4,
    'MAT2': 4,
    'MAT3': 9,
    'MAT4': 16
};

var WEBGL_COMPONENT_TYPES = {
    5120: Int8Array,
    5121: Uint8Array,
    5122: Int16Array,
    5123: Uint16Array,
    5125: Uint32Array,
    5126: Float32Array
};

var BINARY_EXTENSION_HEADER_MAGIC = 'glTF';
var BINARY_EXTENSION_HEADER_LENGTH = 12;
var BINARY_EXTENSION_CHUNK_TYPES = { JSON: 0x4E4F534A, BIN: 0x004E4942 };


export class GLTFLoader {

    constructor(viewer, gltfBuffer, params) {
        this.viewer = viewer;
        const layer = new DefaultRenderLayer(this.viewer);
        layer.registerLoader(1);
        layer.settings = JSON.parse(JSON.stringify(layer.settings));
        layer.settings.loaderSettings.quantizeVertices = false;
        layer.settings.loaderSettings.quantizeNormals = false;
        layer.settings.loaderSettings.quantizeColors = false;        
        this.viewer.renderLayers.add(layer);
        this.gltfBuffer = gltfBuffer;
        this.renderLayer = layer;
        this.params = params || {};
        this.primarilyProcess();
    }

    primarilyProcess() {
        var decoder = new TextDecoder("utf-8");

        // Parse header
        var bufferFourBits = new Int32Array(this.gltfBuffer);
        var firstBits = bufferFourBits.slice(0, 2);
        var hexa = new Int16Array(firstBits);

        //Todo: Add an assertion to check if the file is glTF
        var magic = hexa[0];
        var magicValue = magic.toString(16);
        var fileFormat = decoder.decode(this.gltfBuffer.slice(0, 4))
        var version = hexa[1].toString(8);
        var length = bufferFourBits.slice(2, 3)[0];

        // Get JSON Chunk
        var firstChunkLength = bufferFourBits.slice(3, 4)[0];
        var firstChunkType = decoder.decode(bufferFourBits.slice(4, 5))
        var offset = firstChunkLength / 4;
        var content = bufferFourBits.slice(5, offset + 5);
        var contentString = decoder.decode(content);
        this.json = JSON.parse(contentString);

        // Get Binary Chunk 
        var secondChunkLength = bufferFourBits.slice(offset + 5, offset + 6)[0];
        var secondChunkType = decoder.decode(bufferFourBits.slice(offset + 6, offset + 7));
        var secondOffset = secondChunkLength / 4;
        var secondChunkContent = bufferFourBits.slice(offset + 7, offset + 7 + secondOffset);
        this.secondChunkBits = this.gltfBuffer.slice((offset + 7) * 4, (offset + 7 + secondOffset) * 4);
    }

    join(a, b) {
        let c = new a.constructor(a.length + b.length);
        c.set(a);
        c.set(b, a.length);
        return c;
    }

    processGLTFBuffer() {
        let aabbs = {};

        this.json.meshes.forEach((mesh, i) => {
            let positions, normals, indices, colors;
            let aabb = Utils.emptyAabb();

            mesh.primitives.forEach((primitive, j) => {
                let [psAccessor, ps] = this.getBufferData(primitive, 'POSITION');
                let [_, ns] = this.getBufferData(primitive, 'NORMAL');
                let [__, idxs] = this.getBufferData(primitive, 'indices');
                let material = this.getMaterial(primitive);

                // Apparently indices are optional in glTF. In case they are absent
                // we just create a monotonically increasing sequence that stretches
                // all vertices.
                if (idxs === null) {
                    idxs = new Uint32Array(ps.length / 3);
                    for (let k = 0; k < idxs.length; ++k) {
                        idxs[k] = k;
                    }
                }
                
                let aabb_ = Utils.emptyAabb();
                aabb_.set(psAccessor.min);
                aabb_.set(psAccessor.max, 3);
                aabb = Utils.unionAabb(aabb, aabb_);

                let color = material.pbrMetallicRoughness && material.pbrMetallicRoughness.baseColorFactor
                    ? material.pbrMetallicRoughness.baseColorFactor
                    : [0.6, 0.6, 0.6, 1.0];

                let cs = new Float32Array(ps.length / 3 * 4);
                for (var k = 0; k < cs.length; k += 4) {
                    cs.set(color, k);
                }

                if (j === 0) {
                    [positions, normals, indices, colors] = [ps, ns, idxs, cs];
                } else {
                    positions = this.join(positions, ps);
                    normals = this.join(normals, ns);
                    for (let k = 0; k < idxs.length; ++k) {
                        idxs[k] += positions.length / 3;
                    }
                    indices = this.join(indices, idxs);
                    colors = this.join(colors, cs);
                }
            });

            if (this.params.elevation) {
                for (var k = 1; k < positions.length; k += 3) {
                    positions[k] -= this.params.elevation;
                }
            }

            if (this.params.translate) {
                let [dx, dy] = this.params.translate;
                dx = (dx - 0.5) * (aabb[3] - aabb[0]);
                dy = (dy - 0.5) * (aabb[5] - aabb[2]);
                for (var k = 0; k < positions.length; k += 3) {
                    positions[k] += dy;
                }
                for (var k = 2; k < positions.length; k += 3) {
                    positions[k] -= dx;
                }
            }

            for (var k = 0; k < aabb.length; ++k) {
                aabb[k] *= 1000.;
            }

            this.renderLayer.createGeometry(
                1,
                null,
                null,
                i,
                positions,
                normals,
                colors,
                null,
                indices,
                null,
                false,
                false,
                0
            );

            aabbs[i] = aabb;
        });

        this.json.nodes.forEach((n, i) => {
            if (typeof(n.mesh) !== 'undefined') {
                const aabb = aabbs[n.mesh];
                let m4, m3;
                if (!this.params.ignoreMatrix && n.matrix) {
                    let m = n.matrix;
                    m4 = new Float32Array([
                        m[ 0], -m[ 2], m[ 1], m[ 3],
                        m[ 4], -m[ 6], m[ 5], m[ 7],
                        m[ 8], -m[10], m[ 9], m[11],
                        m[12], -m[14], m[13], m[15]
                    ]);
                    m4[12] *= 1000.;
                    m4[13] *= 1000.;
                    m4[14] *= 1000.;
                } else if (this.params.refMatrix && this.json.extensions && this.json.extensions.CESIUM_RTC)  {
                    m4 = mat4.identity(mat4.create());
                    
                    let refInv = mat4.create();
                    mat4.invert(refInv, this.params.refMatrix);
                    
                    let m = n.matrix;
                    let nodeMatrixZup = new Float64Array([
                        m[ 0], -m[ 2], m[ 1], m[ 3],
                        m[ 4], -m[ 6], m[ 5], m[ 7],
                        m[ 8], -m[10], m[ 9], m[11],
                        m[12], -m[14], m[13], m[15]
                    ]);
                    nodeMatrixZup.subarray(12, 15).set(this.json.extensions.CESIUM_RTC.center);

                    mat4.multiply(m4, refInv, nodeMatrixZup);
                } else {
                    m4 = mat4.identity(mat4.create());
                }
                
                m3 = mat3.create();
                mat3.normalFromMat4(m3, m4);

                this.renderLayer.createObject(1, null, i, [n.mesh], m4, m3, m3, false, null, aabb, this.params.geospatial);
            }
        });

        this.renderLayer.flushAllBuffers();
    }


    getMaterial(primitive) {
        var materialIndex = primitive['material'];
        return this.json['materials'][materialIndex];
    }


    getBufferData(primitive, primitiveAttributeType) {

        if (primitiveAttributeType == 'NORMAL' || primitiveAttributeType == 'POSITION') {
            var accessorIndex = primitive['attributes'][primitiveAttributeType];
        }
        else if (primitiveAttributeType == 'indices') {
            var accessorIndex = primitive[primitiveAttributeType]
        }

        if (typeof(accessorIndex) === 'undefined') {
            return [null, null];
        }

        var accessor = this.json['accessors'][accessorIndex];
        var accessorOffset = accessor['byteOffset'] || 0;
        var accesorType = accessor['type'];
        var componentType = accessor['componentType'];
        // Accessor count property defines the number of elements in the bufferView
        var accessorCount = accessor['count'];

        // BufferView
        var concernedBufferViewIndex = accessor['bufferView'];
        var concernedBufferView = this.json['bufferViews'][concernedBufferViewIndex];
        var byteOffset = concernedBufferView['byteOffset'];
        var byteStride = concernedBufferView['byteStride'];
        var byteLength = concernedBufferView['byteLength'];

        // Buffer
        var concernedBufferIndex = concernedBufferView['buffer'];
        var concernedBuffer = this.json['buffers'][concernedBufferIndex];
        var concernedBufferLength = concernedBuffer['byteLength'];

        // Segment Buffer according to 1.BufferView offset, 2. Accessor offset, 3.BufferView stride
        var dataSize = WEBGL_TYPE_SIZES[accesorType];

        // Borrowed from ThreeJS GLTFLoader.js
        var TypedArray = WEBGL_COMPONENT_TYPES[componentType];
        var elementBytes = TypedArray.BYTES_PER_ELEMENT;

        // One acessor will have an accessor count number of, for example, VEC3.
        // A VEC3 is represented by 3 floats, 1 float being written on 4 bytes,
        // so the upperbound will be the the multiplication of these 3 variables. 

        var upperBound = accessorCount * elementBytes * dataSize;

        if (byteStride && byteStride != (WEBGL_TYPE_SIZES[accesorType] * elementBytes)) {
            let arrayBufferSubset = this.secondChunkBits.slice(byteOffset, byteOffset + byteLength);
            let all = new WEBGL_COMPONENT_TYPES[componentType](arrayBufferSubset);
            let strideSubset = new WEBGL_COMPONENT_TYPES[componentType](accessorCount * dataSize);
            let j = 0;
            for (let i = 0; i < all.length; ++i) {
                let i_within_stride = (i % (byteStride / elementBytes)) - (accessorOffset / elementBytes);
                if (i_within_stride >= 0 && i_within_stride < WEBGL_TYPE_SIZES[accesorType]) {
                    strideSubset[j++] = all[i];
                }
            }
            return [accessor, strideSubset];
        } else {
            if (byteOffset) {
                var segmentedBuffer = this.secondChunkBits.slice(byteOffset, byteOffset + byteLength);
            }
            else {
                var segmentedBuffer = this.secondChunkBits
            }

            var segmentedBufferFromAccessor = segmentedBuffer.slice(accessorOffset, accessorOffset + upperBound);
            return [accessor, new WEBGL_COMPONENT_TYPES[componentType](segmentedBufferFromAccessor)];
        }
    }

}
