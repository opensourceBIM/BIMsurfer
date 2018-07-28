#version 300 es

precision mediump int;
precision mediump float;

in vec3 vertexPosition;
in vec3 vertexNormal;
in uvec4 vertexColor;
in mat4 instances;

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
 
  vec3 viewNormal = vec3( viewNormalMatrix * instances * vec4(vertexNormal, 0.0));

  vec4 floatColor = vec4(float(vertexColor.x) / 255.0, float(vertexColor.y) / 255.0, float(vertexColor.z) / 255.0, float(vertexColor.w) / 255.0);
  
  //  vec3 lightDir = vec3(0.5, 0.5, 0.5);
  //  float lambertian = max(dot(viewNormal, lightDir), 0.0);
  //  color = lambertian * floatColor;
  
  color = floatColor;
}