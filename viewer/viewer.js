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

var tmp_unproject = vec3.create();

// When a change in color results in a different
// transparency state, the objects needs to be hidden
// from the original buffer and recreate in a new buffer
// to be rendered during the correct render pass. This
// recreated object will have it's most significant bit
// set to 1.
var OVERRIDE_FLAG = (1 << 31);

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

        // Picking ID (unsigned int) -> Object ID (can be anything, but usually a Number that's potentially 2^64)
        this.pickIdToObjectId = new Map();
        // Object ID (can be anything, but usually a Number that's potentially 2^64) -> Picking ID (unsigned int)
        this.objectIdToPickId = new Map();
        
        this.renderLayers = [];
        this.animationListeners = [];
        this.colorRestore = [];
        this.geometryIdToBufferSet = new Map();

        // Object ID -> ViewObject
        this.viewObjects = new Map();

        // Null means everything visible, otherwise Set(..., ..., ...)
        this.invisibleElements = null;

        // Elements for which the color has been overriden and transparency has
        // changed. These elements are hidden from their original buffers and
        // recreated in a new buffer during the correct render pass. When elements
        // are unhidden, the overridden elements need to stay hidden.
        this.hiddenDueToSetColor = new Map();
        this.originalColors = new Map();

        this.selectedElements = new Set();

        var self = this;
        window._debugViewer = this;  // HACK for console debugging

        document.addEventListener("keypress", (evt) => {
            if (evt.key === 'H') {
                this.invisibleElements = new Set();
                // Make sure elements hidden due to setColor() stay hidden
                for (let i of this.hiddenDueToSetColor.keys()) {
                    this.invisibleElements.add(i);
                };
                if (this.invisibleElements.size == 0) {
                    this.invisibleElements = null;
                }
            } else if (evt.key === 'h') {
                this.hide(this.selectedElements);
                this.selectedElements = new Set();
            } else if (evt.key === 'C') {
                this.resetColor(
                    Array.from(this.hiddenDueToSetColor.keys()).concat(
                        Array.from(this.originalColors.keys())
                    )
                );
            } else if (evt.key === 'c' || evt.key === 'd') {
                let R = Math.random;
                let clr = [R(), R(), R(), R()];
                if (evt.key === 'c') {
                    clr[3] = 1.;
                }

                this.setColor(this.selectedElements, clr);
                this.selectedElements = new Set();
            } else {
            	// Don't do a drawScene for every key pressed
            	return;
            }
            this.drawScene();
        });
    }

    hide(elems) {
        this.invisibleElements = this.invisibleElements || new Set();
        elems.forEach((i) => {
            this.invisibleElements.add(i);
            // Hide transparently-adjusted counterpart (even though it might not exist)
            this.invisibleElements.add(i | OVERRIDE_FLAG);
        });
    }

    resetColor(elems) {
        for (let objectId of elems) {
            if (this.hiddenDueToSetColor.has(objectId)) {
                this.invisibleElements.delete(objectId);
                let buffer = this.hiddenDueToSetColor.get(objectId);
                buffer.manager.deleteBuffer(buffer);
                this.hiddenDueToSetColor.delete(objectId);
            } else if (this.originalColors.has(objectId)) {
                this.geometryIdToBufferSet.get(objectId).forEach((bufferSet) => {
                    bufferSet.setColor(this.gl, objectId, this.originalColors.get(objectId));
                });
                this.originalColors.delete(objectId);
            }            
        }
    }

    setColor(elems, clr) {
        // Reset colors first to clear any potential transparency overrides.
        this.resetColor(elems);
        
        for (let objectId of elems) {
            this.geometryIdToBufferSet.get(objectId).forEach((bufferSet) => {
                let originalColor = bufferSet.setColor(this.gl, objectId, clr);
                if (originalColor === false) {
                    if (!this.invisibleElements) {
                        this.invisibleElements = new Set();
                    }

                    let original = bufferSet.copy(this.gl, objectId);

                    let clrSameType = new original.colors.constructor(4);
                    let factor = clrSameType.constructor.name === "Uint8Array" ? 255. : 1.;

                    for (let i = 0; i < 4; ++i) {
                        clrSameType[i] = clr[i] * factor;
                    }

                    for (let i = 0; i < original.colors.length; i += 4) {
                        original.colors.set(clrSameType, i);
                    }

                    original.hasTransparency = !bufferSet.hasTransparency;

                    original.node = bufferSet.node;

                    let buffer = bufferSet.owner.flushBuffer(original, false);

                    // Note that this is an attribute on the bufferSet, but is
                    // not applied to the actual webgl vertex data.
                    buffer.objectId = objectId | OVERRIDE_FLAG;

                    this.invisibleElements.add(objectId);
                    this.hiddenDueToSetColor.set(objectId, buffer);
                } else {
                    this.originalColors.set(objectId, originalColor);
                }
            });
        }
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
                this.cameraSet = true;
            }
        }

        let render = (elems, force) => {
            for (var transparency of [false, true]) {
                if (force !== true) {
                    if (!transparency) {
                        gl.disable(gl.BLEND);
                        // gl.depthMask(true);
                    } else {
                        gl.enable(gl.BLEND);
                        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
                        // gl.depthMask(false);
                    }
                }
                for (var renderLayer of this.renderLayers) {
                    renderLayer.render(transparency, elems);
                }
            }
        }

        render({without: this.invisibleElements});

        if (this.selectedElements.size > 0) {
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
        this.gl.clearBufferuiv(this.gl.COLOR, 0, new Uint8Array([0, 0, 0, 0]));
        
        /*
         * @todo: clearing the 2nd attachment does not work? Not a big issue as long
         * as one of the buffers is cleared to be able to detect clicks outside of the model.
         */
        // this.gl.clearBufferfv(this.gl.COLOR, 1, new Float32Array([1.]));

        this.gl.clearBufferfv(this.gl.DEPTH, this.renderBuffer.depthBuffer, new Uint8Array([1, 0])); // TODO should be a Float16Array, which does not exists, need to find the 16bits that define the number 1 here
        this.gl.enable(this.gl.DEPTH_TEST);
        this.gl.depthFunc(this.gl.LEQUAL);
        this.gl.disable(this.gl.BLEND);

        for (var transparency of [false, true]) {
        	for (var renderLayer of this.renderLayers) {
                renderLayer.render(transparency, {without: this.invisibleElements, pass: 'pick'});
        	}
        }
        
        let [x,y] = [Math.round(canvasPos[0]), Math.round(canvasPos[1])];
        var pickColor = this.renderBuffer.read(x, y);
        var pickId = pickColor[0] + pickColor[1] * 256 + pickColor[2] * 65536 + pickColor[3] * 16777216;
        var objectId = this.pickIdToObjectId.get(pickId);
        var viewObject = this.viewObjects.get(objectId);

        // Don't attempt to read depth if there is no object under the cursor
        // Note that the default depth of 1. corresponds to the far plane, which
        // can be quite far away but at least is something that is recognizable
        // in most cases.
        let z = viewObject ? this.renderBuffer.depth(x,y) : 1.;
        vec3.set(tmp_unproject, x / this.width * 2 - 1, - y / this.height * 2 + 1, z);
        vec3.transformMat4(tmp_unproject, tmp_unproject, this.camera.projection.projMatrixInverted);
        vec3.transformMat4(tmp_unproject, tmp_unproject, this.camera.viewMatrixInverted);
//        console.log("Picked @", tmp_unproject[0], tmp_unproject[1], tmp_unproject[2], objectId, viewObject);

        this.renderBuffer.unbind();
        
        if (viewObject) {
            if (params.select !== false) {
                if (!params.shiftKey) {
                    this.selectedElements = new Set();
                }
                if (this.selectedElements.has(objectId)) {
                    this.selectedElements.delete(objectId);
                } else {
                    this.selectedElements.add(objectId);
                }
            }
            return {object: viewObject, coordinates: tmp_unproject};
        } else if (params.select !== false) {
            this.selectedElements = new Set();
        }

        return {object: null, coordinates: tmp_unproject};
    }

    getPickColor(objectId) { // Converts an integer to a pick color
    	var pickId = this.objectIdToPickId.get(objectId);
    	if (pickId == null) {
    		console.error("No pickId for " + objectId);
    	}
    	var pickColor = new Uint8Array([pickId & 0x000000FF, (pickId & 0x0000FF00) >> 8, (pickId & 0x00FF0000) >> 16, (pickId & 0xFF000000) > 24]);
        return pickColor;
    }

    setModelBounds(modelBounds) {
        this.modelBounds = modelBounds;
        this.camera.setModelBounds(modelBounds);
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
    
    addViewObject(objectId, viewObject) {
    	var pickId = this.pickIdToObjectId.size;
    	this.viewObjects.set(objectId, viewObject);
    	this.objectIdToPickId.set(objectId, pickId);
    	this.pickIdToObjectId.set(pickId, objectId);
    }
}