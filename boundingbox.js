/*
 * Not used.
 * For debugging purposes the idea is to be able to show bounding boxes wherever to highlight regions
 */
export default class BoundingBox {
	// TODO reuse buffer, obviously
	
	constructor(viewer, gl, bounds) {
		this.vertices = Array();
		
		this.gl = gl;
		this.viewer = viewer;
		this.bounds = bounds;
		
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
		
		this.matrix = mat4.create();
		mat4.translate(this.matrix, this.matrix, [(bounds[0] + bounds[3]) / 2, (bounds[1] + bounds[4]) / 2, (bounds[2] + bounds[5]) / 2]);
		mat4.scale(this.matrix, this.matrix, [bounds[3] - bounds[0], bounds[4] - bounds[1], bounds[5] - bounds[2]]);
	}
	
	pushVertices(a, b) {
		this.vertices.push(a[0]);
		this.vertices.push(a[1]);
		this.vertices.push(a[2]);
		this.vertices.push(b[0]);
		this.vertices.push(b[1]);
		this.vertices.push(b[2]);
	}
	
	render() {
		var programInfo = this.viewer.programManager.getProgram({
			specialType: "line"
		});
		
		this.gl.useProgram(programInfo.program);
		
		this.gl.uniformMatrix4fv(programInfo.uniformLocations.matrix, false, this.matrix);
		this.gl.uniformMatrix4fv(programInfo.uniformLocations.projectionMatrix, false, this.viewer.camera.projMatrix);
		this.gl.uniformMatrix4fv(programInfo.uniformLocations.modelViewMatrix, false, this.viewer.camera.viewMatrix);
		
		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.verticesBuffer);
		
		this.gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition,	3, this.gl.FLOAT, false, 0, 0);
		this.gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);
		this.gl.drawArrays(this.gl.LINES, 0, 24);
	}
}