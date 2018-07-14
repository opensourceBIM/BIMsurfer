export default class CameraControl {

    constructor(viewer) {

        var self = this;

        this.viewer = viewer;

        this.mousePanSensitivity = 0.5;
        this.mouseOrbitSensitivity = 0.5;

        this.zoomToCursor = false;

        var canvas = viewer.canvas;
        var camera = viewer.camera;

        var mousePos = vec2.create();
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

        var getBoundaryDiag = (function () {
            var min = vec3.create();
            var max = vec3.create();
            var tempVec3 = vec3.create();
            return function (aabb) {
                min[0] = aabb[0];
                min[1] = aabb[1];
                min[2] = aabb[2];
                max[0] = aabb[0] + aabb[3];
                max[1] = aabb[1] + aabb[4];
                max[2] = aabb[2] + aabb[5];
                vec3.subtract(tempVec3, max, min);
                return Math.abs(vec3.length(tempVec3));
            };
        })();

        var unproject = (function () {
            var screenPos = vec4.create();
            return function (inverseProjMat, inverseViewMat, canvasPos, z, viewPos, worldPos) {
                var halfCanvasWidth = canvas.offsetWidth / 2.0;
                var halfCanvasHeight = canvas.offsetHeight / 2.0;
                screenPos[0] = (canvasPos[0] - halfCanvasWidth) / halfCanvasWidth; // Transform Canvas space to Screen space
                screenPos[1] = (canvasPos[1] - halfCanvasHeight) / halfCanvasHeight;
                screenPos[2] = z;
                screenPos[3] = 1.0;
                vec4.transformMat4(viewPos, screenPos, inverseProjMat); // Transform to View space
                vec3.scale(viewPos, viewPos, 1.0 / viewPos[3]); // Undo perspective projection
                viewPos[3] = 1.0;
                viewPos[1] *= -1; // TODO: Why is this reversed?
                vec4.transformMat4(worldPos, viewPos, inverseViewMat); // Transform to World space
            };
        })();

        var panToWorldPos = (function () {
            var eyeCursorVec = vec3.create();
            return function (worldPos, factor) {
                var eye = camera.eye;
                var target = camera.target;
                vec3.subtract(eyeCursorVec, worldPos, eye);
                vec3.normalize(eyeCursorVec, eyeCursorVec);
                var px = eyeCursorVec[0] * factor;
                var py = eyeCursorVec[1] * factor;
                var pz = eyeCursorVec[2] * factor;
                camera.eye = [eye[0] + px, eye[1] + py, eye[2] + pz];
                camera.target = [target[0] + px, target[1] + py, target[2] + pz];
            };
        })();

        var panToCanvasPos = (function () {
            var viewPos = vec4.create();
            var worldPos = vec4.create();
            var inverseViewMat = mat4.create();
            var inverseProjMat = mat4.create();
            var transposedProjMat = mat4.create();
            return function (canvasPos, factor) {
                var lastHoverDistance = 0;
                mat4.invert(inverseViewMat, camera.viewMatrix);
                mat4.invert(inverseProjMat, camera.projMatrix);
                mat4.transpose(transposedProjMat, camera.projMatrix);
                var Pt3 = transposedProjMat.subarray(8, 12); // Get last two columns of projection matrix
                var Pt4 = transposedProjMat.subarray(12);
                var sceneDiagSize = getBoundaryDiag(viewer.modelBounds);
                var D = [0, 0, -(lastHoverDistance || sceneDiagSize), 1];
                var Z = vec4.dot(D, Pt3) / vec4.dot(D, Pt4);
                unproject(inverseProjMat, inverseViewMat, canvasPos, Z, viewPos, worldPos);
                panToWorldPos(worldPos, factor);
            };

        })();

        var getEyeLookDist = (function () {
            var vec = vec3.create();
            return function () {
                return vec3.length(vec3.subtract(vec, viewer.camera.target, viewer.camera.eye));
            };
        })();

        canvas.addEventListener("mousedown", function (e) {
            switch (e.which) {
                case 1:
                    mouseDownLeft = true;
                    getCanvasPosFromEvent(e, mousePos);
                    lastX = mousePos[0];
                    lastY = mousePos[1];
                    break;
                case 2:
                    mouseDownMiddle = true;
                    break;
                case 3:
                    mouseDownRight = true;
                    getCanvasPosFromEvent(e, mousePos);
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
            getCanvasPosFromEvent(e, mousePos);
            if (down) {
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
            var zoomToCursorSensitivity = 500;
            var d = delta / Math.abs(delta);
            var zoom = -d * getZoomRate() * self.mousePanSensitivity;
            if (self.zoomToCursor) {
                panToCanvasPos(mousePos, delta > 0 ? zoomToCursorSensitivity : -zoomToCursorSensitivity);
            } else {
                camera.zoom(zoom);
            }
            e.preventDefault();
        });
    }
}