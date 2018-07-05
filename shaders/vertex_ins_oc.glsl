#version 300 es

precision mediump int;
precision mediump float;

in vec3 vertexPosition;
in vec3 vertexNormal;
in mat4 instances;

uniform vec4 vertexColor;
uniform mat4 projectionMatrix;
uniform mat4 normalMatrix;
uniform mat4 modelViewMatrix;

uniform LightData {
	vec3 lightPosition;
	vec3 lightColor;
	vec3 ambientColor;
	float shininess;
} lightData;

out mediump vec4 color;
out mediump vec3 vertex;
out mediump vec3 normal;

void main(void) {
  gl_Position = projectionMatrix * modelViewMatrix * instances * vec4(vertexPosition, 1);
  vertex = vec3(gl_Position);

  normal = vec3( normalMatrix * instances * vec4(vertexNormal, 0.0));

  color = vertexColor;
}