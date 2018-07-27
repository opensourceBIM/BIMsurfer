#version 300 es

precision mediump int;
precision mediump float;

in ivec3 vertexPosition;
in vec3 vertexNormal;

uniform mat4 vertexQuantizationMatrix;
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
  vec4 floatVertex = vec4(float(vertexPosition.x), float(vertexPosition.y), float(vertexPosition.z), 1);
  
  floatVertex = vertexQuantizationMatrix * floatVertex;
  
  gl_Position = projectionMatrix * viewMatrix * floatVertex;

  vec3 normal = vec3(viewNormalMatrix * vec4(vertexNormal, 0.0));

//  vec3 lightDir = vec3(0.5, 0.5, 0.5);
//  float lambertian = max(dot(normal, lightDir), 0.0);
//  color = lambertian * vec4(1.0, 0.0, 0.0, 1.0);

  color = objectColor;

}