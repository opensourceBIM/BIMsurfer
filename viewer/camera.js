import Perspective from './perspective.js'
import Orthographic from './orthographic.js'

var tempMat4 = mat4.create();
var tempMat4b = mat4.create();
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
        this._viewNormalMatrix = mat3.create();

        this._worldScale = 1.0;

        this._eye = vec3.fromValues(0.0, 0.0, -10.0); // World-space eye position
        this._target = vec3.fromValues(0.0, 0.0, 0.0); // World-space point-of-interest
        this._up = vec3.fromValues(0.0, 1.0, 0.0); // Camera's "up" vector, always orthogonal to eye->target

        this._worldAxis = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
        this._worldUp = vec3.fromValues(0.0, 1.0, 0.0); // Direction of "up" in World-space
        this._worldRight = vec3.fromValues(1, 0, 0); // Direction of "right" in World-space
        this._worldForward = vec3.fromValues(0, 0, -1); // Direction of "forward" in World-space

        this._gimbalLock = true; // When true, orbiting world-space "up", else orbiting camera's local "up"
        this._constrainPitch = true; // When true, will prevent camera from being rotated upside-down

        this._dirty = true; // Lazy-builds view matrix
    }

    _setDirty() {
        this._dirty = true;
        this.viewer.dirty = true;
    }

    _build() {
        if (this._dirty) {
            mat4.lookAt(this._viewMatrix, this._eye, this._target, this._up);
            var scale = tempVec3;
            scale[0] = this._worldScale;
            scale[1] = this._worldScale;
            scale[2] = this._worldScale;
            mat4.identity(tempMat4);
            mat4.scale(tempMat4, tempMat4, scale);
            mat4.multiply(this._viewMatrix, tempMat4, this._viewMatrix);
            mat3.fromMat4(tempMat4b, this._viewMatrix);
            mat3.invert(tempMat4b, tempMat4b);
            mat3.transpose(this._viewNormalMatrix, tempMat4b);
            this._dirty = false;
        }
    }

    get worldScale() {
        return this._worldScale;
    }

    set worldScale(worldScale) {
        this._worldScale = worldScale || 1.0;
        this._setDirty();
    }

    get viewMatrix() {
        if (this._dirty) {
            this._build();
        }
        return this._viewMatrix;
    }

    get viewNormalMatrix() {
        if (this._dirty) {
            this._build();
        }
        return this._viewNormalMatrix;
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

    set constrainPitch(constrainPitch) {
        this._constrainPitch = constrainPitch;
    }

    get constrainPitch() {
        return this._constrainPitch;
    }

    /**
     Indicates the up, right and forward axis of the World coordinate system.

     This is used for deriving rotation axis for yaw orbiting, and for moving camera to axis-aligned positions.

     Has format: ````[rightX, rightY, rightZ, upX, upY, upZ, forwardX, forwardY, forwardZ]````
     */
    set worldAxis(worldAxis) {
        this._worldAxis.set(worldAxis || [1, 0, 0, 0, 1, 0, 0, 0, 1]);
        this._worldRight[0] = this._worldAxis[0];
        this._worldRight[1] = this._worldAxis[1];
        this._worldRight[2] = this._worldAxis[2];
        this._worldUp[0] = this._worldAxis[3];
        this._worldUp[1] = this._worldAxis[4];
        this._worldUp[2] = this._worldAxis[5];
        this._worldForward[0] = this._worldAxis[6];
        this._worldForward[1] = this._worldAxis[7];
        this._worldForward[2] = this._worldAxis[8];
        this._setDirty();
    }

    get worldAxis() {
        return this._worldAxis;
    }

    get worldUp() {
        return this._worldUp;
    }

    get worldRight() {
        return this._worldRight;
    }

    get worldForward() {
        return this._worldForward;
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
        var a = vec3.normalize(tempVec3c, targetToEye);
        var b = vec3.normalize(tempVec3d, this._up);
        var axis = vec3.cross(tempVec3b, a, b); // Pivot vector is orthogonal to target->eye
        mat4.fromRotation(tempMat4, degrees * 0.0174532925, axis);
        vec3.transformMat4(targetToEye, targetToEye, tempMat4); // Rotate vector
        var newUp = vec3.transformMat4(tempVec3d, this._up, tempMat4); // Rotate 'up' vector
        if (this._constrainPitch) {
            var angle = vec3.dot(newUp, this._worldUp) / 0.0174532925; // Don't allow 'up' to go up[side-down with respect to World 'up'
            if (angle < 1) {
                return;
            }
        }
        this._up.set(newUp);
        vec3.add(this._eye, this._target, targetToEye); // Derive 'eye' from vector and 'target'
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
        var a = vec3.normalize(tempVec3c, eyeToTarget);
        var b = vec3.normalize(tempVec3d, this._up);
        var axis = vec3.cross(tempVec3b, a, b); // Pivot vector is orthogonal to target->eye
        mat4.fromRotation(tempMat4, degrees * 0.0174532925, axis);
        vec3.transformMat4(eyeToTarget, eyeToTarget, tempMat4); // Rotate vector
        var newUp = vec3.transformMat4(tempVec3d, this._up, tempMat4); // Rotate 'up' vector
        if (this._constrainPitch) {
            var angle = vec3.dot(newUp, this._worldUp) / 0.0174532925; // Don't allow 'up' to go up[side-down with respect to World 'up'
            if (angle < 1) {
                return;
            }
        }
        this._up.set(newUp);
        vec3.add(this._target, this._eye, eyeToTarget); // Derive 'target' from eye and vector
        this._setDirty();
    }

    pan(pan) { // Translate 'eye' and 'target' along local camera axis
        var eyeToTarget = vec3.subtract(tempVec3, this._eye, this._target);
        var vec = [0, 0, 0];
        if (pan[0] !== 0) {
            let a = vec3.normalize(tempVec3b, eyeToTarget); // Get  vector orthogonal to 'up' and eye->target
            let b = vec3.normalize(tempVec3c, this._up);
            let v = vec3.cross(tempVec3d, a, b);
            vec3.scale(v, v, pan[0]);
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

    viewFit(aabb, fitFOV) {
        aabb = aabb || this.viewer.modelBounds;
        fitFOV = fitFOV || 45;
        var eyeToTarget = vec3.normalize(tempVec3b, vec3.subtract(tempVec3, this._eye, this._target));
        var diagonal = Math.sqrt(
            Math.pow(aabb[3] - aabb[0], 2) +
            Math.pow(aabb[4] - aabb[1], 2) +
            Math.pow(aabb[5] - aabb[2], 2));
        var center = [
            (aabb[3] + aabb[0]) / 2,
            (aabb[4] + aabb[1]) / 2,
            (aabb[5] + aabb[2]) / 2
        ];
        this._target.set(center);
        var sca = Math.abs(diagonal / Math.tan(fitFOV * 0.0174532925));
        this._eye[0] = this._target[0] + (eyeToTarget[0] * sca);
        this._eye[1] = this._target[1] + (eyeToTarget[1] * sca);
        this._eye[2] = this._target[2] + (eyeToTarget[2] * sca);
    }
}