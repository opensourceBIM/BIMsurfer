import * as mat4 from "./glmatrix/mat4.js";
import * as vec3 from "./glmatrix/vec3.js";

let tmp = vec3.create();

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
        this.nodes = [{
            elem: this._orbitCenter,
            visibilityFunction: () => this.camera.orbitting,
            updateFunction: () => {
                let [x, y] = this.transformPoint(this.camera.center);
                this._orbitCenter.setAttribute("cx", x);
                this._orbitCenter.setAttribute("cy", y);
            }
        }];

        window.addEventListener("resize", this.resize.bind(this), false);
    }

    transformPoint(p) {
        vec3.transformMat4(tmp, p, this.camera.viewProjMatrix);
        return [+tmp[0] * this.w + this.w, -tmp[1] * this.h + this.h]
    }

    update() {
        this.nodes.forEach((n) => {
            let v = n.visibilityFunction();
            if (v !== n.lastVisibilityState) {
                n.elem.setAttribute("visibility", v ? "visible" : "hidden");
            }
            if (n.lastVisibilityState = v) {
                n.updateFunction();
            }            
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