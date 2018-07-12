#version 300 es

precision mediump int;
precision mediump float;

in vec3 vertexPosition;
in ivec3 vertexNormal;
in vec4 vertexColor;

uniform mat4 projectionMatrix;
uniform mat4 normalMatrix;
uniform mat4 modelViewMatrix;

uniform LightData {
	vec3 lightDir;
	vec3 lightColor;
	vec3 ambientColor;
	float shininess;
} lightData;

out mediump vec4 color;

void main(void) {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(vertexPosition, 1);

  vec3 viewNormal = vec3( normalMatrix * vec4(float(vertexNormal.x) / 127.0, float(vertexNormal.y) / 127.0, float(vertexNormal.z) / 127.0, 0.0));

  color = vertexColor;
}