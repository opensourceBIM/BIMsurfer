// Simple (reusable) class to draw a linebox

export default class LineBoxGeometry {
	constructor(viewer, gl) {
		this.vertices = Array();
		
		this.gl = gl;
		this.viewer = viewer;
		
		var a = [-0.5, 0.5, -0.5];
		var b = [0.5, 0.5, -0.5];
		var c = [0.5, -0.5, -0.5];
		var d = [-0.5, -0.5, -0.5];
		var e = [-0.5, 0.5, 0.5];
		var f = [0.5, 0.5, 0.5];
		var g = [0.5, -0.5, 0.5];
		var h = [-0.5, -0.5, 0.5];
		
		this.pushVertices(a, b);
		this.pushVertices(b, c);
		this.pushVertices(c, d);
		this.pushVertices(d, a);
		
		this.pushVertices(e, f);
		this.pushVertices(f, g);
		this.pushVertices(g, h);
		this.pushVertices(h, e);

		this.pushVertices(a, e);
		this.pushVertices(b, f);
		this.pushVertices(c, g);
		this.pushVertices(d, h);
		
		this.vertices = new Float32Array(this.vertices);
		
		this.verticesBuffer = this.gl.createBuffer();
		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.verticesBuffer);
		this.gl.bufferData(this.gl.ARRAY_BUFFER, this.vertices, this.gl.STATIC_DRAW, 0, 0);
		
		this.programInfo = this.viewer.programManager.getProgram({
			specialType: "line"
		});
	}
	
	pushVertices(a, b) {
		this.vertices.push(a[0]);
		this.vertices.push(a[1]);
		this.vertices.push(a[2]);
		this.vertices.push(b[0]);
		this.vertices.push(b[1]);
		this.vertices.push(b[2]);
	}
	
	getVertexBuffer() {
		return this.verticesBuffer;
	}
	
	// To minimize GPU calls, renderStart and renderStop can (and have to be) used in order to batch-draw a lot of boxes
	renderStart() {
		this.gl.useProgram(this.programInfo.program);
		
		this.gl.uniformMatrix4fv(this.programInfo.uniformLocations.projectionMatrix, false, this.viewer.camera.projMatrix);
		this.gl.uniformMatrix4fv(this.programInfo.uniformLocations.modelViewMatrix, false, this.viewer.camera.viewMatrix);
		
		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.verticesBuffer);
		
		this.gl.vertexAttribPointer(this.programInfo.attribLocations.vertexPosition, 3, this.gl.FLOAT, false, 0, 0);
		this.gl.enableVertexAttribArray(this.programInfo.attribLocations.vertexPosition);
	}
	
	renderStop() {
		
	}
	
	render(color, matrix) {
		this.gl.uniformMatrix4fv(this.programInfo.uniformLocations.matrix, false, matrix);
		this.gl.uniform4fv(this.programInfo.uniformLocations.inputColor, color);
		this.gl.drawArrays(this.gl.LINES, 0, 24);
	}
}