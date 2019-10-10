export const COLOR_FLOAT_DEPTH_NORMAL = 0xff01;
export const COLOR_ALPHA_DEPTH = 0xff02;

/**
 *
 * @ignore
 * @export
 * @class RenderBuffer
 */
export class RenderBuffer {

    constructor(canvas, gl, purpose, supersample) {
        this.gl = gl;
        this.allocated = false;
        this.canvas = canvas;
        this.buffer = null;
        this.bound = false;
        this.purpose = purpose;
        this.supersample = supersample || 1;
    }

    bind() {
        this._touch();
        /* if (this.bound) {
            return;
        } */
        var gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.buffer.framebuf);
        gl.drawBuffers(this.attachments);
        gl.viewport(0, 0, this.buffer.width, this.buffer.height);
        this.bound = true;
    }

    _touch() { // Lazy-creates buffer if needed, resizes to canvas if needed
        var gl = this.gl;
        var width = this.canvas.clientWidth * this.supersample;
        var height = this.canvas.clientHeight * this.supersample;
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
        if (!ext) {
            throw "EXT_color_buffer_float is required";
        }

        var framebuf = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuf);

        let attachments = this.attachments = [gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1];
        let i = 0;
        
        let createTexture = (format) => {
            let t = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, t);
            gl.texStorage2D(gl.TEXTURE_2D, 1, format, width, height);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, this.supersample !== 1 ? gl.LINEAR : gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, this.supersample !== 1 ? gl.LINEAR : gl.NEAREST);
    
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

            gl.framebufferTexture2D(gl.FRAMEBUFFER, attachments[i++], gl.TEXTURE_2D, t, 0);
            return t;
        }

        if (this.purpose === COLOR_FLOAT_DEPTH_NORMAL) {
            this.attachments.push(gl.COLOR_ATTACHMENT2);

            this.colorBuffer = createTexture(gl.RGBA8UI);
            this.depthFloat = createTexture(gl.R32F);
            // @todo, just have depth in normalBuffer.w?
            this.normalBuffer = createTexture(gl.RGBA32F);            
        } else if (this.purpose === COLOR_ALPHA_DEPTH) {
            this.colorBuffer = createTexture(gl.RGBA16F);
            this.alphaBuffer = createTexture(gl.R16F);
        } else {
            throw "Unknown purpose";
        }

        this.depthBuffer = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthBuffer);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
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

    clear(depth) {
        if (!this.bound) {
            throw "Render buffer not bound";
        }
        var gl = this.gl;
        gl.clear(gl.COLOR_BUFFER_BIT | ((depth === false) ? 0 : gl.DEPTH_BUFFER_BIT));
    }

    read(pickX, pickY) {
        var x = pickX;
        var y = this.canvas.height - pickY;
        var pix = new Uint32Array(4);
        var gl = this.gl;
        gl.readBuffer(gl.COLOR_ATTACHMENT0);
        gl.readPixels(x, y, 1, 1, gl.RGBA_INTEGER, gl.UNSIGNED_INT, pix);
        return pix;
    }

    depth(pickX, pickY) {
        var x = pickX;
        var y = this.canvas.height - pickY;
        var pix = new Float32Array(4);//To review
        var gl = this.gl;
        gl.readBuffer(gl.COLOR_ATTACHMENT1);

        // Reading only gl.R should be sufficient, but at least on Google Chrome and Firefox on OSX, the gl.R could not be read. So that's why we are reading RGBA here
        // Don't think this can hurt performance. Seems to be caused by a vague spec: https://github.com/KhronosGroup/WebGL/issues/2747
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.FLOAT, pix);//To review
        
        return pix.slice(0, 1);
    }

    normal(pickX, pickY) {
        var x = pickX;
        var y = this.canvas.height - pickY;
        var pix = new Float32Array(4);
        var gl = this.gl;
        gl.readBuffer(gl.COLOR_ATTACHMENT2);
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.FLOAT, pix);
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
