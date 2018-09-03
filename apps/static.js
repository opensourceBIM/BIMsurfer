import StaticViewer from "../viewer/staticviewer.js"

export default class Static {
    constructor() {

    }

    start() {
        this.viewer = new StaticViewer();
    }
}

new Static().start();