import BimServerViewer from "./bimserverviewer.js"
import EventHandler from "./eventhandler.js";
// @todo why?
import BimServerClient from "http://localhost:8080/apps/bimserverjavascriptapi/bimserverclient.js"
import Stats from "./stats.js"

export default class BimSurfer extends EventHandler {
    constructor() {
        super();

        this.api = null;
        this.poidToProject = new Map();
    }

    loadProjects() {
		return new Promise((resolve, reject) => {
			this.api.call("ServiceInterface", "getAllProjects", {
				onlyTopLevel: false,
				onlyActive: true
			}, (projects) => {
				for (var p of projects) {
					this.poidToProject.set(p.oid, p);
					p.subProjects = [];
				}
				for (var p of projects) {
					if (p.parentId != -1) {
						this.poidToProject.get(p.parentId).subProjects.push(p);
					}
				}
				for (var p of projects) {
					if (p.parentId == -1) {
						this.addProject(p);
					}
				}
				resolve();
			});
		});
    }

    addProject(project) {
		if (project.lastRevisionId == -1) {
			return;
		}
        
        if (project.revisions.indexOf(this.roid) !== -1) {
            this.project = project;
        }
    }
    
    loadModel(domNode) {
		var stats = new Stats();		
		stats.setParameter("Models", "Name", this.project.name);
		
		this.bimServerViewer = new BimServerViewer(this.api, {viewerBasePath:"../"}, domNode, null, null, this.stats);
		
		this.bimServerViewer.setProgressListener((percentage) => {
			console.log(percentage + "% loaded")
		});

		return this.bimServerViewer.loadModel(this.project);
	}

    load(params) {
		return new Promise((resolve, reject) => {
			this.roid = params.roid;

			this.api = new BimServerClient(params.bimserver);
			this.api.init(() => {
				this.api.login(params.username, params.password, () => {
					this.loadProjects().then(()=>{                
						this.loadModel(params.domNode).then(resolve);
					});
				});
			});
		});
	}
	
	setVisibility(params) {
		let v = this.bimServerViewer.viewer;
		if (params.ids) {
			v.setVisibility(params.ids, params.visible);
		} else if (params.types) {
			v.callByType(v.setVisibility, params.types, params.visible);
		}
	}

	setSelectionState(params) {
		let v = this.bimServerViewer.viewer;
		v.setSelectionState(params.ids, params.selected, params.clear);
	}

	getSelected() {
		let v = this.bimServerViewer.viewer;
		return v.getSelected();
	}

	setColor(params) {
		let v = this.bimServerViewer.viewer;
		let clr = Array.from("rgba").map((x) => {
			let v = params.color[x];
			return typeof(v) === "undefined" ? 1. : v;
		});
		v.setColor(params.ids, clr);
	}

	viewFit(params) {
		let v = this.bimServerViewer.viewer;
		v.viewFit(params.ids);
	}

	getCamera() {
		let v = this.bimServerViewer.viewer;
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

	setCamera(params) {
		let v = this.bimServerViewer.viewer;
		v.camera.restore(params);
	}

	reset(params) {
		let v = this.bimServerViewer.viewer;
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