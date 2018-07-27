#version 300 es

precision mediump int;
precision mediump float;

in vec3 vertexPosition;
in vec3 vertexNormal;

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
  gl_Position = projectionMatrix * viewMatrix * vec4(vertexPosition, 1);
  
  vec3 viewNormal = (viewNormalMatrix * vec4(normalize(vertexNormal), 0.0)).xyz;

//  vec3 lightDir = normalize(vec3(0.5, 0.5, -1.0));
//  float lambertian = max(dot(viewNormal, lightDir), 0.0);
//  color = vec4(lambertian + objectColor.rgb, objectColor.a);

    color = objectColor;
}