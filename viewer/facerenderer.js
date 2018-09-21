export default class FaceRenderer {
	constructor(gl, settings) {
		this.settings = settings;
        this.gl = gl;
        this.vertices = [];
    }
	
	pushTriangle(a, b, c) {
		this.vertices.push(a[0]);
		this.vertices.push(a[1]);
		this.vertices.push(a[2]);
		
		this.vertices.push(b[0]);
		this.vertices.push(b[1]);
		this.vertices.push(b[2]);
		
		this.vertices.push(c[0]);
		this.vertices.push(c[1]);
		this.vertices.push(c[2]);
	}
	
	finalize() {
		var buffer = new Float32Array(this.vertices);
		
		this.glBuffer = this.gl.createBuffer();
		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.glBuffer);
		this.gl.bufferData(this.gl.ARRAY_BUFFER, buffer, this.gl.STATIC_DRAW);
	}

	renderStart(viewer) {
		var programInfo = this.programInfo = this.programInfo || viewer.programManager.getProgram({
			trianglePrimitives: true
		});
		this.gl.useProgram(programInfo.program);
		
		this.gl.uniformMatrix4fv(programInfo.uniformLocations.projectionMatrix, false, viewer.camera.projMatrix);
		this.gl.uniformMatrix4fv(programInfo.uniformLocations.viewMatrix, false, viewer.camera.viewMatrix);

		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.glBuffer);
		this.gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, 3, this.gl.FLOAT, false, 0, 0);
		this.gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);

		this.first = true;
	}

	renderStop() {
			
	}

	render(matrix) {
		this.gl.uniformMatrix4fv(this.programInfo.uniformLocations.matrix, false, matrix);
		this.gl.drawArrays(this.gl.TRIANGLES, 0, this.vertices.length / 3);
	}
}