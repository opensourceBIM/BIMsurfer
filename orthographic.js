export default class Orthographic {

    constructor(viewer) {
        this.viewer = viewer;
        this._projMatrix = mat4.create();
        this._left = -1.0;
        this._bottom = -1.0;
        this._near = 0.1;
        this._right = 1.0;
        this._top = 1.0;
        this._far = 5000;
        this._dirty = true;
    }

    set left(left) {
        left = left || -1.0;
        this._left = left;
        this._dirty = true;
    }

    get left() {
        return this._left;
    }

    set bottom(bottom) {
        bottom = bottom || -1.0;
        this._bottom = bottom;
        this._dirty = true;
    }

    get bottom() {
        return this._bottom;
    }

    set near(near) {
        this._near = near || 0.1;
        this._dirty = true;
    }

    get near() {
        return this._near;
    }

    set right(right) {
        right = right || 1.0;
        this._right = right;
        this._dirty = true;
    }

    get right() {
        return this._right;
    }

    set top(top) {
        this._top = top || 1.0;
        this._dirty = true;
    }

    get top() {
        return this._top;
    }

    set far(far) {
        this._far = far || 5000;
        this._dirty = true;
    }

    get far() {
        return this._far;
    }

    get projMatrix() {
        if (this._dirty) {
            mat4.ortho(this._projMatrix, this._left, this._right, this._bottom, this._top, this._near, this._far);
            this._dirty = false;
        }
        return this._projMatrix;
    }
}