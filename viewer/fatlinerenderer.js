/*
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
export default class FatLineRenderer {
    constructor(gl) {
        this.gl = gl;
        this.vertexPosition = Array();
		this.nextVertexPosition = Array();
		this.direction = Array();
		this.indices = Array();
    }

    finalize() {
        this.setupFunctions = ["vertexPosition", "nextVertexPosition", "direction", "indices"].map((bufferName, i) => {
			const gl = this.gl;

			const buf = this[bufferName + "Buffer"] = gl.createBuffer();
			const bufType = bufferName === "indices" ? gl.ELEMENT_ARRAY_BUFFER : gl.ARRAY_BUFFER;
			// @todo, somehow just cannot get direction as a byte to work :(
			const elemType = [gl.FLOAT, gl.FLOAT, gl.FLOAT, gl.UNSIGNED_BYTE][i];
			const typedArrFn = (new Map([
				[gl.FLOAT, Float32Array],
                [gl.UNSIGNED_BYTE, Uint8Array],
                [gl.UNSIGNED_SHORT, Uint16Array],
				[gl.BYTE, Int8Array]
			])).get(elemType);
			const typedArr = new typedArrFn(this[bufferName]);
			const numElements = bufferName === "direction" ? 1 : 3;
			
			gl.bindBuffer(bufType, buf);
			gl.bufferData(bufType, typedArr, this.gl.STATIC_DRAW);

			return () => {
				gl.bindBuffer(bufType, buf);
				if (bufType != gl.ELEMENT_ARRAY_BUFFER) {
					var loc = this.programInfo.attribLocations[bufferName];
					if (elemType == gl.FLOAT) {
						gl.vertexAttribPointer(loc, numElements, elemType, false, 0, 0);
					} else {
						gl.vertexAttribIPointer(loc, numElements, elemType, 0, 0);
					}
					gl.enableVertexAttribArray(loc);
				}
			};
		});

		this.programInfo = this.viewer.programManager.getProgram({
			linePrimitives: true
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
	renderStart() {
		this.gl.useProgram(this.programInfo.program);
		
		this.gl.uniformMatrix4fv(this.programInfo.uniformLocations.projectionMatrix, false, this.viewer.camera.projMatrix);
		this.gl.uniformMatrix4fv(this.programInfo.uniformLocations.viewMatrix, false, this.viewer.camera.viewMatrix);
		const aspect = this.viewer.width / this.viewer.height;
		this.gl.uniform1f(this.programInfo.uniformLocations.aspect, aspect);

		for (const fn of this.setupFunctions) {
			fn();
		}

		this.first = true;
	}
	
	renderStop() {
		
	}
	
	render(color, matrix, thickness) {
		this.gl.uniform1f(this.programInfo.uniformLocations.thickness, thickness || 0.005);
		this.gl.uniformMatrix4fv(this.programInfo.uniformLocations.matrix, false, matrix);
		this.gl.uniform4fv(this.programInfo.uniformLocations.inputColor, color);
		this.gl.drawElements(
			this.gl.TRIANGLES,
			this.indices.length,
			this.gl.UNSIGNED_BYTE, 
			0);
	}
}