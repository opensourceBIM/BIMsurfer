#version 300 es

precision mediump int;
precision mediump float;

in mediump vec4 color;

uniform LightData {
	vec3 dir;
	vec3 color;
	vec3 ambientColor;
	float intensity;
} lightData;

out vec4 myOutputColor;

void main(void) {
   myOutputColor = color;
}