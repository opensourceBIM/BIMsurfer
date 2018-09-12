import ProgramManager from './programmanager.js'
import Lighting from './lighting.js'
import BufferSetPool from './buffersetpool.js'
import Camera from './camera.js'
import CameraControl from './cameracontrol.js'
import RenderBuffer from './renderbuffer.js'

/*
 * Main viewer class, too many responsibilities:
 * - Keep track of width/height of viewport
 * - Keeps track of dirty scene
 * - Contains the basic render loop (and delegates to the render layers)
 */

export default class Viewer {

    constructor(canvas, settings, stats, width, height) {
        this.stats = stats;
        this.settings = settings;
        this.canvas = canvas;
        this.camera = new Camera(this);

        this.gl = this.canvas.getContext('webgl2', {stencil: true});

        if (!this.gl) {
            alert('Unable to initialize WebGL. Your browser or machine may not support it.');
            return;
        }

        this.width = width;
        this.height = height;

        this.bufferSetPool = new BufferSetPool(1000, this.stats);

        this.renderLayers = [];
        this.animationListeners = [];

        this.viewObjects = new Map();

        // Null means everything visible, otherwise Set(..., ..., ...)
        this.invisibleElements = null;

        this.selectedElements = null;

        var self = this;
        window._debugViewer = this;  // HACK for console debugging

        document.addEventListener("keypress", (evt) => {
            if (evt.key === 'h') {
                if (this.selectedElements) {
                    if (this.invisibleElements) {
                        this.selectedElements.forEach((i) => {
                            this.invisibleElements.add(i);
                        });
                    } else {
                        this.invisibleElements = new Set(this.selectedElements);
                    }
                    this.selectedElements = new Set();
                }
            } else {
                this.invisibleElements = null;
            }
            this.drawScene();
        });
    }

    init() {
        var promise = new Promise((resolve, reject) => {
            this.dirty = true;
            this.then = 0;
            this.running = true;
            this.firstRun = true;

            this.fps = 0;
            this.timeLast = 0;

            this.canvas.oncontextmenu = function (e) { // Allow right-click for camera panning
                e.preventDefault();
            };

            this.cameraControl = new CameraControl(this);
            this.lighting = new Lighting(this);
            this.programManager = new ProgramManager(this.gl, this.settings.viewerBasePath);

            this.programManager.load().then(() => {
                // this.gl.enable(this.gl.CULL_FACE);

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

            this.renderBuffer = new RenderBuffer(this.canvas, this.gl);
        });
        return promise;
    }

    setDimensions(width, height) {
        this.width = width;
        this.height = height;
        this.gl.viewport(0, 0, width, height);
        this.camera.perspective._dirty = true;
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
        let gl = this.gl;

        gl.depthMask(true);
        gl.disable(gl.STENCIL_TEST);
        // gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
        // gl.stencilFunc(gl.ALWAYS, 0, 1);
        gl.clearColor(1, 1, 1, 1.0);
        gl.clearDepth(1);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);

        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
        gl.disable(gl.BLEND);

        if (this.modelBounds != null) {

            // This should not be computed every frame
            var diagonal = Math.sqrt(
                Math.pow(this.modelBounds[3] - this.modelBounds[0], 2) +
                Math.pow(this.modelBounds[4] - this.modelBounds[1], 2) +
                Math.pow(this.modelBounds[5] - this.modelBounds[2], 2));

            var scale = 1 / diagonal;

            if (!this.cameraSet) { // HACK to look at model origin as soon as available
                this.camera.target = [0, 0, 0];
                this.camera.eye = [0, 1, 0];
                this.camera.up = [0, 0, 1];
                this.camera.worldAxis = [ // Set the +Z axis as World "up"
                    1, 0, 0, // Right
                    0, 0, 1, // Up
                    0, -1, 0  // Forward
                ];
                this.camera.viewFit(this.modelBounds); // Position camera so that entire model bounds are in view
                this.camera.worldScale = scale;
                this.cameraSet = true;
            }
        }

        let render = (elems, force) => {
            for (var transparency of [false, true]) {
                if (force !== true) {
                    if (!transparency) {
                        gl.disable(gl.BLEND);
                        gl.depthMask(true);
                    } else {
                        gl.enable(gl.BLEND);
                        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
                        gl.depthMask(false);
                    }
                }
                for (var renderLayer of this.renderLayers) {
                    renderLayer.render(transparency, elems);
                }
            }
        }

        render({without: this.invisibleElements});

        if (this.selectedElements) {
            gl.enable(gl.STENCIL_TEST);
            gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
            gl.stencilFunc(gl.ALWAYS, 1, 0xff);
            gl.stencilMask(0xff);
            gl.depthMask(false);
            gl.disable(gl.DEPTH_TEST);
            gl.colorMask(false, false, false, false);
            
            render({with: this.selectedElements, pass: 'stencil'}, true);

            gl.stencilFunc(gl.NOTEQUAL, 1, 0xff);
            gl.stencilMask(0x00);
            gl.colorMask(true, true, true, true);

            for (var renderLayer of this.renderLayers) {
                renderLayer.renderSelectionOutlines(this.selectedElements);
            }

            gl.disable(gl.STENCIL_TEST);

            for (var renderLayer of this.renderLayers) {
                renderLayer.renderSelectionOutlines(this.selectedElements, 0.001);
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

    /**
     Attempts to pick an object at the given canvas coordinates.

     @param {*} params
     @param {Array} params.canvasPos Canvas coordinates
     @returns {*} Information about the object that was picked, if any.
     */
    pick(params) { // Returns info on the object at the given canvas coordinates

        var canvasPos = params.canvasPos;
        if (!canvasPos) {
            throw "param expected: canvasPos";
        }

        this.renderBuffer.bind();

        this.gl.depthMask(true);
        this.gl.clearBufferuiv(this.gl.COLOR, this.renderBuffer.colorBuffer, new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]));
        this.gl.clearBufferfv(this.gl.COLOR, this.renderBuffer.depthFloat, new Float32Array([1.,1.,1.,1.]));
        this.gl.clearBufferfv(this.gl.DEPTH, this.renderBuffer.depthBuffer, new Uint8Array([1, 0])); // TODO should be a Float16Array, which does not exists, need to find the 16bits that define the number 1 here
        this.gl.enable(this.gl.DEPTH_TEST);
        this.gl.depthFunc(this.gl.LEQUAL);
        this.gl.disable(this.gl.BLEND);

        for (var transparency of [false, true]) {
        	for (var renderLayer of this.renderLayers) {
                renderLayer.render(transparency, {without: this.invisibleElements, pass: 'pick'});
        	}
        }

        var pickColor = this.renderBuffer.read(Math.round(canvasPos[0]), Math.round(canvasPos[1]));

        this.renderBuffer.unbind();

        var objectId = BigInt(pickColor[0]) + (BigInt(pickColor[1]) * 4294967296n);

        var viewObject = this.viewObjects.get(objectId);
        
        if (viewObject) {
            if (!params.shiftKey || !this.selectedElements) {
                this.selectedElements = new Set();
            }
            if (this.selectedElements.has(objectId)) {
                this.selectedElements.delete(objectId);
            } else {
                this.selectedElements.add(objectId);
            }
            return viewObject;
        }

        this.selectedElements = null;

        return null;
    }

    getPickColor(objectId) { // Converts an integer to a pick color
        return new Uint32Array([new Number(objectId & 0xFFFFFFFFn), new Number((objectId >> 32n) & 0xFFFFFFFFn)]);
    }

    setModelBounds(modelBounds) {
        this.modelBounds = modelBounds;
        this.updateViewport();
    }

    updateViewport() {
        this.dirty = true;
    }

    loadingDone() {
        this.dirty = true;
    }

    cleanup() {
        this.running = false;
        this.cameraControl.cleanup();
//        this.gl.getExtension('WEBGL_lose_context').loseContext();
        this.stats.cleanup();
    }

    addAnimationListener(fn) {
        this.animationListeners.push(fn);
    }
}