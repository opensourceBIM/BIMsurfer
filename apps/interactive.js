// At the moment this API is loaded from a BIMserver, you could also include the API files in your viewer
import {BimServerClient} from "../../bimserverjavascriptapi/bimserverclient.js"
import {BimServerViewer} from "../viewer/bimserverviewer.js"
import {TreeView} from "../viewer/treeview.js"
import {ProjectTreeModel} from "../viewer/projecttreemodel.js"

/*
 * This class is where the interactive demo application starts
 */

export class Interactive {

	constructor() {
		// You need to change these to something that makes sense
		this.settings = {
			viewerBasePath: "../"
		};
	}

	start() {
		document.getElementById("login").hidden = true;
		this.defaultServers = [
			{
				title: "Default local development BIMserver",
				description: "Default address when running BIMserver from code",
				address: "http://localhost:8080",
				username: "admin@bimserver.org",
				password: "admin"
			}, {
				title: "Default local BIMserver JAR",
				description: "Default address when running BIMserver as a JAR",
				address: "http://localhost:8082"
			}, {
				title: "Experimental BIMserver",
				description: "An online server used for testing. NO GUARANTEES AT ALL that this is up/working. You need to have an account.",
				address: "https://thisisanexperimentalserver.com"
			}, {
				title: "Logic Labs - Epic BIMserver",
				description: "An online server used for testing. NO GUARANTEES AT ALL that this is up/working. You need to have an account and your IP whitelisted.",
				address: "https://epic.logic-labs.nl"
			}
		];
		
		document.getElementById("address").focus();
		
		document.getElementById("address").addEventListener("keypress", (event) => {
			if (event.key == "Enter") {
				this.connectServer({
					address: document.getElementById("address").value
				});
			}
		});
		document.getElementById("username").addEventListener("keypress", (event) => {
			if (event.key == "Enter") {
				this.login();
			}
		});
		document.getElementById("password").addEventListener("keypress", (event) => {
			if (event.key == "Enter") {
				this.login();
			}
		});
		
		this.showServers();
		
		for (const tab of document.querySelectorAll("#tabs .tab")) {
			tab.addEventListener("click", (e) => {
				if (e.target.id == "serversTab") {
					this.showServers();
				} else if (e.target.id == "loginTab") {
					this.showLogin();
				} else if (e.target.id == "selectProjectTab") {
					this.showSelectProject();
				} else if (e.target.id == "selectRevisionTab") {
					this.showSelectRevision();
				} else if (e.target.id == "viewerTab") {
					this.showViewer();
				}
			});
		}
	}
	
	showTab(tabId) {
		if (this.currentTab != null) {
			this.currentTab.hidden = true;
			document.getElementById(this.currentTab.id + "Tab").classList.remove("active");
		}
		document.getElementById(tabId + "Tab").classList.add("active");
		this.currentTab = document.getElementById(tabId);
		this.currentTab.hidden = false;
	}
	
	showServers() {
		this.showTab("servers");
		var interactive = document.getElementById("serverList");
		while (interactive.firstChild) {
			interactive.removeChild(interactive.firstChild);
		}
		for (const server of this.defaultServers) {
			var serverDiv = document.createElement("div");
			serverDiv.classList.add("server");
			serverDiv.click(() => {
				this.connectServer(server);
			});
			var title = document.createElement("h3");
			title.innerHTML = server.title;
			var status = document.createElement("div");
			status.innerHTML = "Unknown";
			status.classList.add("serverstatus");
			var description = document.createElement("p");
			var url = document.createElement("a");
			url.setAttribute("href", server.address);
			url.innerHTML = server.address;
			description.innerHTML = server.description;
			serverDiv.appendChild(title);
			serverDiv.appendChild(url);
			serverDiv.appendChild(description);
			serverDiv.appendChild(status);
			interactive.appendChild(serverDiv);
			var button = document.createElement("button");
			button.innerHTML = "Connect";
			button.addEventListener("click", () => {
				this.connectServer(server);
			});
			serverDiv.appendChild(button);
			this.ping(server, status);
		}
		document.getElementById("connectButton").addEventListener("click", (event) => {
			event.preventDefault();
			this.connectServer({
				address: document.getElementById("address").value
			});
		});
	}
	
	login() {
		document.getElementById("loginStatus").innerHTML = "Logging in...";
		this.api.login(document.getElementById("username").value, document.getElementById("password").value, () => {
			document.getElementById("loginStatus").innerHTML = "Logging successfull";
			this.showSelectProject();
		}, (error) => {
			document.getElementById("loginStatus").innerHTML = error.message;
		});
	}
	
	showLogin() {
		this.showTab("login");
		document.getElementById("username").focus();
		var loginButton = document.getElementById("loginButton");
		loginButton.addEventListener("click", () => {
			this.login();
		});
	}
	
	showSelectProject() {
		this.showTab("selectProject");
		var selectProject = document.getElementById("selectProject");
		while (selectProject.firstChild) {
			selectProject.removeChild(selectProject.firstChild);
		}
		var treeView = new TreeView(selectProject);
		this.projectTreeModel = new ProjectTreeModel(this.api, treeView);
		this.projectTreeModel.load((node) => {
			this.showSelectRevision(node.project);
		});
	}
	
	showSelectRevision(project) {
		this.showTab("selectRevision");
		var revisionsParent = document.getElementById("selectRevision");
		this.api.call("ServiceInterface", "getAllRevisionsOfProject", {
			poid: project.oid
		}, (revisions) => {
			for (const revision of revisions) {
				var row = document.createElement("div");
				row.classList.add("revision");
				row.addEventListener("click", () => {
					this.showViewer(revision);
				});
				row.innerHTML = revision.id + " " + revision.comment;
				revisionsParent.insertBefore(row, revisionsParent.children[0]);
			}
		});
	}

	showViewer(revision) {
		this.showTab("viewer");
		var canvas = document.getElementById("glcanvas");
		this.bimServerViewer = new BimServerViewer(this.api, this.settings, canvas, window.innerWidth, window.innerHeight);
		this.bimServerViewer.loadRevision(revision);
	}

	connectServer(server) {
		console.log("Connecting...", server.address);
		
		this.api = new BimServerClient(server.address);
		this.api.init().then(() => {
			this.showLogin();
		});
	}
	
	ping(server, status) {
		var request = new XMLHttpRequest();
		request.open("GET", server.address, true);
		request.addEventListener("load", () => {
			status.innerHTML = "UP";
			status.classList.add("up");
		});
		request.addEventListener("error", () => {
			status.innerHTML = "DOWN";
			status.classList.add("down");
		});
		request.addEventListener("abort", () => {
			status.innerHTML = "DOWN";
			status.classList.add("down");
		});
		request.send();
	}
}

new Interactive().start();