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
        this.firstChunkObject = JSON.parse(contentString);

        // Get Binary Chunk 
        var secondChunkLength = bufferFourBits.slice(offset + 5, offset + 6)[0];
        var secondChunkType = decoder.decode(bufferFourBits.slice(offset + 6, offset + 7));
        var secondOffset = secondChunkLength / 4;
        var secondChunkContent = bufferFourBits.slice(offset + 7, offset + 7 + secondOffset);
        this.secondChunkBits = this.gltfBuffer.slice((offset + 7) * 4, (offset + 7 + secondOffset) * 4);

    }

    processGLTFBuffer() {
        var meshesData = [];

        var meshes = this.firstChunkObject['meshes'];
        for (var i = 0; i < meshes.length; i++) {
            var meshName = meshes[i]['name'];
            var meshData = {'name':meshName, 'primitives': [], 'material': 'defaultmaterial' };
            var primitives = []
            for (var j = 0; j < meshes[i].primitives.length; j++) {
                var primitive = meshes[i].primitives[j]

                var primitiveData = {
                    'positions': this.getBufferData(primitive, 'POSITION'),
                    'normals': this.getBufferData(primitive, 'NORMAL'),
                    'indices': this.getBufferData(primitive, 'indices'),
                    'material': this.getMaterial(primitive)
                };


                primitives.push(primitiveData);

            }

            if (primitives.length > 0) {
                // meshesData.push(primitives);
                meshData['primitives'].push(primitiveData);
            }

            meshesData.push(meshData);

        }

        return meshesData;

    }


    getMaterial(primitive) {
        var materialIndex = primitive['material'];
        return this.firstChunkObject['materials'][materialIndex];
    }


    getBufferData(primitive, primitiveAttributeType) {

        if (primitiveAttributeType == 'NORMAL' || primitiveAttributeType == 'POSITION') {
            var accessorIndex = primitive['attributes'][primitiveAttributeType];
        }
        else if (primitiveAttributeType == 'indices') {
            var accessorIndex = primitive[primitiveAttributeType]
        }

        var accessor = this.firstChunkObject['accessors'][accessorIndex];
        var accessorOffset = accessor['byteOffset'];
        var accesorType = accessor['type'];
        var componentType = accessor['componentType'];
        // Accessor count property defines the number of elements in the bufferView
        var accessorCount = accessor['count'];

        // BufferView
        var concernedBufferViewIndex = accessor['bufferView'];
        var concernedBufferView = this.firstChunkObject['bufferViews'][concernedBufferViewIndex];
        var byteOffset = concernedBufferView['byteOffset'];
        var byteStride = concernedBufferView['byteStride'];
        var byteLength = concernedBufferView['byteLength'];

        // Buffer
        var concernedBufferIndex = concernedBufferView['buffer'];
        var concernedBuffer = this.firstChunkObject['buffers'][concernedBufferIndex];
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

        if (byteOffset) {
            var segmentedBuffer = this.secondChunkBits.slice(byteOffset, byteOffset + byteLength);
        }
        else {
            var segmentedBuffer = this.secondChunkBits
        }

        var segmentedBufferFromAccessor = segmentedBuffer.slice(accessorOffset, accessorOffset + upperBound);

        //console.log('Segmented buffer size : ', segmentedBufferFromAccessor.byteLength, segmentedBufferFromAccessor.byteLength / 4);

        if (segmentedBufferFromAccessor.byteLength % 4 != 0) {
            debugger;
        }
        return new WEBGL_COMPONENT_TYPES[componentType](segmentedBufferFromAccessor);

     

    }





}
