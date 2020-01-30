import * as mat4 from "./glmatrix/mat4.js";
import * as vec3 from "./glmatrix/vec3.js";

class SvgOverlayNode {
    constructor(overlay, svgElem) {
        this.overlay = overlay;
        this.svgElem = svgElem;
        this._lastVisibilityState = null;
    }

    process() {
        let v = this.isVisible();
        if (v !== this._lastVisibilityState) {
            this.svgElem.setAttribute("visibility", v ? "visible" : "hidden");
        }
        if (this._lastVisibilityState = v) {
            this.doUpdate();
        }            
    }

    destroy() {
        this.overlay.nodes.splice(this.overlay.nodes.indexOf(this), 1);
        this.svgElem.parentElement.removeChild(this.svgElem);
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
        let [x, y] = this.overlay.transformPoint(this.camera.center);
        this.svgElem.setAttribute("cx", x);
        this.svgElem.setAttribute("cy", y);
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
        return "M" + this._points.map((p) => this.overlay.transformPoint(p)).join(" L");
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
        this.svgElem.setAttribute("d", this.createPathAttribute(this._points));
    }
}

/**
 * A SVG overlay that is synced with the WebGL viewport for efficiently rendering
 * two-dimensional elements such as text, that are not easily rendered using WebGL.
 *
 * @export
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
        vec3.transformMat4(this.tmp, p, this.camera.viewProjMatrix);
        return [+this.tmp[0] * this.w + this.w, -this.tmp[1] * this.h + this.h]
    }

    update() {
        this.nodes.forEach((n) => {
            n.process();
        });
    }

    create(tag, attrs, style) {
        let elem = document.createElementNS("http://www.w3.org/2000/svg", tag);
        for (let [k, v] of Object.entries(attrs || {})) {
            elem.setAttribute(k, v);
        }
        let s = elem.style;
        for (let [k, v] of Object.entries(style || {})) {
            s[k] = v;
        }        
        if (this.svg) {
            this.svg.appendChild(elem);
        }
        return elem;
    }

    createWorldSpacePolyline(points) {
        let node = new PathOverlayNode(this, points);
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
        
        this.aspect = this.w / this.h;
    }
}