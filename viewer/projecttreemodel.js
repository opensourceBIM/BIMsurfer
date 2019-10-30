import {TreeModel} from "./treemodel.js";

/**
 * A quick and dirty tree model, this is used in both the dev.js and interactive.js apps
 */
export class ProjectTreeModel extends TreeModel{
	constructor(bimServerApi, view) {
		super(view);
		this.subDiv = view.rootElement;
		while (this.subDiv.firstChild) {
			this.subDiv.removeChild(this.subDiv.firstChild);
		}
		this.bimServerApi = bimServerApi;
		this.poidToProject = new Map();
	}

	load(clickFn) {
		this.bimServerApi.call("ServiceInterface", "getAllProjects", {
			onlyTopLevel: false,
			onlyActive: true
		}, (projects) => {
			if (projects.length == 0) {
				var node = this.add("No projects");
				node.show();
			}
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
					this.addProject(null, p, clickFn);
				}
			}
		});
	}
	
	addProject(parentNode, project, clickFn) {
		if (project.lastRevisionId == -1 && project.subProjects.length == 0) {
			return;
		}
		if (parentNode == null) {
			var node = this.add(project.name);
		} else {
			var node = parentNode.add(project.name);
		}
		if (project.lastRevisionId != -1) {
			node.click(clickFn);
		}
		node.project = project;
		node.show();

		var mainProject = this.poidToProject.get(project.oid);
		if (mainProject != null) {
			for (var subProject of mainProject.subProjects) {
				this.addProject(node, subProject, clickFn);
			}
		}
	}
}