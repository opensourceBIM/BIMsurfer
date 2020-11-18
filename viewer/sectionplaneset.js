import {SectionPlane} from "./sectionplane.js"

export class SectionPlaneSet {
    planes = [];
    index = 0;
    viewer = null;
    buffer = null;

    constructor(args) {
        this.viewer = args.viewer;
        this.planes = new Array(args.n);
        this.buffer = new Float32Array(4 * this.planes.length);
        for (let i = 0; i < args.n; ++i) {
            this.planes[i] = new SectionPlane({viewer: this.viewer, buffer: this.buffer.subarray(i * 4, i * 4 + 4)});
        }
    }

    tempRestore() {
        for (let s of this.planes) {
            s.tempRestore();
        }
    }

    tempDisable() {
        for (let s of this.planes) {
            s.tempDisable();
        }
    }
}