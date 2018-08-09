#version 300 es

precision mediump int;
precision mediump float;

in vec3 vertexPosition;
in vec3 vertexNormal;
in vec4 vertexColor;

in mat4 instanceMatrices;
in mat3 instanceNormalMatrices;

uniform mat4 projectionMatrix;
uniform mat3 viewNormalMatrix;
uniform mat4 viewMatrix;

uniform LightData {
	vec3 dir;
	vec3 color;
	vec3 ambientColor;
	float intensity;
} lightData;

out mediump vec4 color;

void main(void) {

    vec3 viewNormal = normalize(viewNormalMatrix * instanceNormalMatrices * vertexNormal);
    float lambertian = max(dot(-viewNormal, normalize(lightData.dir)), 0.0);

    gl_Position = projectionMatrix * viewMatrix * instanceMatrices * vec4(vertexPosition, 1);
    color = vec4(lightData.ambientColor +  (lambertian * (lightData.color + vertexColor.rgb)), vertexColor.a);
}