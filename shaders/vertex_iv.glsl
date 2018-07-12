#version 300 es

precision mediump int;
precision mediump float;

in ivec3 vertexPosition;
in vec3 vertexNormal;
in vec4 vertexColor;

uniform mat4 vertexQuantizationMatrix;
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
  vec4 floatVertex = vec4(float(vertexPosition.x), float(vertexPosition.y), float(vertexPosition.z), 1);
  floatVertex = vertexQuantizationMatrix * floatVertex;
  
  gl_Position = projectionMatrix * modelViewMatrix * floatVertex;

  vec3 viewNormal = vec3( normalMatrix * vec4(vertexNormal, 0.0));

  color = vertexColor;
}