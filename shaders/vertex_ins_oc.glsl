#version 300 es

precision mediump int;
precision mediump float;

in vec3 vertexPosition;
in vec3 vertexNormal;
in mat4 instances;

uniform vec4 objectColor;
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
  gl_Position = projectionMatrix * viewMatrix * instances * vec4(vertexPosition, 1);

  vec3 normal = vec3( viewNormalMatrix * instances * vec4(vertexNormal, 0.0));

//  vec3 lightDir = vec3(0.5, 0.5, 0.5);
//  float lambertian = max(dot(normal, lightDir), 0.0);
//  color = lambertian * objectColor;

color = objectColor;
}