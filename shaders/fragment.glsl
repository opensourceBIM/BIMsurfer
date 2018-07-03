#version 300 es

precision mediump int;
precision mediump float;

uniform LightData {
	vec3 lightPosition;
	vec3 lightColor;
	vec3 ambientColor;
	float shininess;
} lightData;

in mediump vec3 vertex;
in mediump vec4 color;
in mediump vec3 normal;

out vec4 myOutputColor;

void main(void) {
   myOutputColor = vec4(color.rgb * 0.7, color.a);
}