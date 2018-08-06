#version 300 es

precision mediump int;
precision mediump float;

in ivec3 vertexPosition;
in ivec3 vertexNormal;
in uvec4 vertexColor;

uniform mat4 vertexQuantizationMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform mat4 viewNormalMatrix;

uniform LightData {
	vec3 lightPosition;
	vec3 lightColor;
	vec3 ambientColor;
	float shininess;
} lightData;

out mediump vec4 color;

void main(void) {

    vec4 floatVertex = vertexQuantizationMatrix * vec4(float(vertexPosition.x), float(vertexPosition.y), float(vertexPosition.z), 1);
    vec3 lightDir = vec3(0.5, 0.5, 0.5);
    vec3 viewNormal = vec3( viewNormalMatrix * vec4(float(vertexNormal.x) / 127.0, float(vertexNormal.y) / 127.0, float(vertexNormal.z) / 127.0, 0.0));
    vec4 floatColor = vec4(float(vertexColor.x) / 255.0, float(vertexColor.y) / 255.0, float(vertexColor.z) / 255.0, float(vertexColor.w) / 255.0);
    float lambertian = max(dot(viewNormal, lightDir), 0.0);

    gl_Position = projectionMatrix * viewMatrix * floatVertex;
    color = lambertian * floatColor;
}