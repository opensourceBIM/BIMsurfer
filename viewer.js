import ProgramManager from './programmanager.js'
import Lighting from './lighting.js'
import BufferSetPool from './buffersetpool.js'
import Camera from './camera.js'
import CameraControl from './cameraControl.js'

/*
 * Main viewer class, too many responsibilities:
 * - Keep track of width/height of viewport
 * - Keeps track of dirty scene
 * - (To camera/scene) Contains light source(s)
 * - (To camera) Keeps track of matrices for model/view/projection
 * - Contains the basic render loop (and delegates to the render layers)
 * - (To camera) Does the rotation/zoom
 */

export default class Viewer {

    constructor(settings, stats, width, height) {
        this.stats = stats;
        this.settings = settings;

        this.width = width;
        this.height = height;

        this.bufferSetPool = new BufferSetPool(1000, this.stats);

        this.renderLayers = [];
        this.animationListeners = [];

        // Temporary hack until real navigation is implemented
        this.navigationActive = true;
    }

    init() {
        var promise = new Promise((resolve, reject) => {
            this.dirty = true;
            this.modelRotation = 0;
            this.then = 0;
            this.running = true;
            this.firstRun = true;

            this.fps = 0;
            this.timeLast = 0;

            this.zoomLevel = 1;

            this.canvas = document.querySelector('#glcanvas');
            this.gl = this.canvas.getContext('webgl2');

            if (!this.gl) {
                alert('Unable to initialize WebGL. Your browser or machine may not support it.');
                return;
            }

            this.camera = new Camera(this);
            this.cameraControl = new CameraControl(this);
            this.lighting = new Lighting(this.gl);
            this.programManager = new ProgramManager(this.gl);

            this.programManager.load().then(() => {
                this.gl.enable(this.gl.CULL_FACE);

                // It would be really nice to get the BIMsurfer V1 like anti-aliasing, so far I understand this is definitely
                // possible in WebGL2 but you need to do something with framebuffers/renderbuffers.

//				this.colorFrameBuffer = this.gl.createRenderbuffer();
//				this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, this.colorFrameBuffer);
//				this.gl.renderbufferStorageMultisample(this.gl.RENDERBUFFER, 4, this.gl.RGBA8, this.width, this.height);
//
//				this.renderFrameBuffer = this.gl.createFramebuffer();
//				this.renderFrameBuffer = this.gl.createFramebuffer();
//				
//				this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.renderFrameBuffer);
//				this.gl.framebufferRenderbuffer(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.RENDERBUFFER, this.colorFrameBuffer);
//				this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);

                resolve();
                requestAnimationFrame((now) => {
                    this.render(now);
                });
            });
        });
        return promise;
    }

    setDimensions(width, height) {
        this.width = width;
        this.height = height;
        this.gl.viewport(0, 0, width, height);
        this.updateViewport();
    }

    render(now) {
        now *= 0.001;
        const deltaTime = now - this.then;
        this.then = now;

        this.fps++;

        var wasDirty = this.dirty;
        if (this.dirty) {
            this.dirty = false;
            this.drawScene(this.buffers, deltaTime);
        }

        if (now - this.timeLast >= 1) {
            if (wasDirty) {
                this.stats.setParameter("Rendering", "FPS", Number(this.fps / (now - this.timeLast)).toPrecision(5));
            } else {
                this.stats.setParameter("Rendering", "FPS", "Off");
            }
            this.timeLast = now;
            this.fps = 0;
            this.stats.requestUpdate();
            this.stats.update();
        }

        if (this.running) {
            requestAnimationFrame((now) => {
                this.render(now);
            });
        }
        for (var animationListener of this.animationListeners) {
            animationListener(deltaTime);
        }
    }

    drawScene(buffers, deltaTime) {
        this.gl.depthMask(true);
        this.gl.clearColor(1, 1, 1, 1.0);
        this.gl.clearDepth(1);
        this.gl.enable(this.gl.DEPTH_TEST);
        this.gl.depthFunc(this.gl.LEQUAL);

        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
        this.gl.disable(this.gl.BLEND);

        if (this.modelBounds != null) {

            // This should not be computed every frame
            var diagonal = Math.sqrt(
                Math.pow(this.modelBounds[3] - this.modelBounds[0], 2) +
                Math.pow(this.modelBounds[4] - this.modelBounds[1], 2) +
                Math.pow(this.modelBounds[5] - this.modelBounds[2], 2));

            var scale = 1 / diagonal;

            // TODO: restore zoomLevel
            // // Scale to -1,1 and scale by zoomLevel
            // mat4.scale(this.modelViewMatrix, this.modelViewMatrix, [this.zoomLevel, this.zoomLevel, this.zoomLevel]);
            // mat4.scale(this.modelViewMatrix, this.modelViewMatrix, [scale, scale, scale]);

            // We save this for use by the tiling render manager, something is off atm...
            this.totalScale = (this.zoomLevel * scale) * 2;

            if (!this.cameraSet) { // HACK to look at model origin as soon as available
                var center = [
                    (this.modelBounds[3] + this.modelBounds[0]) / 2,
                    (this.modelBounds[4] + this.modelBounds[1]) / 2,
                    (this.modelBounds[5] + this.modelBounds[2]) / 2
                ];
                var dist = 100; // TODO: Derive from perspective frustum and modelBounds
                this.camera.target = center;
                this.camera.eye = [center[0], center[1] - dist, center[2]];
                this.camera.up = [0, 0, 1];
                this.camera.worldAxis = [ // Set the +Z axis as World "up"
                    1, 0, 0, // Right
                    0, 0, 1, // Up
                    0, -1, 0  // Forward
                ];
                this.camera.zoomLevel = 0.005;
                this.cameraSet = true;
            }
        }

        for (var transparency of [false, true]) {
            if (!transparency) {
                this.gl.disable(this.gl.BLEND);
                this.gl.depthMask(true);
            } else {
                this.gl.enable(this.gl.BLEND);
                this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
                this.gl.depthMask(false);
            }
            for (var renderLayer of this.renderLayers) {
                renderLayer.render(transparency);
            }
        }

//		this.gl.bindFramebuffer(this.gl.READ_FRAMEBUFFER, this.renderFrameBuffer);
//		this.gl.bindFramebuffer(this.gl.DRAW_FRAMEBUFFER, this.colorFrameBuffer);
//		this.gl.clearBufferfv(this.gl.COLOR, 0, [0.0, 0.0, 0.0, 1.0]);
//		this.gl.blitFramebuffer(
//		    0, 0, this.width, this.height,
//		    0, 0, this.width, this.height,
//		    this.gl.COLOR_BUFFER_BIT, this.gl.NEAREST
//		);
    }

    setModelBounds(modelBounds) {
        this.modelBounds = modelBounds;
        this.updateViewport();
    }

    updateViewport() {
        // const fieldOfView = 45 * Math.PI / 180;
        // const aspect = this.width / this.height;
        // const zNear = 0.1;
        // const zFar = 100.0;
        //
        // this.projectionMatrix = mat4.create();
        // mat4.perspective(this.projectionMatrix, fieldOfView, aspect, zNear, zFar);

        this.frustumPlanes = this.extractPlanes(this.camera.projMatrix, this.camera.perspective.near, this.camera.perspective.far);
//		this.frustumPlanes = [
//			[-1, 0, 0, -1],
//			[1, 0, 0, 1],
//			[0, 1, 0, 1],
//			[0, -1, 0, -1],
//			[0, 0, -1, -1],
//			[0, 0, 1, 1],
//		];

//		var inverse = mat4.create();
//		mat4.invert(inverse, this.projectionMatrix);


        this.dirty = true;
    }

    extractPlanes(M, zNear, zFar) {
        return [
            [M[12] + M[0], M[13] + M[1], M[14] + M[2], M[15] + M[3]],
            [M[12] - M[0], M[13] - M[1], M[14] - M[2], M[15] - M[3]],
            [M[12] + M[4], M[13] + M[5], M[14] + M[6], M[15] + M[7]],
            [M[12] - M[4], M[13] - M[5], M[14] - M[6], M[15] - M[7]],
            [zNear * M[12] + M[8], zNear * M[13] + M[9], zNear * M[14] + M[10], zNear * M[15] + M[11]],
            [zFar * M[12] - M[8], zFar * M[13] - M[9], zFar * M[14] - M[10], zFar * M[15] - M[11]]
        ];
    }

    loadingDone() {
        this.dirty = true;
    }

    incModelRotation(inc) {
        this.modelRotation += inc;
        this.dirty = true;
    }

    incZoomLevel(inc) {
        this.zoomLevel += inc;
        this.dirty = true;
    }

    cleanup() {
        this.running = false;
        this.gl.getExtension('WEBGL_lose_context').loseContext();
        this.stats.cleanup();
    }

    addAnimationListener(fn) {
        this.animationListeners.push(fn);
    }
}