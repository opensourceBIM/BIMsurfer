// Not used, the idea is to be able to show a virtual frustom for debugging purposes

export default class VirtualFrustum {
	constructor(viewer, projectionMatrix, zNear, zFar) {
		this.viewer = viewer;
		this.gl = viewer.gl;
		
		var inverse = mat4.create();
		mat4.invert(inverse, projectionMatrix);
	
		var points = [
			vec4.fromValues(-1, -1, -1, 1),
			vec4.fromValues(1, -1, -1, 1),
			vec4.fromValues(1, 1, -1, 1),
			vec4.fromValues(-1, 1, -1, 1),
			vec4.fromValues(-1, -1, 1, 1),
			vec4.fromValues(1, -1, 1, 1),
			vec4.fromValues(1, 1, 1, 1),
			vec4.fromValues(-1, 1, 1, 1)
		];
		
		for (var p of points) {
			// Make a smaller version for now
//			vec4.scale(p, p, 0.1);
			vec4.transformMat4(p, p, inverse);
		}
		
		this.vertices = Array();
		
		this.pushVertices(points, 0, 1);
		this.pushVertices(points, 1, 2);
		this.pushVertices(points, 2, 3);
		this.pushVertices(points, 3, 0);

		this.pushVertices(points, 4, 5);
		this.pushVertices(points, 5, 6);
		this.pushVertices(points, 6, 7);
		this.pushVertices(points, 7, 4);

		this.pushVertices(points, 0, 4);
		this.pushVertices(points, 1, 5);
		this.pushVertices(points, 2, 6);
		this.pushVertices(points, 3, 7);
		
		this.vertices = new Float32Array(this.vertices);
		console.log(this.vertices);
		
		this.verticesBuffer = this.gl.createBuffer();
		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.verticesBuffer);
		this.gl.bufferData(this.gl.ARRAY_BUFFER, this.vertices, this.gl.STATIC_DRAW, 0, 0);
		
		this.programInfo = this.viewer.programManager.getProgram({
			specialType: "line"
		});
	}
	
	pushVertices(points, a, b) {
		this.vertices.push(points[a][0]);
		this.vertices.push(points[a][1]);
		this.vertices.push(points[a][2]);
		this.vertices.push(points[b][0]);
		this.vertices.push(points[b][1]);
		this.vertices.push(points[b][2]);
	}
	
	render() {
		this.gl.useProgram(this.programInfo.program);
		
		this.gl.uniformMatrix4fv(this.programInfo.uniformLocations.projectionMatrix, false, this.viewer.camera.projMatrix);
		this.gl.uniformMatrix4fv(this.programInfo.uniformLocations.viewMatrix, false, mat4.create());
		
		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.verticesBuffer);
		
		this.gl.vertexAttribPointer(this.programInfo.attribLocations.vertexPosition, 3, this.gl.FLOAT, false, 0, 0);
		this.gl.enableVertexAttribArray(this.programInfo.attribLocations.vertexPosition);

		var color = [0, 1, 0, 1];
		this.gl.uniformMatrix4fv(this.programInfo.uniformLocations.matrix, false, mat4.create());
		this.gl.uniform4fv(this.programInfo.uniformLocations.inputColor, color);
		this.gl.drawArrays(this.gl.LINES, 0, 24);
	}
}