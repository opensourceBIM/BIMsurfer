import {BimServerViewer} from "../viewer/bimserverviewer.js"

export function displayStaticBuffer(domNode, bufferPath) {
    var canvas = document.getElementById(domNode);
    let v = new BimServerViewer({quantizeVertices:false}, canvas, window.innerWidth, window.innerHeight, null);
    v.loadAnnotationsFromPreparedBufferUrl(bufferPath);
}
