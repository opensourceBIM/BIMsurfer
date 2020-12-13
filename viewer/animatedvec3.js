import * as vec3 from "./glmatrix/vec3.js";

// @todo don't rely on Date, but on the timer from requestanimationframe

export class AnimatedVec3 {

    constructor(x, y, z) {
	    this.a = vec3.create();
	    this.b = vec3.create();
	    this.c = vec3.create();
	    this.tmp = vec3.create();
	    this.t0 = 0;
	    this.t1 = 1; 
	    this.t2 = 2;

        this.a.set([x, y, z]);
    }

    get() {
        if (this.t0 === 0) {
            return this.a;
        } else {
            let b, t, rt;
            rt = (+new Date);
            t = (rt  - this.t0) / (this.t1 - this.t0);
            if (t < 0) { t = 0; }
            if (t > 1) {
                t = 1;
                b = true;
            }
            vec3.lerp(this.tmp, this.a, this.b, t);
            if (b) {
                if (this.t2) {
                    this.t0 = this.t1;
                    this.t1 = this.t2;
                    this.t2 = 0;

                    let x = this.a;
                    this.a = this.b;
                    this.b = this.c;
                    this.c = x;

                    return this.get();
                } else {
                    this.a.set(this.tmp);
                    this.t0 = 0;
                    AnimatedVec3.ACTIVE_ANIMATIONS--;
                }
            }
            return this.tmp;
        }
    }

    deanimate() {
        if (this.t0) {
            let x = this.a;
            this.a = this.get();
            this.tmp = x;
            this.t0 = 0;
        }
    }

    // Store manually in `b`.
    animate(dt, dt2) {
        this.t0 = +new Date;
        this.t1 = this.t0 + dt;
        if (dt2) {
            this.t2 = this.t1 + dt2;
        } else {
            this.t2 = 0;
        }
        AnimatedVec3.ACTIVE_ANIMATIONS++;
    }
}

AnimatedVec3.ACTIVE_ANIMATIONS = 0;