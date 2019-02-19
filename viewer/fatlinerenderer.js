import {Utils} from './utils.js'
import {ProgramManager} from './programmanager.js'
import {VERTEX_QUANTIZATION} from './programmanager.js'
import {LINE_PRIMITIVES} from './programmanager.js'

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
    constructor(viewer, gl, settings) {
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
    }

    finalize() {
		const gl = this.gl;
		var indexType = this.indexType = ((this.vertexPosition.length / 3) < 256) ? gl.UNSIGNED_BYTE : gl.UNSIGNED_SHORT;
        this.setupFunctions = ["vertexPosition", "nextVertexPosition", "direction", "indices"].map((bufferName, i) => {
			const buf = this[bufferName + "Buffer"] = gl.createBuffer();
			const bufType = bufferName === "indices" ? gl.ELEMENT_ARRAY_BUFFER : gl.ARRAY_BUFFER;
			// @todo, somehow just cannot get direction as a byte to work :(
			const elemType = [this.quantize ? gl.SHORT : gl.FLOAT, this.quantize ? gl.SHORT : gl.FLOAT, gl.FLOAT, indexType][i];
			const typedArrFn = Utils.glTypeToTypedArray(elemType);
			const typedArr = new typedArrFn(this[bufferName]);
			const numElements = bufferName === "direction" ? 1 : 3;
			
			gl.bindBuffer(bufType, buf);
			gl.bufferData(bufType, typedArr, this.gl.STATIC_DRAW);

			return (programInfo) => {
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
    }

    pushVertices(a, b) {
		Array.prototype.push.apply(this.vertexPosition, a);
		Array.prototype.push.apply(this.vertexPosition, b);
		Array.prototype.push.apply(this.vertexPosition, a);
		Array.prototype.push.apply(this.vertexPosition, b);

		Array.prototype.push.apply(this.nextVertexPosition, b);
		Array.prototype.push.apply(this.nextVertexPosition, a);
		Array.prototype.push.apply(this.nextVertexPosition, b);
		Array.prototype.push.apply(this.nextVertexPosition, a);
		
		Array.prototype.push.apply(this.direction, [1,1,-1,-1]);

		Array.prototype.push.apply(this.indices, [0,1,2,1,3,0].map((i)=>{return i+this.idx;}));
		this.idx += 4;
	}
	
	getVertexBuffer() {
		return this.vertexPositionBuffer;
    }
    
    // To minimize GPU calls, renderStart and renderStop can (and have to be) used in order to batch-draw a lot of boxes
	renderStart(viewer) {
		var key = 0;
		key |= (this.quantize ? VERTEX_QUANTIZATION : 0);
		key |= LINE_PRIMITIVES;
		var programInfo = this.programInfo = this.programInfo || this.viewer.programManager.getProgram(key);

		this.gl.useProgram(programInfo.program);

		this.gl.uniformMatrix4fv(programInfo.uniformLocations.projectionMatrix, false, viewer.camera.projMatrix);
		this.gl.uniformMatrix4fv(programInfo.uniformLocations.viewMatrix, false, viewer.camera.viewMatrix);
		const aspect = viewer.width / viewer.height;
		this.gl.uniform1f(programInfo.uniformLocations.aspect, aspect);

		if (this.quantize) {
			if (this.croid) {
				// This is necessary for line renderings of reused geometries.
				this.gl.uniformMatrix4fv(programInfo.uniformLocations.vertexQuantizationMatrix, false, viewer.vertexQuantization.getUntransformedInverseVertexQuantizationMatrixForCroid(this.croid));
			} else {
				this.gl.uniformMatrix4fv(programInfo.uniformLocations.vertexQuantizationMatrix, false, viewer.vertexQuantization.inverseVertexQuantizationMatrixWithGlobalTransformation);
			}
		}

		for (const fn of this.setupFunctions) {
			fn(programInfo);
		}

		this.first = true;
	}
	
	renderStop() {
		
	}
	
	render(color, matrix, thickness) {
		this.gl.uniform1f(this.programInfo.uniformLocations.thickness, thickness || 0.005);
		this.gl.uniformMatrix4fv(this.programInfo.uniformLocations.matrix, false, matrix);
		this.gl.uniform4fv(this.programInfo.uniformLocations.inputColor, color);
		this.gl.drawElements(this.gl.TRIANGLES, this.indices.length, this.indexType, 0);
	}
}