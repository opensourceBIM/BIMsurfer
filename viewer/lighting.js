/*
 * View-space directional lighting
 */

export default class Lighting {

	constructor(viewer) {

		this.viewer = viewer;
		this.dir = [0.5, 0.5, -1.0];
		this.color = [1.0, 1.0, 1.0];
		this.ambientColor = [0.3, 0.3, 0.3];
		this.intensity = 0.5;
		this.buffer = new Float32Array(52);

		this.createLightingBuffer();
	}

	createLightingBuffer() {

		var buffer = this.buffer;

		buffer[0] = this.dir[0];
		buffer[1] = this.dir[1];
		buffer[2] = this.dir[2];
		buffer[3] = 0; // unused
		buffer[4] = this.color[0];
		buffer[5] = this.color[1];
		buffer[6] = this.color[2];
		buffer[7] = 0; // unused
		buffer[8] = this.ambientColor[0];
		buffer[9] = this.ambientColor[1];
		buffer[10] = this.ambientColor[2];
		buffer[11] = 0; // unused;
		buffer[12] = this.intensity;

		var gl = this.viewer.gl;

		this.lightingBuffer = gl.createBuffer();
		gl.bindBuffer(gl.UNIFORM_BUFFER, this.lightingBuffer);
		gl.bufferData(gl.UNIFORM_BUFFER, buffer, gl.DYNAMIC_DRAW, 0, 52);
	}

	draw() {

	}
}