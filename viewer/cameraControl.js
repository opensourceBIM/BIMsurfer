export default class CameraControl {

    constructor(viewer) {

        var self = this;

        this.viewer = viewer;

        this.mousePanSensitivity = 0.5;
        this.mouseOrbitSensitivity = 0.5;
        this.canvasPickTolerance = 4;

        var canvas = viewer.canvas;
        var camera = viewer.camera;

        var mousePos = vec2.create();
        var mouseDownPos = vec2.create();
        var over = false; // True when mouse over canvas
        var down = false; // True when any mouse button is down
        var lastX; // Last canvas pos while dragging
        var lastY;
        var mouseDownLeft; // Mouse button states
        var mouseDownMiddle;
        var mouseDownRight;

        function getCanvasPosFromEvent(event, canvasPos) {
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

        function getZoomRate() {
            var modelBounds = viewer.modelBounds;
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

        var getEyeLookDist = (function () {
            var vec = vec3.create();
            return function () {
                return vec3.length(vec3.subtract(vec, viewer.camera.target, viewer.camera.eye));
            };
        })();

        canvas.addEventListener("mousedown", function (e) {
            getCanvasPosFromEvent(e, mousePos);
            switch (e.which) {
                case 1:
                    mouseDownLeft = true;
                    lastX = mousePos[0];
                    lastY = mousePos[1];
                    mouseDownPos.set(mousePos);
                    break;
                case 2:
                    mouseDownMiddle = true;
                    break;
                case 3:
                    mouseDownRight = true;
                    lastX = mousePos[0];
                    lastY = mousePos[1];
                    break;
                default:
                    break;
            }
            over = true;
            down = true;
        });

        canvas.addEventListener("mouseup", function (e) {
            getCanvasPosFromEvent(e, mousePos);
            switch (e.which) {
                case 1:
                    mouseDownLeft = false;
                    if (closeEnoughCanvas(mouseDownPos, mousePos)) {
                        var viewObject = self.viewer.pick({canvasPos: mousePos});
                        if (viewObject) {
                            var aabb = viewObject.aabb;
                            var center = [(aabb[0] + aabb[3]) / 2, (aabb[1] + aabb[4]) / 2, (aabb[0] + aabb[5]) / 2];
                            self.viewer.camera.target = center;

                            console.log("Picked: " + viewObject.type);
                        }
                    }
                    break;
                case 2:
                    mouseDownMiddle = false;
                    break;
                case 3:
                    mouseDownRight = false;
                    break;
                default:
                    break;
            }
            down = false;
        });

        document.addEventListener("mouseup", function (e) {
            switch (e.which) {
                case 1:
                    mouseDownLeft = false;
                    break;
                case 2:
                    mouseDownMiddle = false;
                    break;
                case 3:
                    mouseDownRight = false;
                    break;
                default:
                    break;
            }
            down = false;
        });

        canvas.addEventListener("mouseenter", function () {
            over = true;
        });

        canvas.addEventListener("mouseleave", function () {
            over = false;
        });

        canvas.addEventListener("mousemove", function (e) {
            if (!over) {
                return;
            }
            if (down) {
                getCanvasPosFromEvent(e, mousePos);
                var x = mousePos[0];
                var y = mousePos[1];
                var xDelta = (x - lastX);
                var yDelta = (y - lastY);
                lastX = x;
                lastY = y;
                if (mouseDownLeft) { // Orbiting
                    let f = 0.5;
                    if (xDelta !== 0) {
                        camera.orbitYaw(-xDelta * self.mouseOrbitSensitivity * f);
                    }
                    if (yDelta !== 0) {
                        camera.orbitPitch(yDelta * self.mouseOrbitSensitivity * f);
                    }
                } else if (mouseDownRight) { // Panning
                    var f = getEyeLookDist() / 600;
                    camera.pan([xDelta * f, yDelta * self.mousePanSensitivity * f, 0.0]);
                }
            }
        });

        canvas.addEventListener("wheel", function (e) { // Zooming
            var delta = Math.max(-1, Math.min(1, -e.deltaY * 40));
            if (delta === 0) {
                return;
            }
            var d = delta / Math.abs(delta);
            var zoom = -d * getZoomRate() * self.mousePanSensitivity;
            camera.zoom(zoom);
            e.preventDefault();
        });

        // Returns true if the two Canvas-space points are
        // close enough to be considered the same point

        function closeEnoughCanvas(p, q) {
            return p[0] >= (q[0] - self.canvasPickTolerance) &&
                p[0] <= (q[0] + self.canvasPickTolerance) &&
                p[1] >= (q[1] - self.canvasPickTolerance) &&
                p[1] <= (q[1] + self.canvasPickTolerance);
        }
    }
}