import { Utils } from "./utils.js";
import { ProgramManager } from "./programmanager.js";
import { VERTEX_QUANTIZATION } from "./programmanager.js";
import { LINE_PRIMITIVES } from "./programmanager.js";

/**
 *
 * As you many know, line rendering with thickness is not well-supported in
 * WebGL implementations (mostly due to WebGL implementations on Windows
 * defaulting to emulating OpenGL calls via ANGLE on DirectX 9). Therefore
 * lines are rendered using triangles. This greatly blows up the memory
 * requirements as enough information needs to be passed to expand lines
 * in the vertex shader to a constant thickness. See below:
 * 
 * @todo: we should probably see if some of this overhead can be reduced
 *        with drawElementsInstanced() or by cleverly aligning strides and
 *        or offsets.
 * 
 * (A,B,-1)                                     (B,A,-1)
 *  +-------------------------------------------------+
 *  |                                                 |
 *  | (A)                                         (B) |
 *  |  +-------------------------------------------+  |
 *  |                                                 |
 *  |                                                 |
 *  +-------------------------------------------------+
 * (A,B,1)                                       (B,A,1)
 * 
 */
export class FatLineRenderer {
	constructor(viewer, gl, settings, unquantizationMatrix) {
		this.viewer = viewer;
		settings = settings || {};
		this.idx = 0;
		this.gl = gl;
		this.vertexPosition = Array();
		this.nextVertexPosition = Array();
		this.direction = Array();
		this.indices = Array();
		this.quantize = settings.quantize || false;
		this.matrixMap = new Map();
		this.croid = null;
		this.unquantizationMatrix = unquantizationMatrix;
		this.nrIndices = 0;

		this.defaultDirection = new Float32Array([1, 1, -1, -1]);

		var key = 0;
		key |= (this.quantize ? VERTEX_QUANTIZATION : 0);
		key |= LINE_PRIMITIVES;
		this.programInfo = this.viewer.programManager.getProgram(key);
	}

	init(size) {
		// This method initializes the arrays as typed arrays with a known size, otherwise the arrays are used

		this.indexType = (size * 4 < 256) ? this.gl.UNSIGNED_BYTE : this.gl.UNSIGNED_SHORT;
		if (size * 4 > 65536) {
			this.indexType = this.gl.UNSIGNED_INT;
		}
		const elemType = this.quantize ? this.gl.SHORT : this.gl.FLOAT;
		const typedArrFn = Utils.glTypeToTypedArray(elemType);
		this.vertexPosition = new typedArrFn(size * 12);
		this.vertexPosition.pos = 0;
		this.nextVertexPosition = new typedArrFn(size * 12);
		this.nextVertexPosition.pos = 0;

		// TODO this is always 1, 1, -1, -1, why?
		this.direction = new Float32Array(size * 4);
		this.direction.pos = 0;
		for (var i = 0; i < size; i++) {
			this.direction.set(this.defaultDirection, this.direction.pos);
			this.direction.pos += 4;
		}

		this.indices = this.indexType == this.gl.UNSIGNED_BYTE ? new Uint8Array(size * 6) : (this.indexType == this.gl.UNSIGNED_SHORT ? new Uint16Array(size * 6) : new Uint32Array(size * 6));
		this.indices.pos = 0;

		this.nrIndices = size * 6;
	}

	finalize() {
		const gl = this.gl;
		this.setupFunctions = ["vertexPosition", "nextVertexPosition", "direction", "indices"].map((bufferName, i) => {
			const buf = this[bufferName + "Buffer"] = gl.createBuffer();
			const bufType = bufferName === "indices" ? gl.ELEMENT_ARRAY_BUFFER : gl.ARRAY_BUFFER;
			// @todo, somehow just cannot get direction as a byte to work :(
			const elemType = [this.quantize ? gl.SHORT : gl.FLOAT, this.quantize ? gl.SHORT : gl.FLOAT, gl.FLOAT, this.indexType][i];
			if (Array.isArray(this[bufferName])) {
				const typedArrFn = Utils.glTypeToTypedArray(elemType);
				var typedArr = new typedArrFn(this[bufferName]);
			} else {
				var typedArr = this[bufferName];
			}
			const numElements = bufferName === "direction" ? 1 : 3;

			gl.bindBuffer(bufType, buf);
			gl.bufferData(bufType, typedArr, this.gl.STATIC_DRAW);

			return (programInfo) => {
				// TODO this could be done with a VAO?
				gl.bindBuffer(bufType, buf);
				if (bufType != gl.ELEMENT_ARRAY_BUFFER) {
					var loc = programInfo.attribLocations[bufferName];
					if (elemType == gl.FLOAT) {
						gl.vertexAttribPointer(loc, numElements, elemType, false, 0, 0);
					} else {
						gl.vertexAttribIPointer(loc, numElements, elemType, 0, 0);
					}
					gl.enableVertexAttribArray(loc);
				}
			};
		});

		// Time to cleanup the CPU buffers?
		this.vertexPosition = null;
		this.nextVertexPosition = null;
		this.direction = null;
		this.indices = null;
	}

	pushVertices(a, b) {
		this.vertexPosition.set(a, this.vertexPosition.pos);
		this.vertexPosition.pos += 3;
		this.vertexPosition.set(b, this.vertexPosition.pos);
		this.vertexPosition.pos += 3;
		this.vertexPosition.set(a, this.vertexPosition.pos);
		this.vertexPosition.pos += 3;
		this.vertexPosition.set(b, this.vertexPosition.pos);
		this.vertexPosition.pos += 3;

		this.nextVertexPosition.set(b, this.nextVertexPosition.pos);
		this.nextVertexPosition.pos += 3;
		this.nextVertexPosition.set(a, this.nextVertexPosition.pos);
		this.nextVertexPosition.pos += 3;
		this.nextVertexPosition.set(b, this.nextVertexPosition.pos);
		this.nextVertexPosition.pos += 3;
		this.nextVertexPosition.set(a, this.nextVertexPosition.pos);
		this.nextVertexPosition.pos += 3;

		// This is faster than using .set because that requires us to create an array first
		this.indices[this.indices.pos++] = this.idx;
		this.indices[this.indices.pos++] = this.idx + 1;
		this.indices[this.indices.pos++] = this.idx + 2;
		this.indices[this.indices.pos++] = this.idx + 1;
		this.indices[this.indices.pos++] = this.idx + 3;
		this.indices[this.indices.pos++] = this.idx;

		this.idx += 4;
	}

	getVertexBuffer() {
		return this.vertexPositionBuffer;
	}

	// To minimize GPU calls, renderStart and renderStop can (and have to be) used in order to batch-draw a lot of boxes
	renderStart(viewer, renderLayer) {
		this.gl.useProgram(this.programInfo.program);

		this.gl.uniformMatrix4fv(this.programInfo.uniformLocations.projectionMatrix, false, viewer.camera.projMatrix);
		this.gl.uniformMatrix4fv(this.programInfo.uniformLocations.viewMatrix, false, viewer.camera.viewMatrix);
		this.gl.uniform3fv(this.programInfo.uniformLocations.postProcessingTranslation, renderLayer.postProcessingTranslation);

		const aspect = viewer.width / viewer.height;
		this.gl.uniform1f(this.programInfo.uniformLocations.aspect, aspect);

		if (this.quantize) {
			if (this.croid) {
				// This is necessary for line renderings of reused geometries.
				this.gl.uniformMatrix4fv(this.programInfo.uniformLocations.vertexQuantizationMatrix, false, viewer.vertexQuantization.getUntransformedInverseVertexQuantizationMatrixForCroid(this.croid));
			} else {
				if (this.unquantizationMatrix) {
					this.gl.uniformMatrix4fv(this.programInfo.uniformLocations.vertexQuantizationMatrix, false, this.unquantizationMatrix);
				}
			}
		}

		this.first = true;
	}

	renderStop() {

	}

	render(color, matrix, thickness) {
		for (const fn of this.setupFunctions) {
			fn(this.programInfo);
		}

		this.gl.uniform1f(this.programInfo.uniformLocations.thickness, thickness || 0.005);
		this.gl.uniformMatrix4fv(this.programInfo.uniformLocations.matrix, false, matrix);
		this.gl.uniform4fv(this.programInfo.uniformLocations.inputColor, color);
		this.gl.drawElements(this.gl.TRIANGLES, this.nrIndices, this.indexType, 0);
	}
}