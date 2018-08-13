export default class CameraControl {

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
        this.down = false; // True when any mouse button is down
        this.lastX; // Last canvas pos while dragging
        this.lastY;
        this.mouseDownLeft; // Mouse button states
        this.mouseDownMiddle;
        this.mouseDownRight;

        this.canvas.oncontextmenu = (e) => {
            e.preventDefault();
        };

        this.canvas.addEventListener("mousedown", (e) => {
        	this.canvasMouseDown(e);
        });

        this.canvas.addEventListener("mouseup", (e) => {
        	this.canvasMouseUp(e);
        });

        this.documentMouseUpHandler = (e) => {
        	this.documentMouseUp(e);
        };
        document.addEventListener("mouseup", this.documentMouseUpHandler);

        this.canvas.addEventListener("mouseenter", (e) => {
            this.over = true;
            e.preventDefault();
        });

        this.canvas.addEventListener("mouseleave", (e) => {
            this.over = false;
            e.preventDefault();
        });

        this.canvas.addEventListener("mousemove", (e) => {
        	this.canvasMouseMove(e);
        });

        this.canvas.addEventListener("wheel", (e) => {
        	this.canvasWheel(e);
        });

        // Returns true if the two Canvas-space points are
        // close enough to be considered the same point

    }
    
    getCanvasPosFromEvent(event, canvasPos) {
        if (!event) {
            event = window.event;
            canvasPos[0] = event.x;
            canvasPos[1] = event.y;
        } else {
            var element = event.target;
            var totalOffsetLeft = 0;
            var totalOffsetTop = 0;
            while (element.offsetParent) {
                totalOffsetLeft += element.offsetLeft;
                totalOffsetTop += element.offsetTop;
                element = element.offsetParent;
            }
            canvasPos[0] = event.pageX - totalOffsetLeft;
            canvasPos[1] = event.pageY - totalOffsetTop;
        }
        return canvasPos;
    }

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
    
    canvasMouseDown(e) {
        this.getCanvasPosFromEvent(e, this.mousePos);
        switch (e.which) {
            case 1:
                this.mouseDownLeft = true;
                this.lastX = this.mousePos[0];
                this.lastY = this.mousePos[1];
                this.mouseDownPos.set(this.mousePos);
                break;
            case 2:
            	this.mouseDownMiddle = true;
                break;
            case 3:
            	this.mouseDownRight = true;
            	this.lastX = this.mousePos[0];
            	this.lastY = this.mousePos[1];
                break;
            default:
                break;
        }
        this.over = true;
        this.down = true;
        e.preventDefault();
    }
    
    canvasMouseUp(e) {
        this.getCanvasPosFromEvent(e, this.mousePos);
        switch (e.which) {
            case 1:
            	this.mouseDownLeft = false;
                if (this.closeEnoughCanvas(this.mouseDownPos, this.mousePos)) {
                    var viewObject = this.viewer.pick({canvasPos: this.mousePos});
                    if (viewObject) {
                        var aabb = viewObject.aabb;
                        var center = [(aabb[0] + aabb[3]) / 2, (aabb[1] + aabb[4]) / 2, (aabb[2] + aabb[5]) / 2];
                        this.viewer.camera.target = center;

                        console.log("Picked", viewObject);
                    }
                }
                break;
            case 2:
            	this.mouseDownMiddle = false;
                break;
            case 3:
            	this.mouseDownRight = false;
                break;
            default:
                break;
        }
        this.down = false;
        e.preventDefault();
    }
    
    canvasWheel(e) {
        var delta = Math.max(-1, Math.min(1, -e.deltaY * 40));
        if (delta === 0) {
            return;
        }
        var d = delta / Math.abs(delta);
        var zoom = -d * this.getZoomRate() * this.mousePanSensitivity;
        this.camera.zoom(zoom);
        e.preventDefault();
    }

    closeEnoughCanvas(p, q) {
        return p[0] >= (q[0] - this.canvasPickTolerance) &&
            p[0] <= (q[0] + this.canvasPickTolerance) &&
            p[1] >= (q[1] - this.canvasPickTolerance) &&
            p[1] <= (q[1] + this.canvasPickTolerance);
    }
    
    canvasMouseMove(e) {
        if (!this.over) {
            return;
        }
        if (this.down) {
        	this.getCanvasPosFromEvent(e, this.mousePos);
            var x = this.mousePos[0];
            var y = this.mousePos[1];
            var xDelta = (x - this.lastX);
            var yDelta = (y - this.lastY);
            this.lastX = x;
            this.lastY = y;
            if (this.mouseDownLeft) { // Orbiting
                let f = 0.5;
                if (xDelta !== 0) {
                	this.camera.orbitYaw(-xDelta * this.mouseOrbitSensitivity * f);
                }
                if (yDelta !== 0) {
                	this.camera.orbitPitch(yDelta * this.mouseOrbitSensitivity * f);
                }
            } else if (this.mouseDownRight) { // Panning
                var f = this.getEyeLookDist() / 600;
                this.camera.pan([xDelta * f, yDelta * this.mousePanSensitivity * f, 0.0]);
            }
        }
        e.preventDefault();
    }
    
    documentMouseUp(e) {
        switch (e.which) {
	        case 1:
	        	this.mouseDownLeft = false;
	            break;
	        case 2:
	        	this.mouseDownMiddle = false;
	            break;
	        case 3:
	        	this.mouseDownRight = false;
	            break;
	        default:
	            break;
	    }
	    this.down = false;
    }
    
    getEyeLookDist() {
        var vec = vec3.create();
        return vec3.length(vec3.subtract(vec, this.viewer.camera.target, this.viewer.camera.eye));
    }

    cleanup() {
    	// TODO remove all event listeners, if we don't, a reference to the viewer and basically everything will stay in memory
    	document.removeEventListener("mouseup", this.documentMouseUpHandler);
    }
}