#version 300 es

precision mediump int;
precision mediump float;

in vec3 vertexPosition;
in vec3 vertexNormal;
in uvec4 vertexColor;

uniform mat4 projectionMatrix;
uniform mat4 viewNormalMatrix;
uniform mat4 viewMatrix;

uniform LightData {
	vec3 lightPosition;
	vec3 lightColor;
	vec3 ambientColor;
	float shininess;
} lightData;

out mediump vec4 color;

void main(void) {

    vec3 niewNormal = vec3( viewNormalMatrix * vec4(vertexNormal, 0.0));

    gl_Position = projectionMatrix * viewMatrix * vec4(vertexPosition, 1);
    color = vec4(float(vertexColor.x) / 255.0, float(vertexColor.y) / 255.0, float(vertexColor.z) / 255.0, float(vertexColor.w) / 255.0);
}