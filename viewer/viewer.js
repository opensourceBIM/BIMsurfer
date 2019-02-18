import {ProgramManager} from './programmanager.js'
import {Lighting} from './lighting.js'
import {BufferSetPool} from './buffersetpool.js'
import {Camera} from './camera.js'
import {CameraControl} from './cameracontrol.js'
import {RenderBuffer} from './renderbuffer.js'
import {SvgOverlay} from './svgoverlay.js'
import {FrozenBufferSet} from './frozenbufferset.js'
import {Utils} from './utils.js'
import {SSQuad} from './ssquad.js'
import {FreezableSet} from './freezableset.js';

import {COLOR_FLOAT_DEPTH_NORMAL, COLOR_ALPHA_DEPTH} from './renderbuffer.js';
import { WSQuad } from './wsquad.js';

var tmp_unproject = vec3.create();

// When a change in color results in a different
// transparency state, the objects needs to be hidden
//} from the original buffer and recreate in a new buffer
// to be rendered during the correct render pass. This
// recreated object will have it's most significant bit
// set to 1.
const OVERRIDE_FLAG = (1 << 31);

/**
 *
 * Main viewer class, too many responsibilities:
 * - Keep track of width/height of viewport
 * - Keeps track of dirty scene
 * - Contains the basic render loop (and delegates to the render layers)
 *
 * @export
 * @class Viewer
 */
export class Viewer {

    constructor(canvas, settings, stats, width, height) {
        this.stats = stats;
        this.settings = settings;
        this.canvas = canvas;
        this.camera = new Camera(this);
        this.overlay = new SvgOverlay(this.canvas, this.camera);
        
        this.gl = this.canvas.getContext('webgl2', {stencil: true});

        if (!this.gl) {
            alert('Unable to initialize WebGL. Your browser or machine may not support it.');
            return;
        }

        this.width = width;
        this.height = height;

        if (!this.settings.loaderSettings.prepareBuffers) {
        	this.bufferSetPool = new BufferSetPool(1000, this.stats);
        }

        this.pickIdCounter = 1;

        this.sectionPlaneIsDisabled = true;

        this.sectionPlaneValuesDisabled = new Float32Array(4);
        this.sectionPlaneValuesDisabled.set([0,0,0,1]);

        this.sectionPlaneValues = new Float32Array(4);
        this.sectionPlaneValues2 = new Float32Array(4);
        
        this.sectionPlaneValues.set(this.sectionPlaneValuesDisabled);
        // this.sectionPlaneValues.set([0,1,1,-5000]);
        this.sectionPlaneValues2.set(this.sectionPlaneValues);

        // Picking ID (unsigned int) -> ViewObject
        // This is an array now since the picking ids form a continues array
        this.pickIdToViewObject = [];
        
        this.renderLayers = [];
        this.animationListeners = [];
        this.colorRestore = [];
        this.geometryIdToBufferSet = new Map();

        // Object ID -> ViewObject
        this.viewObjects = new Map();

        // String -> ViewObject[]
        this.viewObjectsByType = new Map();

        // Null means everything visible, otherwise Set(..., ..., ...)
        this.invisibleElements = new FreezableSet();

        // Elements for which the color has been overriden and transparency has
        // changed. These elements are hidden} from their original buffers and
        // recreated in a new buffer during the correct render pass. When elements
        // are unhidden, the overridden elements need to stay hidden.
        this.hiddenDueToSetColor = new Map();
        this.originalColors = new Map();

        // For instances the logic is even different, as the element matrices
        // are removed} from the buffer and added back to different (instanced)
        // bufferset. When undoing colors on reused geometries, the product matrix
        // simply needs to be added back to the original.
        this.instancesWithChangedColor = new Map();

        this.selectedElements = new FreezableSet();

        this.useOrderIndependentTransparency = this.settings.realtimeSettings.orderIndependentTransparency;

        var self = this;
//        window._debugViewer = this;  // HACK for console debugging

        document.addEventListener("keypress", (evt) => {
            if (evt.key === 'H') {
                this.resetVisibility();
            } else if (evt.key === 'h') {
                this.setVisibility(this.selectedElements, false);
                this.selectedElements.clear();
            } else if (evt.key === 'C') {
                this.resetColors();
            } else if (evt.key === 'c' || evt.key === 'd') {
                let R = Math.random;
                let clr = [R(), R(), R(), evt.key === 'd' ? R() : 1.0];
                this.setColor(this.selectedElements, clr);
                this.selectedElements.clear();
            } else {
            	// Don't do a drawScene for every key pressed
            	return;
            }
            this.drawScene();
        });
    }

    callByType(method, types, ...args) {
        let elems = types.map((i) => this.viewObjectsByType.get(i) || [])
            .reduce((a, b) => a.concat(b), [])
            .map((o) => o.oid);
        method.call(this, elems, ...args);
    }

    setVisibility(elems, visible) {
        elems = Array.from(elems);
        
        let fn = (visible ? this.invisibleElements.delete : this.invisibleElements.add).bind(this.invisibleElements);
        this.invisibleElements.batch(() => {
        
            elems.forEach((i) => {
                fn(i);
                // Show/hide transparently-adjusted counterpart (even though it might not exist)
                fn(i | OVERRIDE_FLAG);
            });

            // Make sure elements hidden due to setColor() stay hidden
            for (let i of this.hiddenDueToSetColor.keys()) {
                this.invisibleElements.add(i);
            };

        });

        this.dirty = true;
    }

    setSelectionState(elems, selected, clear) {
        this.selectedElements.batch(() => {
            if (clear) {
                this.selectedElements.clear();
            }

            let fn = (selected ? this.selectedElements.add : this.selectedElements.delete).bind(this.selectedElements);
            for (let e of elems) {
                fn(e);
            }
        });

        this.dirty = true;
    }

    getSelected() {
        return Array.from(this.selectedElements)
            .map(this.viewObjects.get.bind(this.viewObjects));
    }

    resetColor(elems) {
        this.invisibleElements.batch(() => {
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
                } else if (this.instancesWithChangedColor.has(objectId)) {
                    let entry = this.instancesWithChangedColor.get(objectId);
                    entry.override.manager.deleteBuffer(entry.override);
                    entry.original.setObjects(this.gl, entry.original.objects.concat([entry.object]));
                    this.instancesWithChangedColor.delete(objectId);
                }
            }
        });
    }

    setColor(elems, clr) {
        // Reset colors first to clear any potential transparency overrides.
        this.resetColor(elems);
        
        for (let objectId of elems) {
            this.geometryIdToBufferSet.get(objectId).forEach((bufferSet) => {
                let originalColor = bufferSet.setColor(this.gl, objectId, clr);
                if (originalColor === false) {
                    let copiedBufferSet = bufferSet.copy(this.gl, objectId);
                    let clrSameType, newClrBuffer;
                    if (copiedBufferSet instanceof FrozenBufferSet) {
                        clrSameType = new window[copiedBufferSet.colorBuffer.js_type](4);
                        newClrBuffer = new window[copiedBufferSet.colorBuffer.js_type](copiedBufferSet.colorBuffer.N);
                        copiedBufferSet.hasTransparency = clr[3] < 1.;
                    } else {
                        clrSameType = new copiedBufferSet.colors.constructor(4);
                        newClrBuffer = copiedBufferSet.colors;
                        copiedBufferSet.hasTransparency = !bufferSet.hasTransparency;
                    }

                    let factor = clrSameType.constructor.name === "Uint8Array" ? 255. : 1.;

                    for (let i = 0; i < 4; ++i) {
                        clrSameType[i] = clr[i] * factor;
                    }

                    for (let i = 0; i < newClrBuffer.length; i += 4) {
                        newClrBuffer.set(clrSameType, i);
                    }                     

                    copiedBufferSet.node = bufferSet.node;

                    let buffer;

                    if (copiedBufferSet instanceof FrozenBufferSet) {
            			var programInfo = this.programManager.getProgram(this.programManager.createKey(true, false));
                        var pickProgramInfo = this.programManager.getProgram(this.programManager.createKey(true, true));

                        copiedBufferSet.colorBuffer = Utils.createBuffer(this.gl, newClrBuffer, null, null, 4);

                        let obj = bufferSet.objects.find(o => o.id === objectId);
                        bufferSet.setObjects(this.gl, bufferSet.objects.filter(o => o.id !== objectId));
                        copiedBufferSet.setObjects(this.gl, [obj]);

                        copiedBufferSet.buildVao(this.gl, this.settings, programInfo, pickProgramInfo);
                        copiedBufferSet.manager.pushBuffer(copiedBufferSet);
                        buffer = copiedBufferSet;

                        // NB: Single bufferset entry is assumed here, which is the case for now.
                        this.geometryIdToBufferSet.get(objectId)[0] = buffer;

                        this.instancesWithChangedColor.set(objectId, {
                            object: obj,
                            original: bufferSet, 
                            override: copiedBufferSet
                        });
                    } else {
                        buffer = bufferSet.owner.flushBuffer(copiedBufferSet, false);

                        // Note that this is an attribute on the bufferSet, but is
                        // not applied to the actual webgl vertex data.
                        buffer.objectId = objectId | OVERRIDE_FLAG;

                        this.invisibleElements.add(objectId);
                        this.hiddenDueToSetColor.set(objectId, buffer);
                    }                    
                } else {
                    this.originalColors.set(objectId, originalColor);
                }
            });
        }

        this.dirty = true;
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
            this.programManager = new ProgramManager(this.gl, this.settings);

            this.programManager.load().then(() => {
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

            this.pickBuffer = new RenderBuffer(this.canvas, this.gl, COLOR_FLOAT_DEPTH_NORMAL);
            this.oitBuffer = new RenderBuffer(this.canvas, this.gl, COLOR_ALPHA_DEPTH);
            this.quad = new SSQuad(this.gl);
            this.quad2 = new WSQuad(this, this.gl);
        });
        return promise;
    }

    setDimensions(width, height) {
        this.width = width;
        this.height = height;
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
        // Locks the camera so that intermittent mouse events will not
        // change the matrices until the camera is unlocked again.
        // @todo This might need some work to make sure events are
        // processed timely and smoothly.
        this.camera.lock();

        let gl = this.gl;

        gl.depthMask(true);
        gl.disable(gl.STENCIL_TEST);
        gl.clearColor(1, 1, 1, 1.0);
        gl.clearDepth(1);
        gl.clearStencil(0);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        
        gl.viewport(0, 0, this.width, this.height);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
        gl.enable(gl.CULL_FACE);

        this.sectionPlaneValues.set(this.sectionPlaneValues2);

        for (var renderLayer of this.renderLayers) {
            renderLayer.prepareRender();
        }

        let render = (elems, t) => {
            for (var transparency of (t || [false, true])) {
                for (var renderLayer of this.renderLayers) {
                    renderLayer.render(transparency, elems);
                }
            }
        }

        if (this.modelBounds) {
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

            if (!this.sectionPlaneIsDisabled) {
                gl.stencilMask(0xff);
                this.quad2.position(this.modelBounds, this.sectionPlaneValues);
                gl.colorMask(false, false, false, false);
                gl.disable(gl.CULL_FACE);
                this.quad2.draw();
                gl.enable(gl.CULL_FACE);
                gl.depthMask(false);

                gl.enable(gl.STENCIL_TEST);
                gl.stencilFunc(gl.ALWAYS, 1, 0xff);

                this.sectionPlaneValues.set(this.sectionPlaneValuesDisabled);

                gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR); // increment on pass
                gl.cullFace(gl.BACK);
                render({without: this.invisibleElements}, [false]);

                gl.stencilOp(gl.KEEP, gl.KEEP, gl.DECR); // decrement on pass
                gl.cullFace(gl.FRONT);
                render({without: this.invisibleElements}, [false]);

                this.sectionPlaneValues.set(this.sectionPlaneValues2);
                const eyePlaneDist = this.lastSectionPlaneAdjustment = Math.abs(vec3.dot(this.camera.eye, this.sectionPlaneValues2) - this.sectionPlaneValues2[3]);
                this.sectionPlaneValues[3] -= 1.e-3 * eyePlaneDist;

                gl.stencilFunc(gl.EQUAL, 1, 0xff);
                gl.colorMask(true, true, true, true);
                gl.depthMask(true);
                gl.clear(gl.DEPTH_BUFFER_BIT);
                gl.disable(gl.CULL_FACE);
                this.quad2.draw();
                gl.enable(gl.CULL_FACE);

                gl.cullFace(gl.BACK);
                gl.disable(gl.STENCIL_TEST);
                gl.stencilFunc(gl.ALWAYS, 1, 0xff);
            }
        }        

        if (this.useOrderIndependentTransparency) {
        	  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
              gl.disable(gl.BLEND);
              render({without: this.invisibleElements}, [false]);

              this.oitBuffer.bind();
              gl.clearColor(0, 0, 0, 0);
              this.oitBuffer.clear();
              // @todo It should be possible to eliminate this step. It's necessary
              // to repopulate the depth-buffer with opaque elements.
              render({without: this.invisibleElements}, [false]);
              this.oitBuffer.clear(false);
              gl.enable(gl.BLEND);
              gl.blendFunc(gl.ONE, gl.ONE);
              gl.depthMask(false);
      
              render({without: this.invisibleElements}, [true]);
      
              gl.bindFramebuffer(gl.FRAMEBUFFER, null);
              gl.viewport(0, 0, this.width, this.height);
              this.quad.draw(this.oitBuffer.colorBuffer, this.oitBuffer.alphaBuffer);
        } else {
            gl.disable(gl.BLEND);
            render({without: this.invisibleElements}, [false]);
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            render({without: this.invisibleElements}, [true]);
        }

        // From now on section plane is disabled.
        this.sectionPlaneValues.set(this.sectionPlaneValuesDisabled);

        // Selection outlines require face culling to be disabled.
        gl.disable(gl.CULL_FACE);

        if (this.selectedElements.size > 0) {
            gl.enable(gl.STENCIL_TEST);
            gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
            gl.stencilFunc(gl.ALWAYS, 1, 0xff);
            gl.stencilMask(0xff);
            gl.depthMask(false);
            gl.disable(gl.DEPTH_TEST);
            gl.colorMask(false, false, false, false);
            
            render({with: this.selectedElements, pass: 'stencil'});

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

        for (var renderLayer of this.renderLayers) {
            if (renderLayer.renderTileBorders) {
                renderLayer.renderTileBorders();
            }
        }

        this.camera.unlock();

//		this.gl.bindFramebuffer(this.gl.READ_FRAMEBUFFER, this.renderFrameBuffer);
//		this.gl.bindFramebuffer(this.gl.DRAW_FRAMEBUFFER, this.colorFrameBuffer);
//		this.gl.clearBufferfv(this.gl.COLOR, 0, [0.0, 0.0, 0.0, 1.0]);
//		this.gl.blitFramebuffer(
//		    0, 0, this.width, this.height,
//		    0, 0, this.width, this.height,
//		    this.gl.COLOR_BUFFER_BIT, this.gl.NEAREST
//		);
    }

    startSectionPlane(params) {
        let p = this.pick({canvasPos: params.canvasPos, select: false});
        if (p.normal && p.coordinates) {
            this.sectionPlaneValues.set(p.normal.subarray(0,3));
            this.sectionPlaneValues[3] = -vec3.dot(p.coordinates, p.normal) - 1000.;
            this.sectionPlaneValues2.set(this.sectionPlaneValues);
            this.sectionPlaneIsDisabled = false;
            this.dirty = true;
        }
    }

    /**
     Attempts to pick an object at the given canvas coordinates.

     @param {*} params
     @param {Array} params.canvasPos Canvas coordinates
     @return {*} Information about the object that was picked, if any.
     */
    pick(params) { // Returns info on the object at the given canvas coordinates

        var canvasPos = params.canvasPos;
        if (!canvasPos) {
            throw "param expected: canvasPos";
        }

        this.sectionPlaneValues.set(this.sectionPlaneValues2);
        this.sectionPlaneValues[3] -= 1.e-3 * this.lastSectionPlaneAdjustment;        

        this.pickBuffer.bind();

        this.gl.depthMask(true);
        this.gl.clearBufferuiv(this.gl.COLOR, 0, new Uint8Array([0, 0, 0, 0]));
        
        /*
         * @todo: clearing the 2nd attachment does not work? Not a big issue as long
         * as one of the buffers is cleared to be able to detect clicks outside of the model.
         */
        // this.gl.clearBufferfv(this.gl.COLOR, 1, new Float32Array([1.]));

        this.gl.clearBufferfv(this.gl.DEPTH, this.pickBuffer.depthBuffer, new Uint8Array([1, 0])); // TODO should be a Float16Array, which does not exists, need to find the 16bits that define the number 1 here
        this.gl.enable(this.gl.DEPTH_TEST);
        this.gl.depthFunc(this.gl.LEQUAL);
        this.gl.disable(this.gl.BLEND);

        for (var transparency of [false, true]) {
        	for (var renderLayer of this.renderLayers) {
                renderLayer.render(transparency, {without: this.invisibleElements, pass: 'pick'});
        	}
        }
        
        let [x,y] = [Math.round(canvasPos[0]), Math.round(canvasPos[1])];
        var pickColor = this.pickBuffer.read(x, y);
        var pickId = pickColor[0] + pickColor[1] * 256 + pickColor[2] * 65536 + pickColor[3] * 16777216;
        var viewObject = this.pickIdToViewObject[pickId];
        let normal = this.pickBuffer.normal(x, y);

        // Don't attempt to read depth if there is no object under the cursor
        // Note that the default depth of 1. corresponds to the far plane, which
        // can be quite far away but at least is something that is recognizable
        // in most cases.
        let z = viewObject ? this.pickBuffer.depth(x,y) : 1.;
        vec3.set(tmp_unproject, x / this.width * 2 - 1, - y / this.height * 2 + 1, z);
        vec3.transformMat4(tmp_unproject, tmp_unproject, this.camera.projection.projMatrixInverted);
        vec3.transformMat4(tmp_unproject, tmp_unproject, this.camera.viewMatrixInverted);
//        console.log("Picked @", tmp_unproject[0], tmp_unproject[1], tmp_unproject[2], objectId, viewObject);

        this.pickBuffer.unbind();
        
        if (viewObject) {
        	var objectId = viewObject.objectId;
            if (params.select !== false) {
                if (!params.shiftKey) {
                    this.selectedElements.clear();
                }
                if (this.selectedElements.has(objectId)) {
                    this.selectedElements.delete(objectId);
                } else {
                    this.selectedElements.add(objectId);
                }
            }
            return {object: viewObject, normal: normal, coordinates: tmp_unproject};
        } else if (params.select !== false) {
            this.selectedElements.clear();
        }

        return {object: null, coordinates: tmp_unproject};
    }

    getPickColor(objectId) { // Converts an integer to a pick color
    	var viewObject = this.viewObjects.get(objectId);
    	if (viewObject == null) {
    		console.error("No viewObject found for " + objectId);
    	}
    	var pickId = viewObject.pickId;
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
    
    getViewObject(objectId) {
    	return this.viewObjects.get(objectId);
    }
    
    addViewObject(objectId, viewObject) {
    	viewObject.pickId = this.pickIdCounter++;
    	this.viewObjects.set(objectId, viewObject);
        this.pickIdToViewObject[viewObject.pickId] = viewObject;

        let byType = this.viewObjectsByType.get(viewObject.type) || [];
        byType.push(viewObject);
        this.viewObjectsByType.set(viewObject.type, byType);
    }

    viewFit(ids) {
        let aabb = ids.map(this.viewObjects.get.bind(this.viewObjects))
            .map((o) => o.aabb)
            .reduce(Utils.unionAabb, Utils.emptyAabb());
        this.camera.viewFit(aabb);
        this.dirty = true;
    }

    resetCamera() {
        this.cameraSet = false;
        this.dirty = true;
    }

    resetColors() {
        this.resetColor(
            Array.from(this.hiddenDueToSetColor.keys()).concat(
                Array.from(this.originalColors.keys())
            ).concat(
                Array.from(this.instancesWithChangedColor.keys())
            )
        );
        this.dirty = true;
    }

    resetVisibility() {
        this.setVisibility(this.invisibleElements.keys(), true);
        this.dirty = true;
    }
}