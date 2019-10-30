/**
 * Basic tree model, used for the ProjectTree at the moment
 */
class TreeNode {
	constructor(view) {
		this.children = [];
		this.view = view;
		this.expanded = false;
	}
	
	add(label) {
		var newNode = new TreeNode(this.view);
		newNode.label = label;
		newNode.parent = this;
		this.children.push(newNode);
		if (this.children.length == 1) {
			if (!(this instanceof TreeModel)) {
				this.view.collapsed(this);
			}
		}
		return newNode;
	}
	
	show() {
		this.view.show(this);
	}
	
	toggle() {
		if (this.children.length > 0) {
			this.expanded = !this.expanded;
			if (this.expanded) {
				this.view.expanded(this);
			} else {
				this.view.collapsed(this);
			}
		}
	}
	
	click(clickFn) {
		if (clickFn != null) {
			this.clickFn = clickFn;
		} else {
			if (this.clickFn != null) {
				this.clickFn(this);
			}
		}
	}
}

export class TreeModel extends TreeNode {
	constructor(view) {
		super(view);
	}
}