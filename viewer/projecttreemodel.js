import TreeModel from './treemodel.js'

export default class ProjectTreeModel extends TreeModel{
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
		})
	}
	
	addProject(parentNode, project, clickFn) {
		if (parentNode == null) {
			var node = this.add(project.name);
		} else {
			var node = parentNode.add(project.name);
		}
		node.click(clickFn);
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