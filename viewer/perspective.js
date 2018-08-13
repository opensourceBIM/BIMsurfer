export default class Perspective {

    constructor(viewer) {

        var self = this;

        this.viewer = viewer;
        this._projMatrix = mat4.create();
        this._fov = 45;
        this._fovAxis = "min";
        this._near = 0.01;
        this._far = 100;
        this._dirty = true;
    }

    _setDirty() {
        this._dirty = true;
        this.viewer.dirty = true;
    }

    set fov(fov) {
        fov = fov || 45;
        fov = Math.min(fov, 120);
        this._fov = fov;
        this._setDirty();
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
        this._setDirty();
    }

    get fovAxis() {
        return this._fovAxis;
    }

    set near(near) {
        this._near = near || 0.01;
        this._setDirty();
    }

    get near() {
        return this._near;
    }

    set far(far) {
        this._far = far || 100;
        this._setDirty();
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