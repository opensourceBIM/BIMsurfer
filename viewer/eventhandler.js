/**
 * @ignore
 */
export class EventHandler {
    constructor() {
        this.handlers = {};
    }

    on(evt, handler) {
        (this.handlers[evt] || (this.handlers[evt] = [])).push(handler);
    }

    off(evt, handler) {
        var h = this.handlers[evt];
        var found = false;
        if (typeof(h) !== 'undefined') {
            var i = h.indexOf(handler);
            if (i >= -1) {
                h.splice(i, 1);
                found = true;
            }
        }
        if (!found) {
            throw new Error("Handler not found");
        }
    }

    fire(evt, ...args) {
//    	console.log(evt, args);
        var h = this.handlers[evt];
        if (!h) {
            return;
        }
        for (var i = 0; i < h.length; ++i) {
            h[i].apply(this, args);
        }
    }
}