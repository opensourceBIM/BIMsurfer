export default class CameraControl {

    constructor(viewer) {

        var self = this;

        this.viewer = viewer;
        this.mouseZoomRate = 1.0;
        this.mouseOrbitRate = 1.0;

        var canvas = viewer.canvas;
        var camera = viewer.camera;

        var mousePos = vec2.create();
        var over = false;
        var lastX;
        var lastY;
        var xDelta = 0;
        var yDelta = 0;
        var down = false;
        var mouseDownLeft;
        var mouseDownMiddle;
        var mouseDownRight;

        canvas.addEventListener("mousedown", function (e) {
            over = true;
            switch (e.which) {
                case 1: // Left button
                    mouseDownLeft = true;
                    down = true;
                    xDelta = 0;
                    yDelta = 0;
                    getCanvasPosFromEvent(e, mousePos);
                    lastX = mousePos[0];
                    lastY = mousePos[1];
                    break;
                case 2: // Middle/both buttons
                    mouseDownMiddle = true;
                    break;
                case 3: // Right button
                    mouseDownRight = true;
                    down = true;
                    xDelta = 0;
                    yDelta = 0;
                    getCanvasPosFromEvent(e, mousePos);
                    lastX = mousePos[0];
                    lastY = mousePos[1];
                    break;
                    break;
                default:
                    break;
            }
        });

        canvas.addEventListener("mouseup", function (e) {
            switch (e.which) {
                case 1: // Left button
                    mouseDownLeft = false;
                    break;
                case 2: // Middle/both buttons
                    mouseDownMiddle = false;
                    break;
                case 3: // Right button
                    mouseDownRight = false;
                    break;
                default:
                    break;
            }
            down = false;
            xDelta = 0;
            yDelta = 0;
        });

        document.addEventListener("mouseup", function (e) {
            switch (e.which) {
                case 1: // Left button
                    mouseDownLeft = false;
                    break;
                case 2: // Middle/both buttons
                    mouseDownMiddle = false;
                    break;
                case 3: // Right button
                    mouseDownRight = false;
                    break;
                default:
                    break;
            }
            down = false;
            xDelta = 0;
            yDelta = 0;
        });

        canvas.addEventListener("mouseenter", function () {
            over = true;
            xDelta = 0;
            yDelta = 0;
        });

        canvas.addEventListener("mouseleave", function () {
            over = false;
            xDelta = 0;
            yDelta = 0;
        });

        canvas.addEventListener("mousemove", function (e) {
            if (!over) {
                return;
            }
            if (down) {
                getCanvasPosFromEvent(e, mousePos);
                var x = mousePos[0];
                var y = mousePos[1];
                xDelta += (x - lastX) * self.mouseOrbitRate;
                yDelta += (y - lastY) * self.mouseOrbitRate;
                lastX = x;
                lastY = y;

                // Rotation

                // Panning

            }
        });

        canvas.addEventListener("wheel", function (e) {
            var delta = Math.max(-1, Math.min(1, -e.deltaY * 40));
            if (delta === 0) {
                return;
            }
            var d = delta / Math.abs(delta);
            var zoom = -d * getZoomRate() * self.mouseZoomRate;
            camera.zoom(zoom);
            e.preventDefault();
        });

        function getZoomRate() {
            var modelBounds = viewer.modelBounds;
            if (modelBounds) {
                var xsize = modelBounds[3] - modelBounds[0];
                var ysize = modelBounds[4] - modelBounds[1];
                var zsize = modelBounds[5] - modelBounds[2];
                var max = (xsize > ysize ? xsize : ysize);
                max = (zsize > max ? zsize : max);
                return max / 30;
            } else {
                return 1;
            }
        }
    }
}


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