import BimServerClient from "http://localhost:8080/apps/bimserverjavascriptapi/bimserverclient.js"
import BimServerViewer from "../viewer/bimserverviewer.js"
import Stats from "../viewer/stats.js"
import Settings from "../viewer/settings.js"
import ProjectTreeModel from "../viewer/projecttreemodel.js"
import TreeView from "../viewer/treeview.js"

/*
 * This class is where the applications starts, it's a mess, needs to go when we change this into an API
 */

export default class Dev {

	start() {
		this.animationEnabled = false;

		this.settingsView = new Settings(document.getElementById("settings"));
		
		// Deep-clone the settings, so we know we have a non-changing view of the settings
		this.settings = JSON.parse(JSON.stringify(this.settingsView.settings));
		this.settings.viewerBasePath = "../";
		this.settings.loaderSettings.tilingLayerReuse = true;
		this.settings.drawTileBorders = true;
		
		this.canvas = document.getElementById("glcanvas");

		this.api = new BimServerClient("http://localhost:8080");
		this.api.init(() => {
			this.api.login("admin@bimserver.org", "admin", () => {
				this.loadProjects();
			});
		});
	}

	loadProjects() {
		var treeView = new TreeView(document.getElementById("projects"));
		this.projectTreeModel = new ProjectTreeModel(this.api, treeView);
		this.projectTreeModel.load((node) => {
			this.loadModel(node.project);
		});
	}

	loadModel(project) {
		var rootElement = document.getElementById("projects");
		while (rootElement.firstChild) {
			rootElement.removeChild(rootElement.firstChild);
		}
		var stats = new Stats();
		
		stats.setParameter("Models", "Name", project.name);
		
		this.bimServerViewer = new BimServerViewer(this.api, this.settings, this.canvas, window.innerWidth, window.innerHeight, stats);

		this.bimServerViewer.viewer.addAnimationListener((deltaTime) => {
			if (this.animationEnabled) {
				this.bimServerViewer.viewer.camera.orbitYaw(0.3);
			}
		});

		document.addEventListener("keypress", (event) => {
			if (event.key == ' ') {
				event.preventDefault();
				this.animationEnabled = !this.animationEnabled;
				this.bimServerViewer.viewer.navigationActive = this.animationEnabled;
			}
		});
		
		this.bimServerViewer.loadModel(project);
	}
}

new Dev().start();