#version 300 es

precision mediump int;
precision mediump float;

in vec3 vertexPosition;
in vec3 vertexNormal;
in vec4 vertexColor;

in mat4 instanceMatrices;
in mat4 instanceNormalMatrices;

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

    vec3 viewNormal = normalize(( viewNormalMatrix * instanceNormalMatrices * vec4(vertexNormal, 0.0)).xyz);
    vec3 lightDir = normalize(vec3(0.5, 0.5, 0.5));
    float lambertian = max(dot(lightDir, viewNormal), 0.0);

    gl_Position = projectionMatrix * viewMatrix * instanceMatrices * vec4(vertexPosition, 1);
    color = vec4(lambertian * vertexColor.rgb, vertexColor.a);
}