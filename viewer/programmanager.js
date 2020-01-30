import {VERTEX_SHADER_SOURCE} from "./shaders/vertex.glsl.js";
import {FRAGMENT_SHADER_SOURCE} from "./shaders/fragment.glsl.js";

export const OBJECT_COLORS = 1;
export const VERTEX_QUANTIZATION = 2;
export const NORMAL_QUANTIZATION = 4;
export const COLOR_QUANTIZATION = 8;
export const REUSE = 16;
export const PICKING = 32;
export const LINE_PRIMITIVES = 64;
export const NORMAL_OCT_ENCODE = 128;
export const LINES = 256;

/**
 * Keeps track of shader programs, glsl, uniform positions and vertex attributes
 */
export class ProgramManager {
	
	constructor(gl, settings) {
		this.gl = gl;
		this.settings = settings;
		this.programs = [];
		this.promises = [];
	}

	generateSetup(key) {
		var settings = {
			attributes: [],
			uniforms: []
		};
		if (key & LINE_PRIMITIVES) {
			return key;
		}
		if (key & PICKING) {
			if (key & REUSE) {
				settings.attributes.push("instancePickColors");
			} else {
				settings.attributes.push("vertexPickColor");
			}
		}
		if (key & REUSE) {
			settings.attributes.push("instanceMatrices");
			settings.uniforms.push("numContainedInstances");
			settings.uniforms.push("containedInstances");
			settings.uniforms.push("containedMeansHidden");
			if (!(key & PICKING) && !(key & LINES)) {
				settings.attributes.push("instanceNormalMatrices");
			}
		}
		if (!(key & PICKING)) {
			if (key & OBJECT_COLORS) {
				settings.uniforms.push("objectColor");
			} else {
				if (!(key & LINES)) {
					settings.attributes.push("vertexColor");
				}
			}			
		}
		if (key & NORMAL_QUANTIZATION || key & NORMAL_OCT_ENCODE) {
			// Has no effect on locations
		}
		if (key & VERTEX_QUANTIZATION) {
			settings.uniforms.push("vertexQuantizationMatrix");
		}
		return settings;
	}

	load() {
		var defaultSetup = {
			attributes: [
				"vertexPosition",
				"vertexNormal"
				],
			uniforms: [
				"projectionMatrix",
				"viewNormalMatrix",
				"postProcessingTranslation",
				"viewMatrix",
				"sectionPlane"
			],
			uniformBlocks: [
				"LightData"
			]
		};
		var defaultSetupForLines = {
			attributes: [
				"vertexPosition"
				],
				uniforms: [
					"projectionMatrix",
					"postProcessingTranslation",
					"viewMatrix",
					"sectionPlane"
				],
				uniformBlocks: [
				]
		};
		var defaultSetupForPicking = {
			attributes: [
				"vertexPosition"
				],
			uniforms: [
				"projectionMatrix",
				"postProcessingTranslation",
				"viewMatrix",
				"sectionPlane"
				],
			uniformBlocks: [
			]
		};

		{
			let picking = false;
			for (var instancing of [true, false]) {
				for (var lines of [true, false]) {
					var key = this.createKey(instancing, picking, lines);
					this.generateShaders(lines ? defaultSetupForLines : defaultSetup, key);
				}
			}
		}

		// Line primitives

		// Some line renderer do not use quantization (which is actually better for low-triangle-counts)
		// Others do (outline fore example potentialy draws a lot, also it's faster to copy if the regular geometry is already quantized)
		for (var quantization of [true, false]) {
			let lineUniforms = [
				"matrix",
				"inputColor",
				"projectionMatrix",
				"postProcessingTranslation",
				"viewMatrix",
				"aspect",
				"thickness"
			];
			var key = LINE_PRIMITIVES;
			if (quantization) {
				lineUniforms.push("vertexQuantizationMatrix");
				key |= VERTEX_QUANTIZATION;
			}
			
			this.setupProgram(VERTEX_SHADER_SOURCE, FRAGMENT_SHADER_SOURCE, {
				attributes: ["vertexPosition", "nextVertexPosition", "direction"],
				uniforms: lineUniforms
			}, this.generateSetup(key), key);
		}

        //  Picking shaders
		{
			let picking = true;
			for (var instancing of [true, false]) {
				var key = this.createKey(instancing, picking);
				this.generateShaders(defaultSetupForPicking, key);
			}
		}

        return Promise.all(this.promises);
	}
	
	generateShaders(defaultSetup, key) {
		var vertexShaderName = this.getVertexShaderName();
		var fragShaderName = "shaders/fragment.glsl";
		this.setupProgram(VERTEX_SHADER_SOURCE, FRAGMENT_SHADER_SOURCE, defaultSetup, this.generateSetup(key), key);
	}

	getVertexShaderName() {
		return "shaders/vertex.glsl";
	}

	createKey(reuse, picking, lines=false) {
		var key = 0;
		key |= (this.settings.useObjectColors ? OBJECT_COLORS : 0);
		key |= (this.settings.quantizeVertices ? VERTEX_QUANTIZATION : 0);
		key |= ((!picking && this.settings.quantizeNormals) ? NORMAL_QUANTIZATION : 0);
		key |= ((!picking && this.settings.loaderSettings.octEncodeNormals) ? NORMAL_OCT_ENCODE : 0);
		key |= ((!picking && this.settings.quantizeColors) ? COLOR_QUANTIZATION : 0);
		key |= (reuse ? REUSE : 0);
		key |= (picking ? PICKING : 0);
		key |= (lines ? LINES : 0);
		return key;
	}
	
	// Only used for debugging
	keyToJson(key) {
		return {
			useObjectColors: (key & OBJECT_COLORS) ? true : false,
			quantizeVertices: (key & VERTEX_QUANTIZATION) ? true : false,
			quantizeNormals: (key & NORMAL_QUANTIZATION) ? true : false,
			octEncodeNormals: (key & NORMAL_OCT_ENCODE) ? true : false,
			quantizeColors: (key & COLOR_QUANTIZATION) ? true : false,
			reuse: (key & REUSE) ? true : false,
			picking: (key & PICKING) ? true : false,
			linePrimitives: (key & LINE_PRIMITIVES) ? true : false,
			lines: (key & LINES) ? true : false
		};
	}
	
	getProgram(key) {
//		console.log("getProgram", key, this.keyToJson(key));
		var program = this.programs[key];
		if (program != null) {
			return program;
		}
		console.error("Program not found", key);
//		this.programNames = this.programNames || {};
//		var vertexShaderName = this.getVertexShaderName(key);
//		if (!this.programNames[vertexShaderName]) {
//			console.log("getProgram(..) -> " + vertexShaderName);
//			this.programNames[vertexShaderName] = true;
//		}
//
//		program = this.programs[key];
//		if (program == null) {
//			console.error("Program not found", key);
//		}
//		return program;
	}

	setProgram(key, program) {
		this.programs[key] = program;
	}

	setupProgram(vertexShaderSource, fragmentShaderSource, defaultSetup, specificSetup, key) {
//		console.log("setupProgram", key, this.keyToJson(key));
		var p = new Promise((resolve, reject) => {
			var shaderProgram = this.initShaderProgram(this.gl, "vertex shader", vertexShaderSource, "fragment shader", fragmentShaderSource, key, defaultSetup, specificSetup);

			var programInfo = {
				program: shaderProgram,
				attribLocations: {},
				uniformLocations: {},
				uniformBlocks: {}
			};

			//console.log("----------------------------------------");
			//console.log("setupProgram (" + vertexShader + ", " + fragmentShader + ")");

			for (var setup of [defaultSetup, specificSetup]) {
				if (setup.attributes != null) {
					//console.log("attributes:");
					for (var attribute of setup.attributes) {
						let res = programInfo.attribLocations[attribute] = this.gl.getAttribLocation(shaderProgram, attribute);
						if (res === -1) {
							console.error("Missing attribute location", attribute, vertexShaderSource, this.keyToJson(key));
							debugger;
						}
					}
				}
				if (setup.uniforms != null) {
					// @todo can also use getUniformIndices()
					for (var uniform of setup.uniforms) {
						let res = programInfo.uniformLocations[uniform] = this.gl.getUniformLocation(shaderProgram, uniform);
						if (res === null) {
							console.error("Missing uniform location", uniform, vertexShaderSource, this.keyToJson(key));
							debugger;
						}
					}
				}
				if (setup.uniformBlocks != null) {
					if (setup.uniformBlocks != null) {
						for (var uniformBlock of setup.uniformBlocks) {
							let res = programInfo.uniformBlocks[uniformBlock] = this.gl.getUniformBlockIndex(shaderProgram, uniformBlock);
							if (res == -1) {
								console.error("Missing uniformBlock '" + uniformBlock + "' = " + programInfo.uniformBlocks[uniformBlock], this.keyToJson(key));
								debugger;
							} else {
								this.gl.uniformBlockBinding(shaderProgram, programInfo.uniformBlocks[uniformBlock], 0);
							}
						}
					}
				}
			}
			
			this.setProgram(key, programInfo);

			resolve(programInfo);
		});

		this.promises.push(p);

		return p;
	}

	initShaderProgram(gl, vsName, vsSource, fsName, fsSource, key, defaultSetup, specificSetup) {
		const vertexShader = this.loadShader(gl, gl.VERTEX_SHADER, vsName, vsSource, key);
		if (vertexShader == null) {
			console.error(defaultSetup, specificSetup);
			return;
		}
		const fragmentShader = this.loadShader(gl, gl.FRAGMENT_SHADER, fsName, fsSource, key);
		if (fragmentShader == null) {
			console.error(defaultSetup, specificSetup);
			return;
		}

		const shaderProgram = gl.createProgram();
		gl.attachShader(shaderProgram, vertexShader);
		gl.attachShader(shaderProgram, fragmentShader);
		gl.linkProgram(shaderProgram);

		if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
			console.error('Unable to initialize the shader program: ' + gl.getProgramInfoLog(shaderProgram));
			return null;
		}

		return shaderProgram;
	}

	loadShader(gl, type, name, source, key) {
		var fullSource = "#version 300 es\n\n";
		// TODO would be nice to be able to access the constants generically, or use some sort of enum?
		if (key & OBJECT_COLORS) {
			fullSource += `#define WITH_USEOBJECTCOLORS\n`;
		}
		if (key & VERTEX_QUANTIZATION) {
			fullSource += `#define WITH_QUANTIZEVERTICES\n`;
		}
		if (key & NORMAL_QUANTIZATION) {
			fullSource += `#define WITH_QUANTIZENORMALS\n`;
		}
		if (key & NORMAL_OCT_ENCODE) {
			fullSource += `#define WITH_OCT_ENCODE_NORMALS\n`;
		}
		if (key & COLOR_QUANTIZATION) {
			fullSource += `#define WITH_QUANTIZECOLORS\n`;
		}
		if (key & REUSE) {
			fullSource += `#define WITH_INSTANCING\n`;
		}
		if (key & PICKING) {
			fullSource += `#define WITH_PICKING\n`;
		}
		if (key & LINE_PRIMITIVES) {
			fullSource += `#define WITH_LINEPRIMITIVES\n`;
		}
		if (key & LINES) {
			fullSource += `#define WITH_LINES\n`;
		}
		
		fullSource += "\n" + source;
		const shader = gl.createShader(type);
		gl.shaderSource(shader, fullSource);
		gl.compileShader(shader);
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			console.error(name);
//			console.error(fullSource);
			console.error('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
			gl.deleteShader(shader);
			return null;
		}
		return shader;
	}
}