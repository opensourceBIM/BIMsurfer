import * as mat4 from "./glmatrix/mat4.js";
import * as vec2 from "./glmatrix/vec2.js";
import * as vec3 from "./glmatrix/vec3.js";
import * as vec4 from "./glmatrix/vec4.js";

import {ProgramManager} from "./programmanager.js";
import {Lighting} from "./lighting.js";
import {BufferSetPool} from "./buffersetpool.js";
import {Camera} from "./camera.js";
import {CameraControl} from "./cameracontrol.js";
import {RenderBuffer} from "./renderbuffer.js";
import {SvgOverlay} from "./svgoverlay.js";
import {FrozenBufferSet} from "./frozenbufferset.js";
import {Utils} from "./utils.js";
import {SSQuad} from "./ssquad.js";
import {FreezableSet} from "./freezableset.js";
import {DefaultColors} from "./defaultcolors.js";
import {AvlTree} from "./collections/avltree.js";

import {COLOR_FLOAT_DEPTH_NORMAL, COLOR_ALPHA_DEPTH} from './renderbuffer.js';
import { WSQuad } from './wsquad.js';
import {EventHandler} from "./eventhandler.js";


// When a change in color results in a different
// transparency state, the objects needs to be hidden
//} from the original buffer and recreate in a new buffer
// to be rendered during the correct render pass. This
// recreated object will have it's most significant bit
// set to 1.
const OVERRIDE_FLAG = (1 << 30);

/**
 * The idea is that this class doesn't know anything about BIMserver, and can possibly be reused in classes other than BimServerViewer
 * 
 *
 * Main viewer class, too many responsibilities:
 * - Keep track of width/height of viewport
 * - Keeps track of dirty scene
 * - Contains the basic render loop (and delegates to the render layers)
 *
 * @export
 * @class Viewer
 */

const X = vec3.fromValues(1., 0., 0.);
const Y = vec3.fromValues(0., 1., 0.);
const Z = vec3.fromValues(0., 0., 1.);

export class Viewer {

    constructor(canvas, settings, stats, width, height) {
        this.width = width;
        this.height = height;

        this.defaultColors = settings.defaultColors ? settings.defaultColors : DefaultColors;
        
        this.stats = stats;
        this.settings = settings;
        this.canvas = canvas;
        this.camera = new Camera(this);
        if (settings.useOverlay) {
        	this.overlay = new SvgOverlay(this.canvas, this.camera);
        }
        
        this.gl = this.canvas.getContext('webgl2', {stencil: true, premultipliedAlpha: false, preserveDrawingBuffer: true});

        if (!this.gl) {
            alert('Unable to initialize WebGL. Your browser or machine may not support it.');
            return;
        }

        if (!this.settings.loaderSettings.prepareBuffers || (this.settings.tilingLayerEnabled && this.settings.loaderSettings.tilingLayerReuse)) {
        	this.bufferSetPool = new BufferSetPool(1000, this.stats);
        }

        this.tmp_unproject = vec3.create();

        this.tmp_sectionU = vec3.create();
        this.tmp_sectionV = vec3.create();

        this.tmp_sectionA = vec3.create();
        this.tmp_sectionB = vec3.create();
        this.tmp_sectionC = vec3.create();
        this.tmp_sectionD = vec3.create();

        this.tmp_section_dir_2d = vec4.create();
        
        this.pickIdCounter = 1;

        this.sectionPlaneIsDisabled = true;

        this.sectionPlaneValuesDisabled = new Float32Array(4);
        this.sectionPlaneValuesDisabled.set([0,0,0,1]);

        this.sectionPlaneValues = new Float32Array(4);
        this.sectionPlaneValues2 = new Float32Array(4);
        
        this.sectionPlaneValues.set(this.sectionPlaneValuesDisabled);
        // this.sectionPlaneValues.set([0,1,1,-5000]);
        this.sectionPlaneValues2.set(this.sectionPlaneValues);

        // A SVG canvas overlay polygon to indicate section plane positioning
        this.sectionplanePoly = null;

        // Picking ID (unsigned int) -> ViewObject
        // This is an array now since the picking ids form a continues array
        this.pickIdToViewObject = [];
        
        this.renderLayers = new Set();
        this.animationListeners = [];
        this.colorRestore = [];
        
        // User can override this, default assumes strings to be used as unique object identifiers
        if (this.settings.loaderSettings.useUuidAndRid) {
        	const collator = new Intl.Collator();
        	// TODO there is really no need to use a locale-aware comparator here, but somehow > or < does not seem to work, where it work should for string
        	this.uniqueIdCompareFunction = (a, b) => {
//        		return a == b ? 0 : (a > b ? 1 : -1);
        		return collator.compare(a, b);
            };
            this.idAugmentationFunction = (id) => ("O" + id);
        } else {
        	this.uniqueIdCompareFunction = (a, b) => {
        		return a - b;
            };
            this.idAugmentationFunction = (id) => (id | OVERRIDE_FLAG);
        }
        
        /* Next function serves two purposes:
         *	- We invert the uniqueIdCompareFunction because for some reason AvlTree sort is descending
         *  - We convert the returned number to a fixed -1, 0 or 1, also because AvlTree does not handle any other numbers
         */
        this.inverseUniqueIdCompareFunction = (a, b) => {
        	let inverse = this.uniqueIdCompareFunction(b, a);
        	return inverse < 0 ? -1 : (inverse > 0 ? 1 : 0);
        };
        
        this.uniqueIdToBufferSet = new AvlTree(this.inverseUniqueIdCompareFunction);

        // Object ID -> ViewObject
        this.viewObjects = new Map();

        // String -> ViewObject[]
        this.viewObjectsByType = new Map();

        // Null means everything visible, otherwise Set(..., ..., ...)
        this.invisibleElements = new FreezableSet(this.uniqueIdCompareFunction);

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

        this.selectedElements = new FreezableSet(this.uniqueIdCompareFunction);

        this.useOrderIndependentTransparency = this.settings.realtimeSettings.orderIndependentTransparency;

        // 0 -> Not dirty, 1 -> Kinda dirty, but rate-limit the repaints to 2/sec, 2 -> Really dirty, repaint ASAP
        this.dirty = 0; 
        this.lastRepaint = 0;
        
//        window._debugViewer = this;  // HACK for console debugging

        this.eventHandler = new EventHandler();
        
        if ("OffscreenCanvas" in window && canvas instanceof OffscreenCanvas) {
        } else {
        	// Tabindex required to be able add a keypress listener to canvas
        	canvas.setAttribute("tabindex", "0");
        	canvas.addEventListener("keypress", (evt) => {
        		if (evt.key === 'H') {
        			this.resetVisibility();
        		} else if (evt.key === 'h') {
        			this.setVisibility(this.selectedElements, false, false);
        			this.selectedElements.clear();
        		} else if (evt.key === 'C') {
        			this.resetColors();
        		} else if (evt.key === 'c' || evt.key === 'd') {
        			let R = Math.random;
        			let clr = [R(), R(), R(), evt.key === 'd' ? R() : 1.0];
        			this.setColor(new Set(this.selectedElements), clr);
//        			this.selectedElements.clear();
        		} else {
        			// Don't do a drawScene for every key pressed
        			return;
        		}
//            this.drawScene();
        	});
        }
    }

    callByType(method, types, ...args) {
        let elems = types.map((i) => this.viewObjectsByType.get(i) || [])
            .reduce((a, b) => a.concat(b), [])
            .map((o) => o.oid);
        // Assuming all passed methods return a promise
        return method.call(this, elems, ...args);
    }

    setVisibility(elems, visible, sort=true) {
        elems = Array.from(elems);
        // @todo. until is properly asserted, documented somewhere, it's probably best to explicitly sort() for now.
        elems.sort(this.uniqueIdCompareFunction);

        let fn = (visible ? this.invisibleElements.delete : this.invisibleElements.add).bind(this.invisibleElements);
        let fn2 = this.idAugmentationFunction;
        return this.invisibleElements.batch(() => {
            elems.forEach((i) => {
                fn(i);
                // Show/hide transparently-adjusted counterpart (even though it might not exist)
                fn(fn2(i));
            });

            // Make sure elements hidden due to setColor() stay hidden
            for (let i of this.hiddenDueToSetColor.keys()) {
                this.invisibleElements.add(i);
            };

            this.dirty = 2;
            
            this.eventHandler.fire("visbility_changed", elems, visible);
            
            return Promise.resolve();
        });
    }

    setSelectionState(elems, selected, clear) {
        return this.selectedElements.batch(() => {
            if (clear) {
                this.selectedElements.clear();
            }

            let fn = (selected ? this.selectedElements.add : this.selectedElements.delete).bind(this.selectedElements);
            for (let e of elems) {
                fn(e);
            }
            
            this.dirty = 2;

            return Promise.resolve();
        }).then(() => {
        	this.eventHandler.fire("selection_state_changed", elems, selected);
        });
    }

    getSelected() {
        return Array.from(this.selectedElements)
            .map(this.viewObjects.get.bind(this.viewObjects));
    }

    resetColor(elems) {
    	return this.invisibleElements.batch(() => {
			var bufferSetsToUpdate = this.generateBufferSetToOidsMap(elems);
    		return this.resetColorAlreadyBatched(elems, bufferSetsToUpdate);
		});
    }

    resetColorAlreadyBatched(elems, bufferSetsToUpdate) {
    	for (let [bufferSetId, bufferSetObject] of bufferSetsToUpdate) {
    		var bufferSet = bufferSetObject.bufferSet;
			let id_ranges = bufferSet.getIdRanges(elems);
			let bounds = bufferSet.getBounds(id_ranges);
    		bufferSet.batchGpuRead(this.gl, ["positionBuffer", "normalBuffer", "colorBuffer", "pickColorBuffer"], bounds, () => {
	    		for (let uniqueId of bufferSetObject.oids) {
	    			if (this.hiddenDueToSetColor.has(uniqueId)) {
	    				this.invisibleElements.delete(uniqueId);
	    				let buffer = this.hiddenDueToSetColor.get(uniqueId);
	    				buffer.manager.deleteBuffer(buffer);
	    				
	    				this.hiddenDueToSetColor.delete(uniqueId);
	    			} else if (this.originalColors.has(uniqueId)) {
	    				this.uniqueIdToBufferSet.get(uniqueId).forEach((bufferSet) => {
							const originalColor = this.originalColors.get(uniqueId);
							bufferSet.setColor(this.gl, uniqueId, originalColor);
	    				});
	    				
	    				this.originalColors.delete(uniqueId);
	    			} else if (this.instancesWithChangedColor.has(uniqueId)) {
	    				let entry = this.instancesWithChangedColor.get(uniqueId);
	    				entry.override.manager.deleteBuffer(entry.override);
	    				entry.original.setObjects(this.gl, entry.original.objects.concat([entry.object]));
	    				this.instancesWithChangedColor.delete(uniqueId);
	    			}
	    		}
    		});
    	}
		this.dirty = 2;
		return Promise.resolve();
    }
    
    /**
     * This will create a mapping from BufferSetId -> {bufferSet, oids[]}
     * This is useful when we want to do batch updates of BufferSets, instead of randomly updating single objects in BufferSets
     * The order already in elems will stay intact
     */
    generateBufferSetToOidsMap(elems) {
		var bufferSetsToUpdate = new Map();
		for (let uniqueId of elems) {
			const bufferSets = this.uniqueIdToBufferSet.get(uniqueId);
			if (bufferSets == null) {
				continue;
			}
			var bufferSetObject = bufferSetsToUpdate.get(bufferSets[0].id);
			if (bufferSetObject == null) {
				bufferSetObject = {
					oids: [],
					bufferSet: bufferSets[0]
				};
				bufferSetsToUpdate.set(bufferSets[0].id, bufferSetObject);
			}
			bufferSetObject.oids.push(uniqueId);
		}
		return bufferSetsToUpdate;
    }
    
    setColor(elems, clr) {
        let aug = this.idAugmentationFunction;
		let promise = this.invisibleElements.batch(() => {
			var bufferSetsToUpdate = this.generateBufferSetToOidsMap(elems);
			// Reset colors first to clear any potential transparency overrides.
			return this.resetColorAlreadyBatched(elems, bufferSetsToUpdate).then(() => {
				for (let [bufferSetId, bufferSetObject] of bufferSetsToUpdate) {
					var bufferSet = bufferSetObject.bufferSet;
					var oids = bufferSetObject.oids;

					let id_ranges = bufferSet.getIdRanges(oids);
					let bounds = bufferSet.getBounds(id_ranges);
					
					bufferSet.batchGpuRead(this.gl, ["positionBuffer", "normalBuffer", "colorBuffer", "pickColorBuffer"], bounds, () => {
						for (const uniqueId of oids) {
							let originalColor = bufferSet.setColor(this.gl, uniqueId, clr);
							if (originalColor === false) {
								let copiedBufferSet = bufferSet.copy(this.gl, uniqueId);
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
								
								if (bufferSet.node) {
									copiedBufferSet.node = bufferSet.node;
								}
								
								let buffer;
								
								if (copiedBufferSet instanceof FrozenBufferSet) {
									var programInfo = this.programManager.getProgram(this.programManager.createKey(true, false));
									var pickProgramInfo = this.programManager.getProgram(this.programManager.createKey(true, true));
									var lineProgramInfo = this.programManager.getProgram(this.programManager.createKey(true, false, true));
									
									copiedBufferSet.colorBuffer = Utils.createBuffer(this.gl, newClrBuffer, null, null, 4);
									
									let obj = bufferSet.objects.find(o => o.uniqueId === uniqueId);
									bufferSet.setObjects(this.gl, bufferSet.objects.filter(o => o.uniqueId !== uniqueId));
									copiedBufferSet.setObjects(this.gl, [obj]);
									
									copiedBufferSet.buildVao(this.gl, this.settings, programInfo, pickProgramInfo, lineProgramInfo);
									copiedBufferSet.manager.pushBuffer(copiedBufferSet);
									buffer = copiedBufferSet;
									
									// NB: Single bufferset entry is assumed here, which is the case for now.
									this.uniqueIdToBufferSet.get(uniqueId)[0] = buffer;
									
									this.instancesWithChangedColor.set(uniqueId, {
										object: obj,
										original: bufferSet, 
										override: copiedBufferSet
									});
								} else {
									buffer = bufferSet.owner.flushBuffer(copiedBufferSet, false);
									
									// Note that this is an attribute on the bufferSet, but is
									// not applied to the actual webgl vertex data.
									buffer.uniqueId = aug(uniqueId);
									
									this.invisibleElements.add(uniqueId);
									this.hiddenDueToSetColor.set(uniqueId, buffer);
								}                    
							} else {
								this.originalColors.set(uniqueId, originalColor);
							}
						}
					});
				}
				this.dirty = 2;
				this.eventHandler.fire("color_changed", elems, clr);
			});
		});
		return promise;
    }

    init() {
        var promise = new Promise((resolve, reject) => {
            this.dirty = 2;
            this.then = 0;
            if (this.settings.autoRender) {
            	this.running = true;
            }
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
                resolve();
                if (this.running) {
                	requestAnimationFrame((now) => {
                		this.render(now);
                	});
                }
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
        const seconds = now * 0.001;
        const deltaTime = seconds - this.then;
        this.then = seconds;

        this.fps++;

        var wasDirty = this.dirty;
        if (this.dirty == 2 || (this.dirty == 1 && now - this.lastRepaint > 500)) {
        	let reason = this.dirty;
            this.dirty = 0;
            this.drawScene(reason, {without: this.invisibleElements});
            this.lastRepaint = now;
        }

        if (seconds - this.timeLast >= 1) {
            if (wasDirty != 0) {
                this.stats.setParameter("Rendering", "FPS", Number(this.fps / (seconds - this.timeLast)).toPrecision(5));
            } else {
                this.stats.setParameter("Rendering", "FPS", "Off");
            }
            this.timeLast = seconds;
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

    internalRender(elems, t) {
        for (var transparency of (t || [false, true])) {
            for (var renderLayer of this.renderLayers) {
                renderLayer.render(transparency, false, elems);
            }
    		if (this.settings.realtimeSettings.drawLineRenders) {
                for (var renderLayer of this.renderLayers) {
                    renderLayer.render(transparency, true, elems);
                }
    		}
        }
    }
    
    drawScene(reason, what = {without: this.invisibleElements}) {
        // Locks the camera so that intermittent mouse events will not
        // change the matrices until the camera is unlocked again.
        // @todo This might need some work to make sure events are
        // processed timely and smoothly.
        this.camera.lock();

        let gl = this.gl;

        gl.depthMask(true);
        gl.disable(gl.STENCIL_TEST);
        gl.clearColor(1, 1, 1, 0);
        gl.clearDepth(1);
        gl.clearStencil(0);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        
        gl.viewport(0, 0, this.width, this.height);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
        gl.disable(gl.CULL_FACE);

        this.sectionPlaneValues.set(this.sectionPlaneValues2);

        for (var renderLayer of this.renderLayers) {
            renderLayer.prepareRender(reason);
            renderLayer.renderLines();            
        }

        gl.enable(gl.CULL_FACE);

        if (this.modelBounds) {
            if (!this.cameraSet && this.settings.resetToDefaultViewOnLoad) { // HACK to look at model origin as soon as available
            	this.resetToDefaultView();
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
                this.internalRender(what, [false]);

                gl.stencilOp(gl.KEEP, gl.KEEP, gl.DECR); // decrement on pass
                gl.cullFace(gl.FRONT);
                this.internalRender(what, [false]);

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
              this.internalRender(what, [false]);

              this.oitBuffer.bind();
              gl.clearColor(0, 0, 0, 0);
              this.oitBuffer.clear();
              // @todo It should be possible to eliminate this step. It's necessary
              // to repopulate the depth-buffer with opaque elements.
              this.internalRender(what, [false]);
              this.oitBuffer.clear(false);
              gl.enable(gl.BLEND);
              gl.blendFunc(gl.ONE, gl.ONE);
              gl.depthMask(false);
      
              this.internalRender(what, [true]);
      
              gl.bindFramebuffer(gl.FRAMEBUFFER, null);
              gl.viewport(0, 0, this.width, this.height);
              this.quad.draw(this.oitBuffer.colorBuffer, this.oitBuffer.alphaBuffer);
        } else {
            gl.disable(gl.BLEND);
            this.internalRender(what, [false]);
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            this.internalRender(what, [true]);
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
            
            this.internalRender({with: this.selectedElements, pass: 'stencil'});

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
    
    resetToDefaultView(modelBounds=this.modelBounds) {
        this.camera.target = [0, 0, 0];
        this.camera.eye = [0, 1, 0];
        this.camera.up = [0, 0, 1];
        this.camera.worldAxis = [ // Set the +Z axis as World "up"
            1, 0, 0, // Right
            0, 0, 1, // Up
            0, -1, 0  // Forward
        ];
        this.camera.viewFit(modelBounds); // Position camera so that entire model bounds are in view
        this.cameraSet = true;
        this.camera.forceBuild();
    }

    removeSectionPlaneWidget() {
        if (this.sectionplanePoly) {
            this.sectionplanePoly.destroy();
            this.sectionplanePoly = null;
        }
    }

    positionSectionPlaneWidget(params) {
        let p = this.pick({canvasPos: params.canvasPos, select: false});
        if (p.normal && p.coordinates) {
            let ref = null;
            if (Math.abs(vec3.dot(p.normal, Z)) < 0.9) {
                ref = Z;
            } else {
                ref = X;
            }
            vec3.cross(this.tmp_sectionU, p.normal, ref);
            vec3.cross(this.tmp_sectionV, p.normal, this.tmp_sectionU);
            vec3.scale(this.tmp_sectionU, this.tmp_sectionU, 500.);
            vec3.scale(this.tmp_sectionV, this.tmp_sectionV, 500.);

            // ---
            
            vec3.add(this.tmp_sectionA, this.tmp_sectionU, p.coordinates);
            vec3.add(this.tmp_sectionB, this.tmp_sectionU, p.coordinates);

            vec3.negate(this.tmp_sectionU, this.tmp_sectionU);

            vec3.add(this.tmp_sectionC, this.tmp_sectionU, p.coordinates);
            vec3.add(this.tmp_sectionD, this.tmp_sectionU, p.coordinates);

            // ---

            vec3.add(this.tmp_sectionA, this.tmp_sectionV, this.tmp_sectionA);
            vec3.add(this.tmp_sectionC, this.tmp_sectionV, this.tmp_sectionC);

            vec3.negate(this.tmp_sectionV, this.tmp_sectionV);

            vec3.add(this.tmp_sectionB, this.tmp_sectionV, this.tmp_sectionB);
            vec3.add(this.tmp_sectionD, this.tmp_sectionV, this.tmp_sectionD);

            // ---

            let ps = [this.tmp_sectionA, this.tmp_sectionB, this.tmp_sectionD, this.tmp_sectionC, this.tmp_sectionA];
            if (this.sectionplanePoly) {
                this.sectionplanePoly.points = ps;
            } else {
                this.sectionplanePoly = this.overlay.createWorldSpacePolyline(ps);
            }
        }
    }
    
    enableSectionPlane(params) {
        let p = this.pick({canvasPos: params.canvasPos, select: false});
        if (p.normal && p.coordinates && p.depth) {
            this.sectionPlaneValues.set(p.normal.subarray(0,3));
            this.initialSectionPlaneD = this.sectionPlaneValues[3] = vec3.dot(p.coordinates, p.normal);
            this.sectionPlaneValues2.set(this.sectionPlaneValues);
            this.sectionPlaneIsDisabled = false;
            this.sectionPlaneDepth = p.depth;
            let cp = [params.canvasPos[0] / this.width, - params.canvasPos[1] / this.height];
            this.sectionPlaneDownAt = cp;
            this.dirty = 2;
            return true;
        }
        return false;
    }

    disableSectionPlane() {
        this.sectionPlaneValues.set(this.sectionPlaneValuesDisabled);
        this.sectionPlaneValues2.set(this.sectionPlaneValuesDisabled);
        this.sectionPlaneIsDisabled = true;
        this.dirty = 2;
    }

    moveSectionPlane(params) {
        this.tmp_section_dir_2d.set(this.sectionPlaneValues2);
        this.tmp_section_dir_2d[3] = 0.;
        vec4.transformMat4(this.tmp_section_dir_2d, this.tmp_section_dir_2d, this.camera.viewProjMatrix);
        let cp = [params.canvasPos[0] / this.width, - params.canvasPos[1] / this.height];        
        vec2.subtract(this.tmp_section_dir_2d.subarray(2), cp, this.sectionPlaneDownAt);
        this.tmp_section_dir_2d[1] /= this.width / this.height;
        let d = vec2.dot(this.tmp_section_dir_2d, this.tmp_section_dir_2d.subarray(2)) * this.sectionPlaneDepth;
        this.sectionPlaneValues2[3] = this.initialSectionPlaneD + d;
        this.dirty = 2;
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
        if (!this.sectionPlaneIsDisabled) {
            // tfk: I forgot what this is.
            this.sectionPlaneValues[3] -= 1.e-3 * this.lastSectionPlaneAdjustment;        
        }

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
                renderLayer.render(transparency, false, {without: this.invisibleElements, pass: 'pick'});
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

        // tfk: I don't know why the pB.d is in [0,1] and needs to be mapped back
        // to [-1, 1] for multiplication with the inverse projMat.
        let z = viewObject ? (this.pickBuffer.depth(x,y) * 2. - 1.) : 1.;
        vec3.set(this.tmp_unproject, x / this.width * 2 - 1, - y / this.height * 2 + 1, z);
        vec3.transformMat4(this.tmp_unproject, this.tmp_unproject, this.camera.projection.projMatrixInverted);
        let depth = -this.tmp_unproject[2];
        vec3.transformMat4(this.tmp_unproject, this.tmp_unproject, this.camera.viewMatrixInverted);
//        console.log("Picked @", this.tmp_unproject[0], this.tmp_unproject[1], this.tmp_unproject[2], uniqueId, viewObject);

        this.pickBuffer.unbind();
        
        if (viewObject) {
        	var uniqueId = viewObject.uniqueId;
            if (params.select !== false) {
                if (!params.shiftKey) {
                	if (this.selectedElements.size > 0) {
                		this.eventHandler.fire("selection_state_changed", this.selectedElements, false);
                		this.selectedElements.clear();
                	}
                }
                if (this.selectedElements.has(uniqueId)) {
                    this.selectedElements.delete(uniqueId);
                    this.eventHandler.fire("selection_state_changed", [uniqueId], false);
                } else {
                    this.addToSelection(uniqueId);
                    this.eventHandler.fire("selection_state_changed", [uniqueId], true);
                }
            }
            return {object: viewObject, normal: normal, coordinates: this.tmp_unproject, depth: depth};
        } else if (params.select !== false) {
        	if (this.selectedElements.size > 0) {
        		this.eventHandler.fire("selection_state_changed", this.selectedElements, false);
        		this.selectedElements.clear();
        	}
        }

        return {object: null, coordinates: this.tmp_unproject, depth: depth};
    }

    addToSelection(uniqueId) {
    	this.selectedElements.add(uniqueId);
    	let bufferSets = this.uniqueIdToBufferSet.get(uniqueId);
    	for (var bufferSet of bufferSets) {
    		bufferSet.generateLines(uniqueId, this.gl);
    	}
    }
    
    getPickColorForPickId(pickId) {
    	var pickColor = new Uint8Array([pickId & 0x000000FF, (pickId & 0x0000FF00) >> 8, (pickId & 0x00FF0000) >> 16, (pickId & 0xFF000000) > 24]);
        return pickColor;
    }
    
    getPickColor(uniqueId) { // Converts an integer to a pick color
    	var viewObject = this.viewObjects.get(uniqueId);
    	if (viewObject == null) {
    		console.error("No viewObject found for " + uniqueId);
    	}
    	var pickId = viewObject.pickId;
    	return this.getPickColorForPickId(pickId);
    }

    setModelBounds(modelBounds) {
    	if (this.modelBounds != null) {
    		// "Merge"
    		this.modelBounds[0] = Math.min(this.modelBounds[0], modelBounds[0]);
    		this.modelBounds[1] = Math.min(this.modelBounds[1], modelBounds[1]);
    		this.modelBounds[2] = Math.min(this.modelBounds[2], modelBounds[2]);
    		this.modelBounds[3] = Math.max(this.modelBounds[3], modelBounds[3]);
    		this.modelBounds[4] = Math.max(this.modelBounds[4], modelBounds[4]);
    		this.modelBounds[5] = Math.max(this.modelBounds[5], modelBounds[5]);
    	} else {
    		this.modelBounds = modelBounds;
    	}
        this.camera.setModelBounds(this.modelBounds);
        this.updateViewport();
    }

    updateViewport() {
        this.dirty = 2;
    }

    loadingDone() {
        this.dirty = 2;
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
    
    getViewObject(uniqueId) {
    	return this.viewObjects.get(uniqueId);
    }
    
    addViewObject(uniqueId, viewObject) {
    	viewObject.pickId = this.pickIdCounter++;
    	this.viewObjects.set(uniqueId, viewObject);
        this.pickIdToViewObject[viewObject.pickId] = viewObject;

        let byType = this.viewObjectsByType.get(viewObject.type) || [];
        byType.push(viewObject);
        this.viewObjectsByType.set(viewObject.type, byType);
    }

    viewFit(ids) {
    	return new Promise((resolve, reject) => {
    		let aabb = ids.map(this.viewObjects.get.bind(this.viewObjects))
    		.filter((o) => o != null && o.globalizedAabb != null)
    		.map((o) => o.globalizedAabb)
            .reduce(Utils.unionAabb, Utils.emptyAabb());
            if (Utils.isEmptyAabb(aabb)) {
                console.error("No AABB for objects", ids);
                reject();
            } else {
                this.camera.viewFit(aabb);
                this.dirty = 2;
                resolve();
            }
    	});
    }

    resetCamera() {
        this.cameraSet = false;
        this.dirty = 2;
    }

	screenshot(callback) {
		if (this.canvas instanceof OffscreenCanvas) {
			if (this.canvas.convertToBlob) {
				return this.canvas.convertToBlob();
			} else if (this.canvas.toBlob) {
				// Firefox
				return this.canvas.toBlob();
			}
		} else {
			return new Promise((resolve, reject) => {
				return this.canvas.toBlob(resolve);
			});
		}
	}
    
    resetColors() {
        return this.resetColor(
            Array.from(this.hiddenDueToSetColor.keys()).concat(
                Array.from(this.originalColors.keys())
            ).concat(
                Array.from(this.instancesWithChangedColor.keys())
            )
        );
    }

    resetVisibility() {
        this.setVisibility(this.invisibleElements.keys(), true, false);
        this.dirty = 2;
    }
	
    addSelectionListener(listener) {
       this.eventHandler.on("selection_state_changed", listener.handler);
    }
}
