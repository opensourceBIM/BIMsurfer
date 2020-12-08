import * as vec2 from "./glmatrix/vec2.js";
import * as vec3 from "./glmatrix/vec3.js";
import * as vec4 from "./glmatrix/vec4.js";
import { WSQuad } from "./wsquad.js";

const X = vec3.fromValues(1., 0., 0.);
const Y = vec3.fromValues(0., 1., 0.);
const Z = vec3.fromValues(0., 0., 1.);

const _tmp_sectionU = vec3.create();
const _tmp_sectionV = vec3.create();
const _tmp_sectionA = vec3.create();
const _tmp_sectionB = vec3.create();
const _tmp_sectionC = vec3.create();
const _tmp_sectionD = vec3.create();
const _tmp_section_dir_2d = vec4.create();

const _sectionPlaneValuesDisabled = new Float32Array([0,0,0,1]);

export class SectionPlane {

    constructor(params) {
        this.viewer = params.viewer;

        this.values = params.buffer ? params.buffer : vec4.create();
        this.values2 = vec4.create();
        this.quad = new WSQuad(this.viewer, this.viewer.gl);

        this.coordinates = null;
        this.normal = null;

        this.disable();

        // A SVG canvas overlay polygon to indicate section plane positioning
        this.Poly = null;
		this.isTempDisabled = false;
    }

    position(coordinates, normal) {
        if (coordinates) {
            this.coordinates = coordinates;
            this.normal = normal;
        } else {
            coordinates = this.coordinates;
            normal = this.normal;
        }

        let ref = null;
        if (Math.abs(vec3.dot(normal, Z)) < 0.9) {
            ref = Z;
        } else {
            ref = X;
        }

        let cameraEye = this.viewer.camera.eye;
        vec3.subtract(_tmp_sectionA, cameraEye, coordinates);
        let cameraDistance = vec3.len(_tmp_sectionA);

        vec3.cross(_tmp_sectionU, normal, ref);
        vec3.cross(_tmp_sectionV, normal, _tmp_sectionU);
        vec3.scale(_tmp_sectionU, _tmp_sectionU, cameraDistance / 50.);
        vec3.scale(_tmp_sectionV, _tmp_sectionV, cameraDistance / 50.);

        // ---
        
        vec3.add(_tmp_sectionA, _tmp_sectionU, coordinates);
        vec3.add(_tmp_sectionB, _tmp_sectionU, coordinates);

        vec3.negate(_tmp_sectionU, _tmp_sectionU);

        vec3.add(_tmp_sectionC, _tmp_sectionU, coordinates);
        vec3.add(_tmp_sectionD, _tmp_sectionU, coordinates);

        // ---

        vec3.add(_tmp_sectionA, _tmp_sectionV, _tmp_sectionA);
        vec3.add(_tmp_sectionC, _tmp_sectionV, _tmp_sectionC);

        vec3.negate(_tmp_sectionV, _tmp_sectionV);

        vec3.add(_tmp_sectionB, _tmp_sectionV, _tmp_sectionB);
        vec3.add(_tmp_sectionD, _tmp_sectionV, _tmp_sectionD);

        // ---

        let ps = [_tmp_sectionA, _tmp_sectionB, _tmp_sectionD, _tmp_sectionC, _tmp_sectionA];
        if (this.Poly) {
            this.Poly.points = ps;
        } else {
            this.Poly = this.viewer.overlay.createWorldSpacePolyline(ps);
            this.Poly.beforeUpdate = () => {
                this.position();
            }
        }

        // temporarily set values to render quad
        this.values.set(normal.subarray(0,3));
        this.values[3] = vec3.dot(coordinates, normal);
        this.quad.position(this.viewer.modelBounds, this.values);
        this.values.set(_sectionPlaneValuesDisabled);
    }

    enable(canvasPos, coordinates, normal, depth) {
        this.values.set(normal.subarray(0,3));
        this.initialSectionPlaneD = this.values[3] = vec3.dot(coordinates, normal);
        this.values2.set(this.values);
        this.isDisabled = false;
        this.depth = depth;
        let cp = [canvasPos[0] / this.viewer.width, - canvasPos[1] / this.viewer.height];
        this.DownAt = cp;
    }

    tempDisable() {
        if (!this.isTempDisabled) {
            this.values2.set(this.values);
            this.values.set(_sectionPlaneValuesDisabled);
            this.isTempDisabled = true;
        }
    }

    tempRestore() {
        if (this.isTempDisabled) {
            this.values.set(this.values2);
            this.isTempDisabled = false;
        }
    }

    drawQuad() {
        // @todo is it actually necessary to disable? it seems to function without
        this.tempDisable();
        this.quad.draw();
        this.tempRestore();
    }

    disable() {
        this.values.set(_sectionPlaneValuesDisabled);
        this.values2.set(_sectionPlaneValuesDisabled);
        this.isDisabled = true;
    }

    move(canvasPos) {
        _tmp_section_dir_2d.set(this.values2);
        _tmp_section_dir_2d[3] = 0.;
        vec4.transformMat4(_tmp_section_dir_2d, _tmp_section_dir_2d, this.viewer.camera.viewProjMatrix);
        let cp = [canvasPos[0] / this.viewer.width, - canvasPos[1] / this.viewer.height];        
        vec2.subtract(_tmp_section_dir_2d.subarray(2), cp, this.DownAt);
        _tmp_section_dir_2d[1] /= this.viewer.width / this.viewer.height;
        let d = vec2.dot(_tmp_section_dir_2d, _tmp_section_dir_2d.subarray(2)) * this.depth;
        this.values2[3] = this.initialSectionPlaneD + d;

        this.quad.position(this.viewer.modelBounds, this.values2);
    }

    destroy() {
        if (this.Poly) {
            this.Poly.destroy();
            this.Poly = null;
        }
    }

}