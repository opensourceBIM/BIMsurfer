/*
 * Generic utils
 */

const glTypeToTypedArrayMap = new Map([
	[WebGL2RenderingContext.BYTE, Int8Array],
	[WebGL2RenderingContext.SHORT, Int16Array],
	[WebGL2RenderingContext.INT, Int32Array],
	[WebGL2RenderingContext.UNSIGNED_BYTE, Uint8Array],
	[WebGL2RenderingContext.UNSIGNED_SHORT, Uint16Array],
	[WebGL2RenderingContext.UNSIGNED_INT, Uint32Array],
	[WebGL2RenderingContext.FLOAT, Float32Array]
]);

const typedArrayToGlTypeMap = new Map([
	["Int8Array", WebGL2RenderingContext.BYTE],
	["Int16Array", WebGL2RenderingContext.SHORT],
	["Int32Array", WebGL2RenderingContext.INT],
	["Uint8Array", WebGL2RenderingContext.UNSIGNED_BYTE],
	["Uint16Array", WebGL2RenderingContext.UNSIGNED_SHORT],
	["Uint32Array", WebGL2RenderingContext.UNSIGNED_INT],
	["Float32Array", WebGL2RenderingContext.FLOAT]
]);

export default class Utils {
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
	
	/*
	 * Converts the given 4x4 mat4 to an array
	 */
	static toArray(matrix) {
		var result = new Array(16);
		for (var i=0; i<16; i++) {
			result[i] = matrix[i];
		}
		return result;
	}

	static createBuffer(gl, data, numElements, bufferType, components, srcStart, attribType, js_type) {
		numElements = numElements || data.length;
		bufferType = bufferType || gl.ARRAY_BUFFER;
		components = components || 3;
		srcStart = srcStart || 0;

		var b = gl.createBuffer();
		gl.bindBuffer(bufferType, b);
		gl.bufferData(bufferType, data, gl.STATIC_DRAW, srcStart, numElements);
		
		b.N = numElements;
		b.gl_type = bufferType;
		b.js_type = js_type ? js_type : data.constructor.name;
		b.attrib_type = attribType ? attribType : Utils.typedArrayToGlType(b.js_type);
		b.components = components;
		b.normalize = false;
		b.stride = 0;
		b.offset = 0;
		return b;
	}

	static createEmptyBuffer(gl, numElements, bufferType, components, attribType, js_type) {
		bufferType = bufferType || gl.ARRAY_BUFFER;
		components = components || 3;
		
		var b = gl.createBuffer();
		gl.bindBuffer(bufferType, b);

		b.N = numElements;
		b.gl_type = bufferType;
		b.js_type = js_type ? js_type : data.constructor.name;
		b.attrib_type = attribType ? attribType : Utils.typedArrayToGlType(b.js_type);
		b.components = components;
		b.normalize = false;
		b.stride = 0;
		b.offset = 0;
		b.writePosition = 0;
		
		// According to the documentation, this should work, but unfortunately, we need to create a useless CPU-side typed array
//		gl.bufferData(bufferType, null, gl.STATIC_DRAW, 0, numElements);
		var typedArrFn = Utils.glTypeToTypedArray(b.attrib_type);
		var uselessArray = new typedArrFn(numElements);
		gl.bufferData(bufferType, uselessArray, gl.STATIC_DRAW, 0, numElements);

		return b;
	}
	
	static updateBuffer(gl, targetGlBuffer, sourceBuffer, pos, count) {
		gl.bindBuffer(targetGlBuffer.gl_type, targetGlBuffer);
		gl.bufferSubData(targetGlBuffer.gl_type, targetGlBuffer.writePosition, sourceBuffer, pos, count);
		targetGlBuffer.writePosition += count;
	}
	
	static createIndexBuffer(gl, data, n) {
		return Utils.createBuffer(gl, data, n, gl.ELEMENT_ARRAY_BUFFER);
	}
}