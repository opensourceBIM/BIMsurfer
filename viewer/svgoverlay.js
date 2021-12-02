import * as mat4 from "./glmatrix/mat4.js";
import * as vec4 from "./glmatrix/vec4.js";
import * as vec3 from "./glmatrix/vec3.js";
import * as vec2 from "./glmatrix/vec2.js"
import * as mat2 from "./glmatrix/mat2.js"

class SvgOverlayNode {
    constructor(overlay, svgElem) {
        this.overlay = overlay;
        this.svgElem = svgElem;
        this.additionalElems = [];
        this._lastVisibilityState = null;
    }

    process() {
        let v = this.isVisible();
        if (v !== this._lastVisibilityState) {
            this.svgElem.setAttribute("visibility", v ? "visible" : "hidden");
        }
        if (this.beforeUpdate) {
            this.beforeUpdate();
        }
        if (this._lastVisibilityState = v) {
            this.doUpdate();
        }
    }

    destroy() {
        this.overlay.nodes.splice(this.overlay.nodes.indexOf(this), 1);
        let deleteSvgElem = (el) => {
            el.parentElement.removeChild(el);
        };
        deleteSvgElem(this.svgElem);
        this.additionalElems.forEach(deleteSvgElem);
    }
}

class OrbitCenterOverlayNode extends SvgOverlayNode {
    constructor(overlay, svgElem, camera) {
        super(overlay, svgElem);
        this.camera = camera;
    }

    isVisible() {
        return this.camera.orbitting;
    }

    doUpdate() {
        let xy = this.overlay.transformPoint(this.camera.center);
        this.svgElem.setAttribute("cx", xy[0]);
        this.svgElem.setAttribute("cy", xy[1]);
    }
}

class PathOverlayNode extends SvgOverlayNode {
    constructor(overlay, points) {
        super(overlay, null);
        this._points = points;
        this.svgElem = overlay.create("path", {
            fill: "lightblue",
            stroke: "lightblue",
            "fill-opacity": 0.4,
            d: this.createPathAttribute()
        });        
    }

    createPathAttribute() {
        return "M" + this._points.map((p) => this.overlay.toString(this.overlay.transformPoint(p))).join(" L");
    }

    isVisible() {
        return true;
    }

    get points() {
        return this._points;
    }

    set points(p) {
        this._points = p;
        this.doUpdate();
    } 

    doUpdate() {
        this.svgElem.setAttribute("d", this.createPathAttribute());
    }
}


const tmp_mat_1 = mat2.create();

// Calculates the intersection between two (infinite) lines by
// means of determinants, as described on:
// https://en.wikipedia.org/wiki/Line%E2%80%93line_intersection
function intersectLine(R, p00, p01, p10, p11) {
    mat2.set(tmp_mat_1, p00[0], p01[0], p00[1], p01[1]);
    const d00 = mat2.determinant(tmp_mat_1);
    mat2.set(tmp_mat_1, p10[0], p11[0], p10[1], p11[1]);
    const d01 = mat2.determinant(tmp_mat_1);
    const d10 = p00[0] - p01[0];
    const d11 = p10[0] - p11[0];
    mat2.set(tmp_mat_1, d00, d01, d10, d11);
    const x0 = mat2.determinant(tmp_mat_1);
    const d30 = p00[1] - p01[1];
    const d31 = p10[1] - p11[1];
    mat2.set(tmp_mat_1, d00, d01, d30, d31);
    const y0 = mat2.determinant(tmp_mat_1);
    mat2.set(tmp_mat_1, d10, d11, d30, d31);
    const D  = mat2.determinant(tmp_mat_1);
    vec2.set(R, x0 / D, y0 / D);
}

const tmp_measurement_ = vec3.create();
const tmp_measurement_2 = [vec2.create(), vec2.create(), vec2.create(), vec2.create()];

class InfiniteLine extends SvgOverlayNode {
    constructor(overlay, measurement, point, normal) {
        super(overlay, null);

        this.measurement = measurement;
        
        this.points = [
            vec3.clone(point), vec3.add(vec3.create(), point, normal)
        ];

        this.svgElem = overlay.create("path", {
            stroke: "black",
            d: this.createPathAttribute()
        }, {
            strokeDasharray: 4,
            opacity: 0.5
        });

        this.process();
    }

    isVisible() {
        return this.measurement.constrain && !this.measurement.fixed;
    }

    createPathAttribute() {
        let a = vec3.copy(tmp_measurement_, this.overlay.transformPoint(this.points[0]));
        let b = this.overlay.transformPoint(this.points[1]);

        for (var i = 0; i < 4; ++i) {
            intersectLine(
                tmp_measurement_2[i],
                a,
                b,
                this.overlay.boundaryPoints[i],
                this.overlay.boundaryPoints[(i+1)%4]
            );
        }

        const dists = tmp_measurement_2.map((v, i) => [vec2.dist(v, this.overlay.centerPoint), i]);
        dists.sort((a, b) => a[0] - b[0]);
        
        return "M" + [
            tmp_measurement_2[dists[0][1]],
            tmp_measurement_2[dists[1][1]]
        ].map(this.overlay.toString).join(" L");
    }

    doUpdate() {
        this.svgElem.setAttribute("d", this.createPathAttribute());
    }
}

class MeasurementNode extends SvgOverlayNode {
    constructor(overlay, point, normal, constrain) {
        super(overlay, null);
        
        this._points = [new Float32Array(point), new Float32Array(point)];
        this._points_constrained = [new Float32Array(point), new Float32Array(point)];
        this._constrain = !!constrain;
        this.fixed = false;
        this.normal = normal;

        this.line = new InfiniteLine(overlay, this, point, normal);
        overlay.nodes.push(this.line);
        
        this.svgElem = overlay.create("path", {
            stroke: "black",
            fill: "none",
            d: this.createPathAttribute()
        }, {
            markerStart: "url(#m1)",
            markerEnd: "url(#m0)"
        });

        this.label = overlay.create("text", {
        }, {
            textAnchor: "middle",
            fontFamilt: "verdana",
            fontSize: "12pt",
            fill: "#fff",
            stroke: "#000",
            strokeWidth: 2,
            paintOrder: "stroke",
            alignmentBaseline: "middle"        
        });
        this.label.appendChild(document.createTextNode(""));

        this.additionalElems.push(this.label);
    }

    createPathAttribute() {
        // Actually it's nicer to just show something to indicate to the user
        // something is happening.
        /*if (this.points.length < 2 || this.length <= 1) {
            return "";
        }*/
        
        // return "M" + this.points.map((p) => this.overlay.toString(this.overlay.transformPoint(p))).join(" L");
        return "M" + this.points
            .map(this.overlay.transformPoint.bind(this.overlay))
            .filter(p => p[3] > 0.)
            .map(this.overlay.toString.bind(this.overlay))
            .join(" L");
    }

    isVisible() {
        return true;
    }

    get num_points() {
        let n = this._points.length;
        if (!this.fixed) {
            // last point is still in progress
            n --;
        }
        return n;
    }

    get constrain() {
        return this._constrain;
    }

    set constrain(b) {
        this._constrain = b;
        this.doUpdate();
    }

    get length() {
        if (this.points.length < 2) {
            return 0;
        }
        let L = 0;
        for (let i = 0; i < this.points.length - 1; ++i) {
            vec3.subtract(tmp_measurement_, this.points[i], this.points[i + 1]);    
            L += vec3.length(tmp_measurement_);
        }
        return L;
    }

    get midpoint() {
        if (this.points.length < 2) {
            return null;
        } else if (this.points.length == 2) {
            let x = this.overlay.transformPoint(this.points[0]);
            if (x[3] < 0.) {
                tmp_measurement_.fill(-100);
            } else {
                vec3.copy(tmp_measurement_, x);
                let t = this.overlay.transformPoint(this.points[1]);
                vec2.add(tmp_measurement_, tmp_measurement_, t);
                vec2.scale(tmp_measurement_, tmp_measurement_, 0.5);
            }
        } else {
            let M = this.length / 2.;
            let accum = 0.;
            for (let i = 0; i < this.points.length - 1; ++i) {
                vec3.subtract(tmp_measurement_, this.points[i], this.points[i + 1]);    
                let segmentLength = vec3.length(tmp_measurement_);
                if (M - accum < segmentLength) {
                    let x = this.overlay.transformPoint(this.points[i]);
                    if (x[3] < 0.) {
                        tmp_measurement_.fill(-100);
                    } else {
                        vec3.copy(tmp_measurement_, x);
                        let t = this.overlay.transformPoint(this.points[i + 1]);
                        vec2.lerp(tmp_measurement_, tmp_measurement_, t, (M - accum) / segmentLength);
                    }
                    break;
                }
                accum += segmentLength;
            }
        }
        return tmp_measurement_;
    }

    get angle() {
        if (this.points.length < 2) {
            return null;
        } else if (this.points.length == 2) {
            vec3.copy(tmp_measurement_, this.overlay.transformPoint(this.points[0]));
            let t = this.overlay.transformPoint(this.points[1]);
            vec2.subtract(tmp_measurement_, t, tmp_measurement_);
            return Math.atan2(tmp_measurement_[1], tmp_measurement_[0]) * 180. / Math.PI;
        } else {
            let M = this.length / 2.;
            let accum = 0.;
            for (let i = 0; i < this.points.length - 1; ++i) {
                vec3.subtract(tmp_measurement_, this.points[i], this.points[i + 1]);    
                let segmentLength = vec3.length(tmp_measurement_);
                if (M - accum < segmentLength) {
                    vec3.copy(tmp_measurement_, this.overlay.transformPoint(this.points[i]));
                    let t = this.overlay.transformPoint(this.points[i + 1]);
                    vec2.subtract(tmp_measurement_, t, tmp_measurement_);
                    return Math.atan2(tmp_measurement_[1], tmp_measurement_[0]) * 180. / Math.PI;
                }
                accum += segmentLength;
            }
        }
    }

    get points() {
        if (this.constrain) {
            return this._points_constrained;
        } else {
            return this._points;
        }
    }

    updatePoint(p) {
        this.points[this.points.length - 1] = new Float32Array(p);
        if (this.constrain) {
            let p = this.points;
            vec3.subtract(tmp_measurement_, p[1], p[0]);
            let l = vec3.dot(tmp_measurement_, this.normal);
            vec3.scale(tmp_measurement_, this.normal, l);
            vec3.add(tmp_measurement_, tmp_measurement_, p[0]);
            this._points_constrained = [p[0], new Float32Array(tmp_measurement_)];
        }
        this.doUpdate();
    }

    fixPoint(p) {
        this.points.push(new Float32Array(this.points[this.points.length - 1]));
    }

    popLastPoint() {
        this.points.pop();
        this.doUpdate();
    }

    doUpdate() {
        this.svgElem.setAttribute("d", this.createPathAttribute());
        let mp = this.midpoint;
        if (mp === null) return;
        let x = mp[0];
        let y = mp[1];
        this.label.setAttribute("x", x);
        this.label.setAttribute("y", y);
        let l = this.length;
        this.label.childNodes[0].textContent = l > 1 ? (l / 1000).toFixed(2) : "";
        let a = this.angle;
        if (a < -90 || a > 90) {
            a += 180;
        }
        this.label.setAttribute("transform", `rotate(${a} ${x} ${y}) translate(0 -7)`);
    }
}

/**
 * A SVG overlay that is synced with the WebGL viewport for efficiently rendering
 * two-dimensional elements such as text, that are not easily rendered using WebGL.
 *
 * @class SvgOverlay
 */
export class SvgOverlay {
	constructor(domNode, camera) {
        this.track = domNode;
        this.camera = camera;

        this.tmp = vec3.create();

        let svg = this.svg = this.create("svg", {id:"viewerOverlay"}, {
            padding: 0,
            margin: 0,
            position: "absolute",
            zIndex: 10000,
            display: "block",
        	"pointer-events": "none"
        });
        
        document.body.appendChild(svg);

        let defs = this.create("defs", null, null);

        for (let i = 0; i < 2; ++i) {
            let marker = this.create("marker", {
                id: `m${i}`,
                markerWidth: 13,
                markerHeight: 13,
                refX: [10, 2][i],
                refY: 6,
                orient: "auto"
            }, null, defs);

            this.create("path", {
                d : ["M2,2 L2,11 L10,6 L2,2", "M10,2 L10,11 L2,6 L10,2"][i],
            }, {
                fill: "#000000"
            }, marker);

            this.create("path", {
                d : ["M10,2 L10,11", "M2,2 L2,11"][i],
            }, {
                stroke: "#000000",
                strokeWidth: 1
            }, marker);
        }

        // Initialize by resize()
        this.boundaryPoints = [
            vec2.create(),
            vec2.create(),
            vec2.create(),
            vec2.create()
        ];
        this.centerPoint = vec2.create();

        this.resize();
        
        this.camera.listeners.push(this.update.bind(this));
        this._orbitCenter = this.create("circle", {
            visibility: "hidden",
            r: 6,
            fill: "white",
        	stroke: "black",
        	"fill-opacity": 0.4
        });

        // This is an array of elements that have methods to query their visibility
        // and update their SVG positioning
        this.nodes = [new OrbitCenterOverlayNode(this, this._orbitCenter, this.camera)];

        window.addEventListener("resize", this.resize.bind(this), false);
    }

    transformPoint(p) {
        // let t = this.tmp;
        let t = vec4.create();
        let x = new Float32Array(4);
        x.set(p, 0);
        x[3] = 1.;
        vec4.transformMat4(t, x, this.camera.viewProjMatrix);
        t[1] *= -1;
        vec3.scale(t, t, 1. / t[3]);
        vec2.multiply(t, t, this.wh);
        vec2.add(t, t, this.wh);
        return t;
    }

    toString(t) {
        return t[0] + "," + t[1];
    }

    update() {
        this.nodes.forEach((n) => {
            n.process();
        });
    }

    create(tag, attrs, style, parent) {
        let elem = document.createElementNS("http://www.w3.org/2000/svg", tag);
        for (let [k, v] of Object.entries(attrs || {})) {
            elem.setAttribute(k, v);
        }
        let s = elem.style;
        for (let [k, v] of Object.entries(style || {})) {
            s[k] = v;
        }
        if (typeof(parent) === 'undefined') {
            parent = this.svg;
        }
        if (parent) {
            parent.appendChild(elem);
        }
        return elem;
    }

    createWorldSpacePolyline(points) {
        let node = new PathOverlayNode(this, points);
        this.nodes.push(node);
        return node;
    }

    addMeasurement(point, normal, constrain) {
        let node = new MeasurementNode(this, point, normal, constrain);
        this.nodes.push(node);
        return node;
    }

    resize() {
        function getElementXY(e) {
            var x = 0, y = 0;
            while (e) {
                x += (e.offsetLeft-e.scrollLeft);
                y += (e.offsetTop-e.scrollTop);
                e = e.offsetParent;
            }

            var bodyRect = document.body.getBoundingClientRect();
            return {
                x: (x - bodyRect.left),
                y: (y - bodyRect.top)
            };
        }
        
        let svgStyle = this.svg.style;
        var xy = getElementXY(this.track);
        svgStyle.left = xy.x + "px";
        svgStyle.top = xy.y + "px";
        svgStyle.width = (this.w = this.track.clientWidth) + "px";
        svgStyle.height = (this.h = this.track.clientHeight) + "px";
        this.svg.setAttribute("width", this.w);
        this.svg.setAttribute("height", this.h);
        this.svg.setAttribute("viewBox", "0 0 " + this.w + " " + this.h);
        this.w /= 2.;
        this.h /= 2.;
        this.wh = vec2.fromValues(this.w, this.h);
        
        // (0,0)
        // (w,0)
        // (w,h)
        // (0,h)
        this.boundaryPoints[1][0] = this.w * 2;
        this.boundaryPoints[2][0] = this.w * 2;
        this.boundaryPoints[2][1] = this.h * 2;
        this.boundaryPoints[3][1] = this.h * 2;

        this.centerPoint[0] = this.w;
        this.centerPoint[1] = this.h;
        
        this.aspect = this.w / this.h;
    }
}