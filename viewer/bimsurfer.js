import BimServerViewer from "./bimserverviewer.js"
import EventHandler from "./eventhandler.js";
// @todo why?
import BimServerClient from "http://localhost:8080/apps/bimserverjavascriptapi/bimserverclient.js"

export default class BimSurfer extends EventHandler {
    constructor() {
        super();

        this.api = null;
        this.poidToProject = new Map();
    }

    loadProjects() {
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
        });
    }

    addProject(project) {
		if (project.lastRevisionId == -1) {
			return;
		}
        
        if (project.revisions.indexOf(this.roid !== -1)) {
            this.project = project;
        }
    }
    
    loadModel(domnode) {
		var canvasWrapper = document.getElementById("canvasWrapper");
		this.canvas = document.createElement("canvas");
		canvasWrapper.appendChild(this.canvas);

		var stats = new Stats();
		
		stats.setParameter("Models", "Name", project.name);
		
		this.bimServerViewer = new BimServerViewer(this.api, this.settings, this.canvas, window.innerWidth, window.innerHeight, stats);
		
		this.bimServerViewer.setProgressListener((percentage) => {
			document.getElementById("progress").style.display = "block";
			document.getElementById("progress").style.width = percentage + "%";
			if (percentage == 100) {
				document.getElementById("progress").style.display = "none";
			}
		});

		this.bimServerViewer.viewer.addAnimationListener((deltaTime) => {
			if (this.animationEnabled) {
				this.bimServerViewer.viewer.camera.orbitYaw(0.3);
			}
		});

		this.keyPressHandler = (event) => {
			this.keyPressListener(event);
		};
		document.addEventListener("keypress", this.keyPressHandler);
		
		this.bimServerViewer.loadModel(project);
	}

    load(params) {
        this.roid = params.roid;

        this.api = new BimServerClient(params.bimserver);
		this.api.init(() => {
			this.api.login(params.username, params.password, () => {
                this.loadProjects();
                
                this.loadModel(params.domNode);
			});
		});
        
        this.viewer = new BimServerViewer();
    }
}