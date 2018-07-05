#version 300 es

precision mediump int;
precision mediump float;

in ivec3 vertexPosition;
in ivec3 vertexNormal;
in vec4 vertexColor;

uniform mat4 vertexQuantizationMatrix;
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
  vec4 floatVertex = vec4(float(vertexPosition.x), float(vertexPosition.y), float(vertexPosition.z), 1);
  floatVertex = vertexQuantizationMatrix * floatVertex;
  
  gl_Position = projectionMatrix * modelViewMatrix * floatVertex;

  vertex = vec3(gl_Position);

  normal = vec3( normalMatrix * vec4(float(vertexNormal.x) / 127.0, float(vertexNormal.y) / 127.0, float(vertexNormal.z) / 127.0, 0.0));

  color = vertexColor;
}