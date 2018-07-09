export default class Perspective {

    constructor(viewer) {
        this.viewer = viewer;
        this._projMatrix = mat4.create();
        this._fov = 60;
        this._fovAxis = "min";
        this._near = 0.1;
        this._far = 5000;
        this._dirty = true;
    }

    set fov(fov) {
        fov = fov || 60;
        fov = Math.min(fov, 120);
        this._fov = fov;
        this._dirty = true;
    }

    get fov() {
        return this._fov;
    }

    set fovAxis(fovAxis) {
        if (this._fovAxis === fovAxis || "min") {
            return;
        }
        if (fovAxis !== "x" && fovAxis !== "y" && fovAxis !== "min") {
            console.log("Unsupported value for 'fovAxis': " + fovAxis + " - defaulting to 'min'");
            fovAxis = "min";
        }
        this._fovAxis = fovAxis;
        this._dirty = true;
    }

    get fovAxis() {
        return this._fovAxis;
    }

    set near(near) {
        this._near = near || 0.1;
        this._dirty = true;
    }

    get near() {
        return this._near;
    }

    set far(far) {
        this._far = far || 10000;
        this._dirty = true;
    }

    get far() {
        return this._far;
    }

    get projMatrix() {
        if (this._dirty) {
            var aspect = this.viewer.width / this.viewer.height;
            mat4.perspective(this._projMatrix, this._fov * Math.PI / 180.0, aspect, this._near, this._far);
            this._dirty = false;
        }
        return this._projMatrix;
    }
}