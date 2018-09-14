export default class RenderBuffer {

    constructor(canvas, gl) {
        this.gl = gl;
        this.allocated = false;
        this.canvas = canvas;
        this.buffer = null;
        this.bound = false;
    }

    bind() {
        this._touch();
        if (this.bound) {
            return;
        }
        var gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.buffer.framebuf);
        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
        this.bound = true;
    }

    _touch() { // Lazy-creates buffer if needed, resizes to canvas if needed
        var gl = this.gl;
        var width = this.canvas.clientWidth;
        var height = this.canvas.clientHeight;
        if (this.buffer) {
            if (this.buffer.width === width && this.buffer.height === height) {
                return;
            } else {
                gl.deleteTexture(this.buffer.texture);
                gl.deleteFramebuffer(this.buffer.framebuf);
                gl.deleteRenderbuffer(this.buffer.renderbuf);
            }
        }

        // var ext = gl.getExtension('WEBGL_draw_buffers');
        var ext = gl.getExtension('EXT_color_buffer_float');

        this.colorBuffer = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.colorBuffer);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32UI, width, height, 0, gl.RG_INTEGER, gl.UNSIGNED_INT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        this.depthFloat = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.depthFloat);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, width, height, 0, gl.RED, gl.FLOAT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        this.depthBuffer = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthBuffer);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);

        var framebuf = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuf);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.colorBuffer, 0);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, this.depthFloat, 0);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depthBuffer);

        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.bindRenderbuffer(gl.RENDERBUFFER, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        // Verify framebuffer is OK
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuf);
        if (!gl.isFramebuffer(framebuf)) {
            throw "Invalid framebuffer";
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        var status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        switch (status) {
            case gl.FRAMEBUFFER_COMPLETE:
                break;
            case gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT:
                throw "Incomplete framebuffer: FRAMEBUFFER_INCOMPLETE_ATTACHMENT";
            case gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT:
                throw "Incomplete framebuffer: FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT";
            case gl.FRAMEBUFFER_INCOMPLETE_DIMENSIONS:
                throw "Incomplete framebuffer: FRAMEBUFFER_INCOMPLETE_DIMENSIONS";
            case gl.FRAMEBUFFER_UNSUPPORTED:
                throw "Incomplete framebuffer: FRAMEBUFFER_UNSUPPORTED";
            default:
                throw "Incomplete framebuffer: " + status;
        }
        this.buffer = {framebuf: framebuf, depthBuffer: this.depthBuffer, colorBuffer: this.colorBuffer, width: width, height: height};
        this.bound = false;
    }

    clear() {
        if (!this.bound) {
            throw "Render buffer not bound";
        }
        var gl = this.gl;
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }

    read(pickX, pickY) {
        var x = pickX;
        var y = this.canvas.height - pickY;
        var pix = new Uint32Array(2);
        var gl = this.gl;
        gl.readBuffer(gl.COLOR_ATTACHMENT0);
        gl.readPixels(x, y, 1, 1, gl.RG_INTEGER, gl.UNSIGNED_INT, pix);
        return pix;
    }

    depth(pickX, pickY) {
        var x = pickX;
        var y = this.canvas.height - pickY;
        var pix = new Float32Array(1);
        var gl = this.gl;
        gl.readBuffer(gl.COLOR_ATTACHMENT1);
        gl.readPixels(x, y, 1, 1, gl.RED, gl.FLOAT, pix);
        return pix;
    }

    unbind() {
        var gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        this.bound = false;
    }

    destroy() {
        if (this.allocated) {
            var gl = this.gl;
            gl.deleteTexture(this.buffer.texture);
            gl.deleteFramebuffer(this.buffer.framebuf);
            gl.deleteRenderbuffer(this.buffer.renderbuf);
            this.allocated = false;
            this.buffer = null;
            this.bound = false;
        }
    }
}