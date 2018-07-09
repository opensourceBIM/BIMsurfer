import Perspective from './perspective.js'
import Orthographic from './orthographic.js'

var tempMat4 = mat4.create();
var tempVec3 = vec3.create();
var tempVec3b = vec3.create();
var tempVec3c = vec3.create();
var tempVec3d = vec3.create();
var tempVec3e = vec3.create();

export default class Camera {

    constructor(viewer) {

        this.viewer = viewer;

        this.perspective = new Perspective(viewer);

        this.orthographic = new Orthographic(viewer);

        this._projection = this.perspective; // Currently active projection
        this._viewMatrix = mat4.create();
        this._normalMatrix = mat4.create();
        this._eye = vec3.fromValues(0.0, 0.0, -10.0); // World-space eye position
        this._target = vec3.fromValues(0.0, 0.0, 0.0); // World-space point-of-interest
        this._up = vec3.fromValues(0.0, 1.0, 0.0); // Camera's "up" vector, always orthogonal to eye->target
        this._worldUp = vec3.fromValues(0.0, 1.0, 0.0); // Direction of "up" in World-space
        this._gimbalLock = true; // When true, orbiting world-space "up", else orbiting camera's local "up"
        this._dirty = true; // Lazy-builds view matrix
    }

    _setDirty() {
        this._dirty = true;
        this.viewer.dirty = true;
    }

    _build() {
        if (this._dirty) {
            mat4.lookAt(this._viewMatrix, this._eye, this._target, this._up);
            mat4.invert(this._normalMatrix, this._viewMatrix);
            mat4.transpose(this._normalMatrix, this._normalMatrix);
            this._dirty = false;
        }
    }

    get viewMatrix() {
        if (this._dirty) {
            this._build();
        }
        return this._viewMatrix;
    }

    get normalMatrix() {
        if (this._dirty) {
            this._build();
        }
        return this._normalMatrix;
    }

    get projMatrix() {
        return this._projection.projMatrix;
    }

    set projectionType(projectionType) {
        switch (projectionType) {
            case "perspective":
                this._projection = this.perspective;
                break;
            case "orthographic":
                this._projection = this.orthographic;
                break;
            default:
                console.log("Unsupported projectionType: " + projectionType);
        }
    }

    get projectionType() {
        return this._projection.type;
    }

    get projection() {
        return this._projection;
    }

    set eye(eye) {
        this._eye.set(eye || [0.0, 0.0, -10.0]);
        this._setDirty();
    }

    get eye() {
        return this._eye;
    }

    set target(target) {
        this._target.set(target || [0.0, 0.0, 0.0]);
        this._setDirty();
    }

    get target() {
        return this._target;
    }

    set up(up) {
        this._up.set(up || [0.0, 1.0, 0.0]);
        this._setDirty();
    }

    get up() {
        return this._up;
    }

    set gimbalLock(gimbalLock) {
        this._gimbalLock = gimbalLock;
    }

    get gimbalLock() {
        return this._gimbalLock;
    }

    orbitYaw(degrees) { // Rotate (yaw) 'eye' and 'up' about 'target', pivoting around World or camera 'up'
        var targetToEye = vec3.subtract(tempVec3, this._eye, this._target);
        mat4.fromRotation(tempMat4, degrees * 0.0174532925, this._gimbalLock ? this._worldUp : this._up);
        vec3.transformMat4(targetToEye, targetToEye, tempMat4);
        vec3.add(this._eye, this._target, targetToEye);
        vec3.transformMat4(this._up, this._up, tempMat4);
        this._setDirty();
    }

    orbitPitch(degrees) { // Rotate (pitch) 'eye' and 'up' about 'target', pivoting around vector ortho to (target->eye) and camera 'up'
        var targetToEye = vec3.subtract(tempVec3, this._eye, this._target);
        var axis = vec3.cross(tempVec3b, vec3.normalize(tempVec3c, targetToEye), vec3.normalize(tempVec3d, this._up)); // Pivot vector is orthogonal to target->eye
        mat4.fromRotation(tempMat4, degrees * 0.0174532925, axis);
        vec3.transformMat4(targetToEye, targetToEye, tempMat4); // Rotate vector
        vec3.add(this._eye, this._target, targetToEye); // Derive 'eye' from vector and 'target'
        vec3.transformMat4(this._up, this._up, tempMat4); // Rotate 'up' vector
        this._setDirty();
    }

    yaw(degrees) { // Rotate (yaw) 'target' and 'up' about 'eye', pivoting around 'up'
        var eyeToTarget = vec3.subtract(tempVec3, this._target, this._eye); 
        mat4.fromRotation(tempMat4, degrees * 0.0174532925, this._gimbalLock ? this._worldUp : this._up);
        vec3.transformMat4(eyeToTarget, eyeToTarget, tempMat4); // Rotate vector
        vec3.add(this._target, this._eye, eyeToTarget); // Derive 'target' from eye and vector
        if (this._gimbalLock) {
            vec3.transformMat4(this._up, this._up, tempMat4); // Rotate 'up' vector
        }
        this._setDirty();
    }

    pitch(degrees) { // Rotate (pitch) 'eye' and 'up' about 'target', pivoting around horizontal vector ortho to (target->eye) and camera 'up'
        var eyeToTarget = vec3.subtract(tempVec3, this._target, this._eye); 
        var axis = vec3.cross(tempVec3b, vec3.normalize(tempVec3c, eyeToTarget), vec3.normalize(tempVec3d, this._up)); // Pivot vector is orthogonal to target->eye
        mat4.fromRotation(tempMat4, degrees * 0.0174532925, axis);
        vec3.transformMat4(eyeToTarget, eyeToTarget, tempMat4); // Rotate vector
        vec3.add(this._target, this._eye, eyeToTarget); // Derive 'target' from eye and vector
        vec3.transformMat4(this._up, this._up, tempMat4); // Rotate 'up' vector
        this._setDirty();
    }

    pan(pan) { // Translate 'eye' and 'target' along local camera axis
        var eyeToTarget = vec3.subtract(tempVec3, this._eye, this._target);
        var vec = [0, 0, 0];
        if (pan[0] !== 0) {
            let v = vec3.cross(tempVec3b, vec3.normalize(tempVec3c, eyeToTarget), vec3.normalize(tempVec3d, this._up));
            vec3.scale(v, pan[0]);
            vec[0] += v[0];
            vec[1] += v[1];
            vec[2] += v[2];
        }
        if (pan[1] !== 0) {
            let v = vec3.scale(tempVec3, vec3.normalize(tempVec3b, this._up), pan[1]);
            vec[0] += v[0];
            vec[1] += v[1];
            vec[2] += v[2];
        }
        if (pan[2] !== 0) {
            let v = vec3.scale(tempVec3, vec3.normalize(tempVec3b, eyeToTarget), pan[2]);
            vec[0] += v[0];
            vec[1] += v[1];
            vec[2] += v[2];
        }
        vec3.add(this._eye, this._eye, vec);
        this._target = vec3.add(this._target, this._target, vec);
        this._setDirty();
    }

    zoom(delta) { // Translate 'eye' by given increment on (eye->target) vector
        var targetToEye = vec3.subtract(tempVec3, this._eye, this._target); 
        var lenLook = Math.abs(vec3.length(targetToEye));
        var newLenLook = Math.abs(lenLook + delta);
        if (newLenLook < 0.5) {
            return;
        }
        vec3.normalize(targetToEye, targetToEye);
        vec3.scale(targetToEye, targetToEye, newLenLook);
        vec3.add(this._eye, this._target, targetToEye);
        this._setDirty();
    }
}