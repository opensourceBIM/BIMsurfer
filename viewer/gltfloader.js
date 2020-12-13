import * as vec4 from "./glmatrix/vec4.js";
import * as mat4 from "./glmatrix/mat4.js";
import * as mat3 from "./glmatrix/mat3.js";

import { Utils } from "./utils.js";
import { DataInputStream } from "./datainputstream.js";

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

    constructor(gltfBuffer, defaultRenderLayer) {
        this.gltfBuffer = gltfBuffer;
        this.defaultRenderLayer = defaultRenderLayer;

    }

    processGLTFBuffer() {
        debugger;

        var decoder = new TextDecoder("utf-8");

        // Parse header
        var bufferFourBits = new Int32Array(this.gltfBuffer);
        var firstBits = bufferFourBits.slice(0, 2);
        var hexa = new Int16Array(firstBits);

        //Todo: Add an assertion to check if the file is glTF
        var magic = hexa[0];
        var magicValue = magic.toString(16);
        var fileFormat = decoder.decode(buffer.slice(0, 4))

        var version = hexa[1].toString(8);

        var length = bufferFourBits.slice(2, 3)[0];

        var result = decoder.decode(this.gltfBuffer);

        /////////// JSON CHUNK
        var firstChunkLength = bufferFourBits.slice(3, 4)[0];
        var firstChunkType = decoder.decode(bufferFourBits.slice(4, 5))
        var offset = firstChunkLength / 4;
        var content = bufferFourBits.slice(5, offset + 5);
        var contentString = decoder.decode(content);
        var firstChunkObject = JSON.parse(contentString);


        /////////// BIN CHUNK 
        var secondChunkLength = bufferFourBits.slice(offset + 5, offset + 6)[0];
        var secondChunkType = decoder.decode(bufferFourBits.slice(offset + 6, offset + 7));
        var secondOffset = secondChunkLength / 4;
        var secondChunkContent = bufferFourBits.slice(offset + 7, offset + 7 + secondOffset);

        var secondChunkBits = this.gltfBuffer.slice((offset + 7) * 4, (offset + 7 + secondOffset) * 4);

        /////////// PARSING THE MESHES
        var meshes = firstChunkObject['meshes'];
        var indices = new Set();

        for (var i = 0; i < meshes.length; i++) {
            if (meshes[i].primitives.length > 1) {
                for (var j = 0; j < meshes[i].primitives.length; j++) {
                    console.log(meshes[i])

                }
            }

        }


        ///////////// Test with one or several meshes

        var mesh = meshes[127];
        var primitive = mesh['primitives'][0];

        var normalAccessorIndex = primitive['attributes']["POSITION"];
        var normalAccessor = firstChunkObject['accessors'][normalAccessorIndex];
        var normalAccessorOffset = normalAccessor['byteOffset'];
        var normalAccesorType = normalAccessor['type'];
        // Accessor count property defines the number of elements in the bufferView
        var normalAccessorCount = normalAccessor['count'];

        // BufferView
        var concernedBufferViewIndex = normalAccessor['bufferView'];
        var concernedBufferView = firstChunkObject['bufferViews'][concernedBufferViewIndex];
        var byteOffset = concernedBufferView['byteOffset'];
        var byteStride = concernedBufferView['byteStride'];
        var byteLength = concernedBufferView['byteLength'];

        // Buffer
        var concernedBufferIndex = concernedBufferView['buffer'];
        var concernedBuffer = firstChunkObject['buffers'][concernedBufferIndex];
        var concernedBufferLength = concernedBuffer['byteLength'];

        // Segment Buffer according to 1.BufferView offset, 2. Accessor offset, 3.BufferView stride
        var segmentedBuffer = secondChunkBits.slice(byteOffset, byteOffset + byteLength);

        var dataSize = WEBGL_TYPE_SIZES[normalAccesorType];
        var upperBound = normalAccessorCount * dataSize

        var segmentedBufferFromAccessor = segmentedBuffer.slice(normalAccessorOffset, normalAccessorOffset + upperBound);
        var view = new DataView(segmentedBufferFromAccessor);
        var firstItem = view.getFloat32(0, false);
        var floatValues = new Float32Array(segmentedBufferFromAccessor)



    }




}
