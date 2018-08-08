/*
 * View-space directional lighting
 */

export default class Lighting {

    constructor(viewer) {

        this.viewer = viewer;
        this._dir = [-0.5, -0.5, -1.0];
        this._color = [1.0, 1.0, 1.0];
        this._ambientColor = [0.3, 0.3, 0.3];
        this._intensity = 0.5;
        this._bufferData = new Float32Array(52);
        this._buffer = null;

        this._dirty = true;
    }

    _update() {
        if (!this._dirty) {
            return;

        }
        var bufferData = this._bufferData;

        bufferData[0] = this._dir[0];
        bufferData[1] = this._dir[1];
        bufferData[2] = this._dir[2];
        bufferData[3] = 0; // unused
        bufferData[4] = this._color[0];
        bufferData[5] = this._color[1];
        bufferData[6] = this._color[2];
        bufferData[7] = 0; // unused
        bufferData[8] = this._ambientColor[0];
        bufferData[9] = this._ambientColor[1];
        bufferData[10] = this._ambientColor[2];
        bufferData[11] = 0; // unused;
        bufferData[12] = this._intensity;

        var gl = this.viewer.gl;

        this._buffer = gl.createBuffer();
        gl.bindBuffer(gl.UNIFORM_BUFFER, this._buffer);
        gl.bufferData(gl.UNIFORM_BUFFER, bufferData, gl.DYNAMIC_DRAW, 0, 52);

        this._dirty = false;
    }

    setDir(dir) {
        this.dir.set(dir);
        this._dirty = true;
    }

    setColor(color) {
        this._color.set(color);
        this._dirty = true;
    }

    setAmbientColor(ambientColor) {
        this._ambientColor.set(ambientColor);
        this._dirty = true;
    }

    setIntensity(intensity) {
        this.intensity = intensity;
        this._dirty = true;
    }

    render(uniformBlockLocation) {
        if (this._dirty) {
            this._update();
        }
        this.viewer.gl.bindBufferBase(this.viewer.gl.UNIFORM_BUFFER, uniformBlockLocation, this._buffer);
    }
}