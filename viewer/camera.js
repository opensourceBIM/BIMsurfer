import * as mat4 from "./glmatrix/mat4.js";
import * as mat3 from "./glmatrix/mat3.js";
import * as vec3 from "./glmatrix/vec3.js";
import * as vec4 from "./glmatrix/vec4.js";

import {AnimatedVec3} from "./animatedvec3.js";
import {Perspective} from "./perspective.js";
import {Orthographic} from "./orthographic.js";

/**
 A **Camera** defines viewing and projection transforms for its Viewer.
 */
export class Camera {

    constructor(viewer) {
        this.viewer = viewer;

        this.perspective = new Perspective(viewer);

        this.orthographic = new Orthographic(viewer);

        this._projection = this.perspective; // Currently active projection
        this._viewMatrix = mat4.create();
        this._viewProjMatrix = mat4.create();
        this._viewMatrixInverted = mat4.create();
        this._viewProjMatrixInverted = mat4.create();

        this._viewNormalMatrix = mat3.create();

        this._eye = new AnimatedVec3(0.0, 0.0, -10.0); // World-space eye position
        this._target = new AnimatedVec3(0.0, 0.0, 0.0); // World-space point-of-interest        
        
        this._up = vec3.fromValues(0.0, 1.0, 0.0); // Camera's "up" vector, always orthogonal to eye->target
        this._center = vec3.copy(vec3.create(), this._target.get());
        this._negatedCenter = vec3.create();
        vec3.negate(this._negatedCenter, this._center);

        this._worldAxis = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
        this._worldUp = vec3.fromValues(0.0, 1.0, 0.0); // Direction of "up" in World-space
        this._worldRight = vec3.fromValues(1, 0, 0); // Direction of "right" in World-space
        this._worldForward = vec3.fromValues(0, 0, -1); // Direction of "forward" in World-space

        this._gimbalLock = true; // When true, orbiting world-space "up", else orbiting camera's local "up"
        this._constrainPitch = true; // When true, will prevent camera} from being rotated upside-down

        this._dirty = true; // Lazy-builds view matrix
        this._locked = false;

        this._modelBounds = null;

        this.tempMat4 = mat4.create();
        this.tempMat3b = mat3.create();
        this.tempVec3 = vec3.create();
        this.tempVec3b = vec3.create();
        this.tempVec3c = vec3.create();
        this.tempVec3d = vec3.create();
        this.tempVec3e = vec3.create();
        this.tempVecBuild = vec3.create();

        this.tmp_modelBounds = vec3.create();

        this.yawMatrix = mat4.create();
        
        // Until there is a proper event handler mechanism, just do it manually.
        this.listeners = [];
        this.lowVolumeListeners = [];

        this._orbitting = false;

        this._tmp_interpolate_current_dir = vec3.create();
	    this._tmp_interpolate_new_dir = vec3.create();
	    this._tmp_interpolate_a = vec3.create();
	    this._tmp_interpolate_b = vec3.create();
	    this._tmp_interpolate_c = vec3.create();
	    this._tmp_interpolate_d = vec4.create();
	    this._tmp_interpolate_e = mat4.create();
        this._tmp_interpolate_f = vec3.create();
        
        this._tmp_eye = vec3.create();
        this._tmp_target = vec3.create();
    }

    lock() {
        this._locked = true;
    }

    unlock() {
        this._locked = false;
        this._build();
    }

    _setDirty() {
        this._dirty = true;
        this.viewer.dirty = 2;
    }

    setModelBounds(bounds) {
        this._modelBounds = [];

        this.perspective.setModelBounds(vec3.clone(bounds));
        this.orthographic.setModelBounds(vec3.clone(bounds));
        
        // Store aabb calculated from points
        let a = vec3.fromValues(+Infinity, +Infinity, +Infinity);
        let b = vec3.fromValues(-Infinity, -Infinity, -Infinity);

        let zero_one = [0,1];

        for (let i of zero_one) {
            for (let j of zero_one) {
                for (let k of zero_one) {
                    let v = vec3.fromValues(bounds[3*i+0], bounds[3*j+1], bounds[3*k+2]);
                    this._modelBounds.push(v);

                    for (let l = 0; l < 3; ++l) {
                        if (v[l] < a[l]) {
                            a[l] = v[l];
                        }
                        if (v[l] > b[l]) {
                            b[l] = v[l];
                        }
                    }
                }
            }   
        }

        vec3.add(a, a, b);
        vec3.scale(a, a, 0.5);

        this._center.set(a);
        vec3.negate(this._negatedCenter, this._center);
        this._dirty = true;
    }

    forceBuild() {
        let eye = this._eye.get();
        let target = this._target.get();

   		vec3.set(this._up, 0, 0, 1);
        vec3.subtract(this.tempVecBuild, target, eye);
        vec3.normalize(this.tempVecBuild, this.tempVecBuild);
        vec3.cross(this._up, this.tempVecBuild, this._up);
        vec3.cross(this._up, this._up, this.tempVecBuild);
        if (vec3.equals(this._up, vec3.fromValues(0, 0, 0))) {
        	// Not good, choose something
        	vec3.set(this._up, 0, 1, 0);
        }

        mat4.lookAt(this._viewMatrix, eye, target, this._up);
        mat3.fromMat4(this.tempMat3b, this._viewMatrix);
        mat3.invert(this.tempMat3b, this.tempMat3b);
        mat3.transpose(this._viewNormalMatrix, this.tempMat3b);
        
        let [near, far] = [+Infinity, -Infinity];

        if (!this.viewer.geospatialMode && this._modelBounds) {
        	for (var v of this._modelBounds) {
                vec3.transformMat4(this.tmp_modelBounds, v, this._viewMatrix);
                let z = -this.tmp_modelBounds[2];
                if (z < near) {
                    near = z;
                }
                if (z > far) {
                    far = z;
                }
            }

            if (near < 1.e-3) {
                near = far / 1000.;
            }
        } else {
            [near, far] = [+1000, +200000. + vec3.length(this.eye)];
        }

        this.perspective.near = near - 1e-2;
        this.perspective.far = far + 1e-2;
        this.orthographic.near = near - 1e-2;
        this.orthographic.far = far + 1e-2;        

        mat4.invert(this._viewMatrixInverted, this._viewMatrix);
        mat4.multiply(this._viewProjMatrix, this.projMatrix, this._viewMatrix);
        mat4.invert(this._viewProjMatrixInverted, this._viewProjMatrix);

        this._dirty = false;
        
        for (var listener of this.listeners) {
        	listener();
        }
    }
    
    _build() {
        if (this._dirty && !this._locked && this._modelBounds) {
        	this.forceBuild();
        }
    }

    /**
     Gets the current viewing transform matrix.

     @return {Float32Array} 4x4 column-order matrix as an array of 16 contiguous floats.
     */
    get viewMatrix() {
        if (this._dirty) {
            this._build();
        }
        return this._viewMatrix;
    }

    /**
     Gets the current view projection matrix.

     @return {Float32Array} 4x4 column-order matrix as an array of 16 contiguous floats.
     */
    get viewProjMatrix() {
        if (this._dirty) {
            this._build();
        }
        return this._viewProjMatrix;
    }

    /**
     Gets the current inverted view projection matrix.

     @return {Float32Array} 4x4 column-order matrix as an array of 16 contiguous floats.
     */
    get viewProjMatrixInverted() {
        if (this._dirty) {
            this._build();
        }
        return this._viewProjMatrixInverted;
    }

    get viewMatrixInverted() {
        if (this._dirty) {
            this._build();
        }
        return this._viewMatrixInverted;
    }

    /**
     Gets the current viewing transform matrix for normals.

     This is the transposed inverse of the view matrix.

     @return {Float32Array} 4x4 column-order matrix as an array of 16 contiguous floats.
     */
    get viewNormalMatrix() {
        if (this._dirty) {
            this._build();
        }
        return this._viewNormalMatrix;
    }

    /**
     Gets the current projection transform matrix.

     @return {Float32Array} 4x4 column-order matrix as an array of 16 contiguous floats.
     */
    get projMatrix() {
        return this._projection.projMatrix;
    }

    /**
     Selects the current projection type.

     @param {String} projectionType Accepted values are "persp" or "ortho".
     */
    set projectionType(projectionType) {
        if (projectionType.toLowerCase().startsWith("persp")) {
            this._projection = this.perspective;
        } else if (projectionType.toLowerCase().startsWith("ortho")) {
            this._projection = this.orthographic;
        } else {
            console.error("Unsupported projectionType: " + projectionType);
        }
        this.viewer.dirty = 2;
    }

    /**
     Gets the current projection type.

     @return {String} projectionType "persp" or "ortho".
     */
    get projectionType() {
        return this._projection.constructor.name.substr(0,5).toLowerCase();
    }

    /**
     Gets the component that represents the current projection type.

     @return {Perspective|Orthographic}
     */
    get projection() {
        return this._projection;
    }

    /**
     Sets the position of the camera.
     @param {Float32Array} eye 3D position of the camera in World space.
     */
    set eye(eye) {
    	if (!vec3.equals(this._eye.get(), eye)) {
    		this._eye.get().set(eye);
    		this._setDirty();
    		for (var listener of this.lowVolumeListeners) {
    			listener();
    		}
    	}
    }

    /**
     Gets the position of the camera.
     @return {Float32Array} 3D position of the camera in World space.
     */
    get eye() {
        return this._eye.get();
    }

    /**
     Sets the point the camera is looking at.
     @param {Float32Array} target 3D position of the point of interest in World space.
     */
    set target(target) {
        if (!vec3.equals(this._target.get(), target)) {
    		this._target.get().set(target);
    		this._setDirty();
    		for (var listener of this.lowVolumeListeners) {
    			listener();
    		}
    	}
    }

    /**
     Gets the point tha camera is looking at.
     @return {Float32Array} 3D position of the point of interest in World space.
     */
    get target() {
        return this._target.get();
    }

    set center(v) {
    	if (!vec3.equals(this._center, v)) {
    		this._center.set(v);
    		vec3.negate(this._negatedCenter, this._center);
    		this.listeners.forEach((fn) => { fn(); });
    	}
    }

    get center() {
        return this._center;
    }

    /**
     Sets the camera's "up" direction.
     @param {Float32Array} up 3D vector indicating the camera's "up" direction in World-space.
     */
    set up(up) {
        this._up.set(up || [0.0, 1.0, 0.0]);
        this._setDirty();
    }

    /**
     Gets the camera's "up" direction.
     @return {Float32Array} 3D vector indicating the camera's "up" direction in World-space.
     */
    get up() {
        return this._up;
    }

    /**
     Sets whether camera rotation is gimbal locked.

     When true, yaw rotation will always pivot about the World-space "up" axis.

     @param {Boolean} gimbalLock Whether or not to enable gimbal locking.
     */
    set gimbalLock(gimbalLock) {
        this._gimbalLock = gimbalLock;
    }

    /**
     Sets whether camera rotation is gimbal locked.

     When true, yaw rotation will always pivot about the World-space "up" axis.

     @return {Boolean} True if gimbal locking is enabled.
     */
    get gimbalLock() {
        return this._gimbalLock;
    }

    /**
     Sets whether its currently possible to pitch the camera to look at the model upside-down.

     When this is true, camera will ignore attempts to orbit (camera or model) about the horizontal axis
     that would result in the model being viewed upside-down.

     @param {Boolean} constrainPitch Whether or not to activate the constraint.
     */
    set constrainPitch(constrainPitch) {
        this._constrainPitch = constrainPitch;
    }

    /**
     Gets whether its currently possible to pitch the camera to look at the model upside-down.

     @return {Boolean}
     */
    get constrainPitch() {
        return this._constrainPitch;
    }

    /**
     Indicates the up, right and forward axis of the World coordinate system.

     This is used for deriving rotation axis for yaw orbiting, and for moving camera to axis-aligned positions.

     Has format: ````[rightX, rightY, rightZ, upX, upY, upZ, forwardX, forwardY, forwardZ]````

     @type {Float32Array}
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

    /**
     Indicates the up, right and forward axis of the World coordinate system.

     This is used for deriving rotation axis for yaw orbiting, and for moving camera to axis-aligned positions.

     Has format: ````[rightX, rightY, rightZ, upX, upY, upZ, forwardX, forwardY, forwardZ]````

     @type {Float32Array}
     */
    get worldAxis() {
        return this._worldAxis;
    }

    /**
     Direction of World-space "up".

     @type Float32Array
     */
    get worldUp() {
        return this._worldUp;
    }

    /**
     Direction of World-space "right".

     @type Float32Array
     */
    get worldRight() {
        return this._worldRight;
    }

    /**
     Direction of World-space "forwards".

     @type Float32Array
     */
    get worldForward() {
        return this._worldForward;
    }

    set orbitting(orbitting) {
    	if (this._orbitting != orbitting) {
        	for (var listener of this.lowVolumeListeners) {
        		listener();
        	}
    	}
    	this._orbitting = orbitting;
    }

    get orbitting() {
    	return this._orbitting;
    }
    
    /**
     Rotates the eye position about the target position, pivoting around the up vector.

     @param {Number} degrees Angle of rotation in degrees
     */
    orbitYaw(degrees) {

        let eye = this._eye.get();
        let target = this._target.get();

        // @todo, these functions are not efficient nor numerically stable, but simple to understand.
        
    	mat4.identity(this.yawMatrix);
    	mat4.translate(this.yawMatrix, this.yawMatrix, this._center);
    	mat4.rotate(this.yawMatrix, this.yawMatrix, degrees * 0.0174532925 * 2, this._worldUp);
    	mat4.translate(this.yawMatrix, this.yawMatrix, this._negatedCenter);
    	
        vec3.transformMat4(eye, eye, this.yawMatrix);
        vec3.transformMat4(target, target, this.yawMatrix);

        this._setDirty();
        return;
    }

    /**
     Rotates the eye position about the target position, pivoting around the right axis (orthogonal to up vector and eye->target vector).

     @param {Number} degrees Angle of rotation in degrees
     */
    orbitPitch(degrees) { // Rotate (pitch) 'eye' and 'up' about 'target', pivoting around vector ortho to (target->eye) and camera 'up'
        let currentPitch = Math.acos(this._viewMatrix[10]);
        let adjustment = - degrees * 0.0174532925 * 2;
        if (currentPitch + adjustment < 0.01) {
            adjustment = 0.01 - currentPitch;
        }
        if (currentPitch + adjustment > Math.PI - 0.01) {
            adjustment = Math.PI - 0.01 - currentPitch;
        }

        if (Math.abs(adjustment) < 1.e-5) {
            return;
        }

        let eye = this._eye.get();
        let target = this._target.get();

        var T1 = mat4.fromTranslation(mat4.create(), this._center);
        var R = mat4.fromRotation(mat4.create(), adjustment, this._viewMatrixInverted);
        var T2 = mat4.fromTranslation(mat4.create(), vec3.negate(vec3.create(), this._center));

        vec3.transformMat4(eye, eye, T2);
        vec3.transformMat4(eye, eye, R);
        vec3.transformMat4(eye, eye, T1);

        vec3.transformMat4(target, target, T2);
        vec3.transformMat4(target, target, R);
        vec3.transformMat4(target, target, T1);

        this._setDirty();
        return;
    }

    /**
     Rotates the target position about the eye, pivoting around the right axis (orthogonal to up vector and eye->target vector).

     @param {Number} degrees Angle of rotation in degrees
     */
    pitch(degrees) { // Rotate (pitch) 'eye' and 'up' about 'target', pivoting around horizontal vector ortho to (target->eye) and camera 'up'
        let eye = this._eye.get();
        let target = this._target.get();

        var eyeToTarget = vec3.subtract(this.tempVec3, target, eye);
        var a = vec3.normalize(this.tempVec3c, eyeToTarget);
        var b = vec3.normalize(this.tempVec3d, this._up);
        var axis = vec3.cross(this.tempVec3b, a, b); // Pivot vector is orthogonal to target->eye
        mat4.fromRotation(this.tempMat4, degrees * 0.0174532925, axis);
        vec3.transformMat4(eyeToTarget, eyeToTarget, this.tempMat4); // Rotate vector
        var newUp = vec3.transformMat4(this.tempVec3d, this._up, this.tempMat4); // Rotate 'up' vector
        if (this._constrainPitch) {
            var angle = vec3.dot(newUp, this._worldUp) / 0.0174532925; // Don't allow 'up' to go up[side-down with respect to World 'up'
            if (angle < 1) {
                return;
            }
        }
        this._up.set(newUp);
        vec3.add(target, eye, eyeToTarget); // Derive 'target'} from eye and vector
        this._setDirty();
    }

    /**
     Pans the camera along the camera's local X, Y and Z axis.

     @param {Array} pan The pan vector
     */
    pan(pan) { // Translate 'eye' and 'target' along local camera axis
        let eye = this._eye.get();
        let target = this._target.get();

        var eyeToTarget = vec3.subtract(this.tempVec3, eye, target);
        var vec = [0, 0, 0];
        if (pan[0] !== 0) {
            let a = vec3.normalize(this.tempVec3b, eyeToTarget); // Get  vector orthogonal to 'up' and eye->target
            let b = vec3.normalize(this.tempVec3c, this._up);
            let v = vec3.cross(this.tempVec3d, a, b);
            vec3.scale(v, v, pan[0]);
            vec[0] += v[0];
            vec[1] += v[1];
            vec[2] += v[2];
        }
        if (pan[1] !== 0) {
            let v = vec3.scale(this.tempVec3, vec3.normalize(this.tempVec3b, this._up), pan[1]);
            vec[0] += v[0];
            vec[1] += v[1];
            vec[2] += v[2];
        }
        if (pan[2] !== 0) {
            let v = vec3.scale(this.tempVec3, vec3.normalize(this.tempVec3b, eyeToTarget), pan[2]);
            vec[0] += v[0];
            vec[1] += v[1];
            vec[2] += v[2];
        }
        vec3.add(eye, eye, vec);
        this.target = vec3.add(target, target, vec);
        this._setDirty();
    }

    /**
     Moves the camera along a ray through unprojected mouse coordinates

     @param {Number} delta Zoom increment
     @param canvasPos Mouse position relative to canvas to determine ray along which to move
     */
    zoom(delta, canvasPos) { // Translate 'eye' by given increment on (eye->target) vector
        // @todo: also not efficient

        let eye = this._eye.get();
        let target = this._target.get();

    	this.orthographic.zoom(delta);
    	
        let [x,y] = canvasPos;
        vec3.set(this.tempVec3, x / this.viewer.width * 2 - 1, - y / this.viewer.height * 2 + 1, 1.);
        vec3.transformMat4(this.tempVec3, this.tempVec3, this.projection.projMatrixInverted);
        vec3.transformMat4(this.tempVec3, this.tempVec3, this.viewMatrixInverted);
        vec3.subtract(this.tempVec3, this.tempVec3, eye);
        vec3.normalize(this.tempVec3, this.tempVec3);
        vec3.scale(this.tempVec3, this.tempVec3, -delta);

        vec3.add(eye, eye, this.tempVec3);
        vec3.add(target, target, this.tempVec3);

        this._setDirty();

        this.updateLowVolumeListeners();
    }
    
    updateLowVolumeListeners() {
        for (var listener of this.lowVolumeListeners) {
        	listener();
        }
    }

    calcViewFit(aabb, fitFOV, eye, target) {
        aabb = aabb || this.viewer.modelBounds;
        fitFOV = fitFOV || this.perspective.fov;
        var eyeToTarget = vec3.normalize(this.tempVec3b, vec3.subtract(this.tempVec3, eye, target));
        var diagonal = Math.sqrt(
            Math.pow(aabb[3] - aabb[0], 2) +
            Math.pow(aabb[4] - aabb[1], 2) +
            Math.pow(aabb[5] - aabb[2], 2));
        var center = [
            (aabb[3] + aabb[0]) / 2,
            (aabb[4] + aabb[1]) / 2,
            (aabb[5] + aabb[2]) / 2
        ];
        target.set(center);
        var sca = Math.abs(diagonal / Math.tan(fitFOV * 0.0174532925));
        eye[0] = target[0] + (eyeToTarget[0] * sca);
        eye[1] = target[1] + (eyeToTarget[1] * sca);
        eye[2] = target[2] + (eyeToTarget[2] * sca);

        this._setDirty();
    }

    interpolateView(newEye, newTarget) {
        this._eye.deanimate();
        this._target.deanimate();

        vec3.sub(this._tmp_interpolate_current_dir, this._target.get(), this._eye.get());
        vec3.normalize(this._tmp_interpolate_current_dir, this._tmp_interpolate_current_dir);

        vec3.sub(this._tmp_interpolate_new_dir, newTarget, newEye);
        vec3.normalize(this._tmp_interpolate_new_dir, this._tmp_interpolate_new_dir);

        let d = vec3.dot(this._tmp_interpolate_current_dir, this._tmp_interpolate_new_dir);

        if (d > 0.5) {          
            // More or less pointing in the same direction

            this._eye.b.set(newEye);
            this._target.b.set(newTarget);
            this._eye.animate(1000);
            this._target.animate(1000);
        } else {
            // Add an additional intermediate interpolation point
            // Add a point on the bisectrice of d1 d2

            let an = Math.acos(d);
            let d1 = vec3.subtract(this._tmp_interpolate_a, newEye, newTarget);
            let d2 = vec3.subtract(this._tmp_interpolate_b, this.eye, newTarget);
            let l1 = vec3.len(d1);
            let l2 = vec3.len(d2);
            vec3.normalize(d1, d1);
            vec3.normalize(d2, d2);

            let d3;
            if (d < -0.99) {
                // parallel view vecs, choose arbitrary axis
                let temp;
                if (Math.abs(d1[1]) > 0.99) {
                    temp = vec3.fromValues(1,0,0);
                } else {
                    temp = vec3.fromValues(0,1,0);
                }
                d3 = vec3.cross(this._tmp_interpolate_c, d1, temp);
            } else {
                d3 = vec3.cross(this._tmp_interpolate_c, d1, d2);
            }
            vec3.normalize(d3, d3);
            let rot = mat4.fromRotation(this._tmp_interpolate_e, an / 2., d3);
            let intermediate = this._tmp_interpolate_d;
            vec3.copy(intermediate, d1);
            vec4.transformMat4(intermediate, intermediate, rot);
            vec3.normalize(intermediate, intermediate);
            vec3.scale(intermediate, intermediate, (l1 + l2) / 2.);
            vec3.add(intermediate, intermediate, newTarget);
            let intermediate3 = intermediate.subarray(0,3);
            
            this._eye.b.set(intermediate3);
            this._target.b.set(vec3.lerp(this._tmp_interpolate_f, this.target, newTarget, 0.5));
            this._eye.c.set(newEye);
            this._target.c.set(newTarget);
            this._eye.animate(500, 500);
            this._target.animate(500, 500);
        }
    }

    /**
     Jumps the camera to look at the given axis-aligned World-space bounding box.

     @param {Float32Array} aabb The axis-aligned World-space bounding box (AABB).
     @param {Number} fitFOV Field-of-view occupied by the AABB when the camera has fitted it to view.
     */
    viewFit(params) {
        let eye, target, eye2, target2;
        
        if (params.animate) {
            eye = this._eye.get();
            target = this._target.get();

            eye2 = this._tmp_eye;
            target2 = this._tmp_target;
        } else {
            eye2 = eye = this._eye.get();
            target2 = target = this._target.get();
        }

		if (params.viewDirection) {
			eye = params.viewDirection;
		}

        const aabb = params.aabb || this.viewer.modelBounds;
        const fitFOV = this.perspective.fov;
        var eyeToTarget = vec3.normalize(this.tempVec3b, vec3.subtract(this.tempVec3, eye, target));
        var diagonal = Math.sqrt(
            Math.pow(aabb[3] - aabb[0], 2) +
            Math.pow(aabb[4] - aabb[1], 2) +
            Math.pow(aabb[5] - aabb[2], 2));
        var center = [
            (aabb[3] + aabb[0]) / 2,
            (aabb[4] + aabb[1]) / 2,
            (aabb[5] + aabb[2]) / 2
        ];
        target2.set(center);
        var sca = Math.abs(diagonal / Math.tan(fitFOV * 0.0174532925));
        eye2[0] = target2[0] + (eyeToTarget[0] * sca);
        eye2[1] = target2[1] + (eyeToTarget[1] * sca);
        eye2[2] = target2[2] + (eyeToTarget[2] * sca);

        if (params.animate) {
            this.interpolateView(this._tmp_eye, this._tmp_target);
        }

        this._setDirty();
    }

    restore(params) {
        if (params.type) {
            this.projectionType = params.type;
        }
        if (this._projection instanceof Perspective && params.fovy) {
            this._projection.fov = params.fovy;
        }
        ["eye", "target", "up"].forEach((k) => {
            if (params[k]) {
                let fn_set = Object.getOwnPropertyDescriptor(this, k).set;
                let fn_get = Object.getOwnPropertyDescriptor(this, k).get;
                let fn_update;
                if (params[k] instanceof AnimatedVec3) {
                    fn_update = (t, v) => { fn_get(t).set(v); };
                } else {
                    fn_update = fn_set;
                }
                fn_update(this, params[k]);
            }
        });
    }
}