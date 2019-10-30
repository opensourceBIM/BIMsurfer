import * as mat4 from "./glmatrix/mat4.js";
import * as mat3 from "./glmatrix/mat3.js";
import * as vec3 from "./glmatrix/vec3.js";

const WEB_GL_2 = "WebGL2RenderingContext" in window;

const glTypeToTypedArrayMap = new Map([
	[WEB_GL_2 ? WebGL2RenderingContext.BYTE : null, Int8Array],
	[WEB_GL_2 ? WebGL2RenderingContext.SHORT : null, Int16Array],
	[WEB_GL_2 ? WebGL2RenderingContext.INT : null, Int32Array],
	[WEB_GL_2 ? WebGL2RenderingContext.UNSIGNED_BYTE : null, Uint8Array],
	[WEB_GL_2 ? WebGL2RenderingContext.UNSIGNED_SHORT : null, Uint16Array],
	[WEB_GL_2 ? WebGL2RenderingContext.UNSIGNED_INT : null, Uint32Array],
	[WEB_GL_2 ? WebGL2RenderingContext.FLOAT : null, Float32Array]
]);

const typedArrayToGlTypeMap = new Map([
	["Int8Array", WEB_GL_2 ? WebGL2RenderingContext.BYTE : null],
	["Int16Array", WEB_GL_2 ? WebGL2RenderingContext.SHORT : null],
	["Int32Array", WEB_GL_2 ? WebGL2RenderingContext.INT : null],
	["Uint8Array", WEB_GL_2 ? WebGL2RenderingContext.UNSIGNED_BYTE : null],
	["Uint16Array", WEB_GL_2 ? WebGL2RenderingContext.UNSIGNED_SHORT : null],
	["Uint32Array", WEB_GL_2 ? WebGL2RenderingContext.UNSIGNED_INT : null],
	["Float32Array", WEB_GL_2 ? WebGL2RenderingContext.FLOAT : null]
]);

/**
 * Generic utils
 *
 * @export
 * @class Utils
 */
export class Utils {
	static hash(input) {
		  var hash = 0, i, chr;
		  if (input.length === 0) return hash;
		  for (i = 0; i < input.length; i++) {
		    chr   = input.charCodeAt(i);
		    hash  = ((hash << 5) - hash) + chr;
		    hash |= 0; // Convert to 32bit integer
		  }
		  return hash;
	}

	static typedArrayToGlType(typedArrayType) {
		return typedArrayToGlTypeMap.get(typedArrayType);
	}

	static glTypeToTypedArray(glType) {
		return glTypeToTypedArrayMap.get(glType)
	}
	
	/**
	 * Converts the given mat/vec to an array
	 */
	static toArray(input) {
		var result = new Array(input.length);
		for (var i=0; i<input.length; i++) {
			result[i] = input[i];
		}
		return result;
	}

	/**
	 * Create a new GPU buffer, keep in mind that some extra attributes are being set on the returned GLBuffer object
	 */
	static createBuffer(gl, data, numElements, bufferType, components, srcStart, attribType, js_type) {
		// numElements -> Number of typed elements
		numElements = numElements || data.length;
		bufferType = bufferType || gl.ARRAY_BUFFER;
		components = components || 3;
		srcStart = srcStart || 0;

		const b = gl.createBuffer();
		gl.bindBuffer(bufferType, b);
		var js_type = js_type ? js_type : data.constructor.name;
		const byteCount = numElements * window[js_type].BYTES_PER_ELEMENT;
		
		gl.bufferData(bufferType, data, gl.STATIC_DRAW, srcStart, numElements);
		
		b.byteSize = byteCount;
		b.N = numElements;
		b.gl_type = bufferType;
		b.js_type = js_type;
		b.attrib_type = attribType ? attribType : Utils.typedArrayToGlType(b.js_type);
		b.components = components;
		b.normalize = false;
		b.stride = 0;
		b.offset = 0;
		return b;
	}

	/**
	 * Create a new GPU empty buffer, keep in mind that some extra attributes are being set on the returned GLBuffer object.
	 * This method is usually used in order to create buffers that will be later be filled by calls to bufferSubData (via Utils.updateBuffer)
	 */
	static createEmptyBuffer(gl, numElements, bufferType, components, attribType, js_type) {
		const nrBytesRequired = numElements * window[js_type].BYTES_PER_ELEMENT;

		bufferType = bufferType || gl.ARRAY_BUFFER;
		components = components || 3;

		const b = gl.createBuffer();
		gl.bindBuffer(bufferType, b);
		const byteCount = numElements * window[js_type].BYTES_PER_ELEMENT;
		
		// Read the WebGL documentation carefully on this, the interpretation of the size argument depends on the type of "data"
		gl.bufferData(bufferType, byteCount, gl.STATIC_DRAW);
		
		b.byteSize = byteCount;
		b.N = numElements;
		b.gl_type = bufferType;
		b.js_type = js_type;
		b.attrib_type = attribType ? attribType : Utils.typedArrayToGlType(b.js_type);
		b.components = components;
		b.normalize = false;
		b.stride = 0;
		b.offset = 0;
		b.writePosition = 0;
		
		return b;
	}
	
	/**
	 * Update a GPU buffer
	 */	
	static updateBuffer(gl, targetGlBuffer, data, pos, numElements) {
		gl.bindBuffer(targetGlBuffer.gl_type, targetGlBuffer);
		const byteCount = numElements * window[targetGlBuffer.js_type].BYTES_PER_ELEMENT;
		
		// Read the WebGL documentation carefully on this, the interpretation of the size argument depends on the type of "data"
		let size = numElements; // Ok for non-typed arrays
		if (data.constructor.name == "DataView") {
			size = byteCount;
		}

		// TODO add a general DEBUGGING flag somewhere to avoid doing unneeded checks
		if (targetGlBuffer.writePosition + size > targetGlBuffer.byteSize) {
			console.error("Buffer overflow by", (targetGlBuffer.writePosition + size) - targetGlBuffer.byteSize);
			debugger;
		}
		
		try {
			gl.bufferSubData(targetGlBuffer.gl_type, targetGlBuffer.writePosition, data, pos, size);
		} catch (e) {
			debugger;
		}
		targetGlBuffer.writePosition += byteCount;
	}
	
	static createIndexBuffer(gl, data, n) {
		return Utils.createBuffer(gl, data, n, gl.ELEMENT_ARRAY_BUFFER);
	}

	static createLineIndexBuffer(gl, data, n) {
		return Utils.createBuffer(gl, data, n, gl.ELEMENT_ARRAY_BUFFER, 2);
	}

	static transformBounds(inputBounds, translation) {
		let newBounds = new Float32Array(6);
		vec3.add(newBounds, inputBounds, translation);
		vec3.add(newBounds.subarray(3), inputBounds.subarray(3), translation);
		return newBounds;
	}
	
	static unionAabb(a, b) {
		let r = new Float32Array(6);
		for (let i = 0; i < 6; ++i) {
			let fn = i < 3 ? Math.min : Math.max;
			r[i] = fn(a[i], b[i]);
		}
		return r;
	}

	static emptyAabb() {
		let i = Infinity;
		return new Float32Array([i,i,i,-i,-i,-i]);
	}

	static isEmptyAabb(aabb) {
		return Array.from(aabb).some((a)=>(!isFinite(a)));
	}
	
	static sortMapKeys(inputMap) {
		var sortedKeys = Array.from(inputMap.keys()).sort((a, b) => {
        	// Otherwise a and b will be converted to string first...
			return a - b;
		});
		var newMap = new Map();
		for (var oid of sortedKeys) {
			newMap.set(oid, inputMap.get(oid));
		}
		return newMap;
	}

	static request(options) {
		return new Promise(function (resolve, reject) {
			var xhr = new XMLHttpRequest();
			xhr.open(options.method || "GET", options.url);
			if (options.binary) {
				xhr.responseType = "arraybuffer";
			}
			xhr.onload = function () {
				if (this.status >= 200 && this.status < 300) {
					resolve(xhr.response);
				} else {
					reject();
				}
			};
			xhr.onerror = reject;
			xhr.send(null);
		});
	}
	
	static calculateBytesUsed(settings, nrVertices, nrColors, nrIndices, nrLineIndices, nrNormals) {
		// TODO add lineIndices
		var bytes = 0;
		if (settings.quantizeVertices) {
			bytes += nrVertices * 2;
		} else {
			bytes += nrVertices * 4;
		}
		if (nrColors != null) {
			if (settings.quantizeColors) {
				bytes += nrColors;
			} else {
				bytes += nrColors * 4;
			}
		}
		// Pick buffers
		bytes += (nrVertices / 3) * 4;
		if (nrIndices < 65536 && settings.useSmallIndicesIfPossible) {
			bytes += nrIndices * 2;
		} else {
			bytes += nrIndices * 4;
		}
		if (settings.quantizeNormals) {
			// Oct-encoding, the amount of normals is also the amount of bytes
			bytes += nrNormals;
		} else {
			bytes += nrNormals * 4;
		}
//		if (!Number.isInteger(bytes)) {
//			debugger;
//		}
		return bytes;
	}
	
	/*
	 * 
	 * vec3 v = vec3(oct.xy, 1.0 - abs(oct.x) - abs(oct.y));
        if (v.z < 0.0) {
            v.xy = (1.0 - abs(v.yx)) * vec2(v.x >= 0.0 ? 1.0 : -1.0, v.y >= 0.0 ? 1.0 : -1.0);
        }
        return normalize(v);
	 */
	
	// Decode an oct-encoded normal, not used currently, but was used for debugging
	static octDecodeVec2(oct) {
//		var normal = vec3.fromValues(oct[0] / 127, oct[1] / 127, 1.0 - Math.abs(oct[0] / 127) - Math.abs(oct[1] / 127));
//		if (normal[2] < 0.0) {
//			normal[0] = 
//		}
//		return vec3.normalize(normal);
       var x = oct[0];
       var y = oct[1];
       x /= x < 0 ? 128 : 127;
       y /= y < 0 ? 128 : 127;

       var z = 1 - Math.abs(x) - Math.abs(y);

       if (z < 0) {
           x = (1 - Math.abs(y)) * (x >= 0 ? 1 : -1);
           y = (1 - Math.abs(x)) * (y >= 0 ? 1 : -1);
       }

       var length = Math.sqrt(x * x + y * y + z * z);

       return [
           x / length,
           y / length,
           z / length
       ];
   }
	
	static getLargestFaceArea(width, height, depth) {
		var largestFaceArea = width * height;
		if (width * depth > largestFaceArea) {
			largestFaceArea = width * depth;
		}
		if (this.depth * height > largestFaceArea) {
			largestFaceArea = depth * height;
		}
		return largestFaceArea;
	}
	
	static getLargestEdge(width, height, depth) {
		let largestEdge = width;
		if (height > largestEdge) {
			largestEdge = height;
		}
		if (this.depth > largestEdge) {
			largestEdge = depth;
		}
		return largestEdge;
	}
}