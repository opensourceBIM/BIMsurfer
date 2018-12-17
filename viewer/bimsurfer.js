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
		this.bimServerViewer.viewer.setVisibility(params.ids, params.visible);
	}
}