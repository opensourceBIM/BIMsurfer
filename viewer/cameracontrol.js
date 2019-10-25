import * as mat4 from "./glmatrix/mat4.js";
import * as vec3 from "./glmatrix/vec3.js";
import * as vec2 from "./glmatrix/vec2.js";

export const DRAG_ORBIT = 0xfe01;
export const DRAG_PAN = 0xfe02;
export const DRAG_SECTION = 0xfe03;

/**
 Controls the camera with user input.
 */
export class CameraControl {

    constructor(viewer) {

        this.viewer = viewer;

        this.mousePanSensitivity = 0.5;
        this.mouseOrbitSensitivity = 0.5;
        this.canvasPickTolerance = 4;

        this.canvas = viewer.canvas;
        this.camera = viewer.camera;

        this.mousePos = vec2.create();
        this.mouseDownPos = vec2.create();
        this.over = false; // True when mouse over canvas
        this.lastX = 0; // Last canvas pos while dragging
        this.lastY = 0;

        this.mouseDown = false;
        this.dragMode = DRAG_ORBIT;

        this.canvas.oncontextmenu = (e) => {
            e.preventDefault();
        };

        this.canvas.addEventListener("keydown", this.keyDownHandler = (e) => {
        	this.keyEvent(e, "down");
        });

        this.canvas.addEventListener("keyup", this.keyUpHandler = (e) => {
        	this.keyEvent(e, "up");
        });

        this.canvas.addEventListener("mousedown", this.canvasMouseDownHandler = (e) => {
        	this.canvasMouseDown(e);
        });

        this.canvas.addEventListener("mouseup", this.canvasMouseUpHandler = (e) => {
        	this.canvasMouseUp(e);
        });

        this.documentMouseUpHandler = (e) => {
        	this.documentMouseUp(e);
        };
        document.addEventListener("mouseup", this.documentMouseUpHandler);

        this.canvas.addEventListener("mouseenter", this.canvasMouseEnterHandler = (e) => {
            this.over = true;
            e.preventDefault();
        });

        this.canvas.addEventListener("mouseleave", this.canvasMouseLeaveHandler = (e) => {
            this.over = false;
            e.preventDefault();
        });

        this.canvas.addEventListener("mousemove", this.canvasMouseMoveHandler = (e) => {
        	this.canvasMouseMove(e);
        });

        this.canvas.addEventListener("wheel", this.canvasMouseWheelHandler = (e) => {
        	this.canvasWheel(e);
        });
    }

    /**
     * @private
     */
    getCanvasPosFromEvent(event, canvasPos) {
        if (!event) {
            event = window.event;
            canvasPos[0] = event.x;
            canvasPos[1] = event.y;
        } else {
//            var element = event.target;
            var totalOffsetLeft = 0;
            var totalOffsetTop = 0;
//            while (element.offsetParent) {
//                totalOffsetLeft += element.offsetLeft;
//                totalOffsetTop += element.offsetTop;
//                element = element.offsetParent;
//            }
            
            var rect = event.target.getBoundingClientRect();
            totalOffsetLeft = rect.left;
            totalOffsetTop = rect.top;
            canvasPos[0] = event.pageX - totalOffsetLeft;
            canvasPos[1] = event.pageY - totalOffsetTop;
        }
        return canvasPos;
    }

    /**
     * @private
     */
    getZoomRate() {
        var modelBounds = this.viewer.modelBounds;
        if (modelBounds) {
            var xsize = modelBounds[3] - modelBounds[0];
            var ysize = modelBounds[4] - modelBounds[1];
            var zsize = modelBounds[5] - modelBounds[2];
            var max = (xsize > ysize ? xsize : ysize);
            max = (zsize > max ? zsize : max);
            return max / 20;
        } else {
            return 1;
        }
    }

    keyEvent(e, state) {
        if (e.key == "Control") {
            if (state === "down") {
                if (this.viewer.sectionPlaneIsDisabled) {
                    this.viewer.positionSectionPlaneWidget({canvasPos: [this.lastX, this.lastY]});
                }
            } else {
                this.viewer.removeSectionPlaneWidget();
            }            
        }
    }

    /**
     * @private
     */
    canvasMouseDown(e) {
        this.getCanvasPosFromEvent(e, this.mousePos);

        this.lastX = this.mousePos[0];
        this.lastY = this.mousePos[1];

        this.mouseDown = true;
        this.mouseDownTime = e.timeStamp;
        this.mouseDownPos.set(this.mousePos);

        switch (e.which) {
            case 1:                
                if (e.ctrlKey) {
                    this.mouseDownTime = 0;
                    if (this.viewer.enableSectionPlane({canvasPos:[this.lastX, this.lastY]})) {
                        this.dragMode = DRAG_SECTION;
                    } else if (!this.viewer.sectionPlaneIsDisabled){
                        this.viewer.disableSectionPlane();
                        this.dragMode = DRAG_ORBIT;
                    }
                    this.viewer.removeSectionPlaneWidget();
                } else {
                    this.dragMode = DRAG_ORBIT;
                    let picked = this.viewer.pick({canvasPos:[this.lastX, this.lastY], select:false});
                    if (picked && picked.coordinates && picked.object) {
                        this.viewer.camera.center = picked.coordinates;
                    } else {
                        // Check if we can 'see' the previous center. If not, pick
                        // a new point.
                        let center_vp = vec3.transformMat4(vec3.create(), this.viewer.camera.center, this.viewer.camera.viewProjMatrix);

                        let isv = true;
                        for (let i = 0; i < 3; ++i) {
                            if (center_vp[i] < -1. || center_vp[i] > 1.) {
                                isv = false;
                                break;
                            }
                        }

                        if (!isv) {
                            let [x,y] = this.mousePos;
                            vec3.set(center_vp, x / this.viewer.width * 2 - 1, - y / this.viewer.height * 2 + 1, 1.);
                            vec3.transformMat4(center_vp, center_vp, this.camera.viewProjMatrixInverted);
                            vec3.subtract(center_vp, center_vp, this.camera.eye);
                            vec3.normalize(center_vp, center_vp);
                            vec3.scale(center_vp, center_vp, this.getZoomRate() * 10.);
                            vec3.add(center_vp, center_vp, this.camera.eye);
                            console.log("new center", center_vp);
                            this.viewer.camera.center = center_vp;
                        }
                    }
                }
                break;
            case 2:
                this.dragMode = DRAG_PAN; 
                break;
            default:
                break;
        }
        this.over = true;
        if (this.dragMode == DRAG_PAN || e.shiftKey) {
        	e.preventDefault();
        }
    }

    /**
     * @private
     */
    canvasMouseUp(e) {
        this.camera.orbitting = false;
        this.viewer.overlay.update();
        this.getCanvasPosFromEvent(e, this.mousePos);

        let dt = e.timeStamp - this.mouseDownTime;
        this.mouseDown = false;

        switch (e.which) {
            case 1:
            	if (dt < 500. && this.closeEnoughCanvas(this.mouseDownPos, this.mousePos)) {
                    var viewObject = this.viewer.pick({
                        canvasPos: this.mousePos,
                        shiftKey: e.shiftKey
                    });
                    if (viewObject && viewObject.object) {
                        console.log("Picked", viewObject.object);
                    }
                    this.viewer.drawScene();
                }
                break;
        }
        e.preventDefault();
    }

    /**
     * @private
     */
    canvasWheel(e) {
        this.getCanvasPosFromEvent(e, this.mousePos);
        var delta = Math.max(-1, Math.min(1, -e.deltaY * 40));
        if (delta === 0) {
            return;
        }
        var d = delta / Math.abs(delta);
        var zoom = -d * this.getZoomRate() * this.mousePanSensitivity;
        this.camera.zoom(zoom, this.mousePos);
        e.preventDefault();
    }

    /**
     * @private
     */
    closeEnoughCanvas(p, q) {
        return p[0] >= (q[0] - this.canvasPickTolerance) &&
            p[0] <= (q[0] + this.canvasPickTolerance) &&
            p[1] >= (q[1] - this.canvasPickTolerance) &&
            p[1] <= (q[1] + this.canvasPickTolerance);
    }

    /**
     * @private
     */
    canvasMouseMove(e) {
        if (!this.over) {
            return;
        }
        if (this.mouseDown || e.ctrlKey) {
            this.getCanvasPosFromEvent(e, this.mousePos);
            if (this.dragMode == DRAG_SECTION) {
                this.viewer.moveSectionPlane({canvasPos: this.mousePos});
            } else if (e.ctrlKey) {
                this.viewer.positionSectionPlaneWidget({canvasPos: this.mousePos});
            } else {
                var x = this.mousePos[0];
                var y = this.mousePos[1];
                var xDelta = (x - this.lastX);
                var yDelta = (y - this.lastY);
                this.lastX = x;
                this.lastY = y;
                if (this.dragMode == DRAG_ORBIT) {
                    let f = 0.5;
                    if (xDelta !== 0) {
                        this.camera.orbitYaw(-xDelta * this.mouseOrbitSensitivity * f);
                    }
                    if (yDelta !== 0) {
                        this.camera.orbitPitch(yDelta * this.mouseOrbitSensitivity * f);
                    }
                    this.camera.orbitting = true;
                } else if (this.dragMode == DRAG_PAN) {
                    var f = this.getEyeLookDist() / 600;
                    this.camera.pan([xDelta * f, yDelta * this.mousePanSensitivity * f, 0.0]);
                }
            }
        }
        e.preventDefault();
    }

    /**
     * @private
     */
    documentMouseUp(e) {
        this.mouseDown = false;
    	// Potential end-of-pan
        if (this.dragMode == DRAG_PAN) {
        	this.camera.updateLowVolumeListeners();
        }
        this.dragMode = DRAG_ORBIT;
    }

    getEyeLookDist() {
        var vec = vec3.create();
        return vec3.length(vec3.subtract(vec, this.viewer.camera.target, this.viewer.camera.eye));
    }

    /**
     * @private
     */
    cleanup() {
        var canvas = this.canvas;
    	document.removeEventListener("mouseup", this.documentMouseUpHandler);
        canvas.removeEventListener("mousedown", this.canvasMouseDownHandler);
        canvas.removeEventListener("mouseup", this.canvasMouseUpHandler);
        document.removeEventListener("mouseup", this.documentMouseUpHandler);
        canvas.removeEventListener("mouseenter", this.canvasMouseEnterHandler);
        canvas.removeEventListener("mouseleave", this.canvasMouseLeaveHandler);
        canvas.removeEventListener("mousemove", this.canvasMouseMoveHandler);
        canvas.removeEventListener("wheel", this.canvasMouseWheelHandler);
    }
}