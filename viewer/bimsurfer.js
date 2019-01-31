import {BimServerViewer} from "./bimserverviewer.js"
import {EventHandler} from "./eventhandler.js";
// @todo why?
import {BimServerClient} from "http://localhost:8080/apps/bimserverjavascriptapi/bimserverclient.js"
import {Stats} from "./stats.js"

/**
 * Entry point for the public BimSurfer API.
 *
 * @export
 * @class BimSurfer
 * @extends {EventHandler}
 */
export class BimSurfer extends EventHandler {
    constructor() {
        super();

        this._api = null;
    }

    /**
	 * Loads project meta-data} from a BIMserver and searches for the
	 * specified revision id.
	 * 
	 * @private
	 * @param {Number} roid Revision id to load
	 * @return
	 * @memberof BimSurfer
	 */
	loadProjects(roid) {
		return new Promise((resolve, reject) => {
			this._api.call("ServiceInterface", "getAllProjects", {
				onlyTopLevel: false,
				onlyActive: true
			}, (projects) => {
				let found = false;
				for (var p of projects) {
					if (p.revisions.indexOf(roid) !== -1) {
						resolve(p);
						found = true;
						break;
					}
				}
				if (!found) {
					reject("Revision id not found");
				}		
			});
		});
    }
    
    /**
	 * @private
	 * @param {Object} project Project meta-data object
	 * @param {HTMLElement} domNode The parent HTMLElement in which to create a CANVAS for WebGL rendering
	 * @return
	 * @memberof BimSurfer
	 */
	loadModel(project, domNode) {
		var stats = new Stats();		
		stats.setParameter("Models", "Name", project.name);
		
		this._bimServerViewer = new BimServerViewer(this._api, {viewerBasePath:"../"}, domNode, null, null, stats);
		
		this._bimServerViewer.setProgressListener((percentage) => {
			console.log(percentage + "% loaded")
		});

		return this._bimServerViewer.loadModel(project);
	}

    /**
	 * Loads a BIMserver project into the specified domNode for rendering.
	 * 
	 * @param {{username: String, password: String, roid: Number, domNode: HTMLElement}} params Function arguments
	 * @return {Promise}
	 * @memberof BimSurfer
	 */
	load(params) {
		return new Promise((resolve, reject) => {
			this._api = new BimServerClient(params.bimserver);
			this._api.init(() => {
				this._api.login(params.username, params.password, () => {
					this.loadProjects(params.roid).then((project)=>{                
						this.loadModel(project, params.domNode).then(resolve).catch(reject);
					}).catch(reject);
				});
			});
		});
	}
	
	/**
	 * Sets the visibility for the specified elements
	 *
	 * @param {{ids: Number[], visible: Boolean}} params Function arguments
	 * @memberof BimSurfer
	 */
	setVisibility(params) {
		let v = this._bimServerViewer.viewer;
		if (params.ids) {
			v.setVisibility(params.ids, params.visible);
		} else if (params.types) {
			v.callByType(v.setVisibility, params.types, params.visible);
		}
	}

	/**
	 * Sets the selection state for the specified elements
	 *
	 * @param {{ids: Number[], selected: Boolean, clear: ?Boolean}} params Function arguments
	 * @memberof BimSurfer
	 */
	setSelectionState(params) {
		let v = this._bimServerViewer.viewer;
		v.setSelectionState(params.ids, params.selected, params.clear);
	}

	/**
	 * Gets the currently selected elements
	 *
	 * @return {Number[]} Identifiers of selected elements
	 * @memberof BimSurfer
	 */
	getSelected() {
		let v = this._bimServerViewer.viewer;
		return v.getSelected();
	}

	/**
	 * Sets the color for the specified elements
	 *
	 * @param {{ids: Number[], color:{r:Number, g:Number, b:Number, a:Number}}} params
	 * @memberof BimSurfer
	 */
	setColor(params) {
		let v = this._bimServerViewer.viewer;
		let clr = Array.from("rgba").map((x) => {
			let v = params.color[x];
			return typeof(v) === "undefined" ? 1. : v;
		});
		v.setColor(params.ids, clr);
	}

	/**
	 * Zooms the current camera in or out the fit the specified elements in the viewport
	 *
	 * @param {{ids: Number[]}} params
	 * @memberof BimSurfer
	 */
	viewFit(params) {
		let v = this._bimServerViewer.viewer;
		v.viewFit(params.ids);
	}

	/**
	 * Gets a javascript representation of the current camera orientation
	 *
	 * @return {{type: String, eye: Float32Array, target: Float32Array, up: Float32Array, fovy: ?Number}} Camera parameters
	 * @memberof BimSurfer
	 */
	getCamera() {
		let v = this._bimServerViewer.viewer;
		let projectionType = v.camera.projectionType;
		let json = {
			type: projectionType,
			eye: v.camera._eye.slice(0),
			target: v.camera._target.slice(0),
			up: v.camera._up.slice(0)
		}
		if (projectionType === "persp") {
			json.fovy = v.camera.projection.fov;
		}
		return json;
	}

	/**
	 * Sets the current camera orientation based on specified parameters
	 *
	 * @param {{type: String, eye: Float32Array, target: Float32Array, up: Float32Array, fovy: ?Number}} params Camera parameters
	 * @memberof BimSurfer
	 */
	setCamera(params) {
		let v = this._bimServerViewer.viewer;
		v.camera.restore(params);
	}

	/**
	 * Resets part of the viewer to its default state.
	 *
	 * @param {{cameraPosition: ?Boolean, colors: ?Boolean, visibility: ?Boolean}} params Parts of the viewer state to reset
	 * @memberof BimSurfer
	 */
	reset(params) {
		let v = this._bimServerViewer.viewer;
		if (params.cameraPosition) {
			v.resetCamera();
		}
		if (params.colors) {
			v.resetColors();
		}
		if (params.visibility) {
			v.resetVisibility();
		}
	}
}