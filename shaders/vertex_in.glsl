#version 300 es

precision mediump int;
precision mediump float;

in vec3 vertexPosition;
in ivec3 vertexNormal;
in vec4 vertexColor;

uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform mat4 viewNormalMatrix;

uniform LightData {
	vec3 dir;
	vec3 color;
	vec3 ambientColor;
	float intensity;
} lightData;

out mediump vec4 color;

void main(void) {

    vec3 viewNormal = normalize(vec3( viewNormalMatrix * vec4(float(vertexNormal.x) / 127.0, float(vertexNormal.y) / 127.0, float(vertexNormal.z) / 127.0, 0.0)));
    float lambertian = max(dot(-viewNormal, normalize(lightData.dir)), 0.0);
    gl_Position = projectionMatrix * viewMatrix * vec4(vertexPosition, 1);
    color = vec4(lambertian * vertexColor.rgb, vertexColor.a);
}