#version 300 es

precision mediump int;
precision mediump float;

in vec3 vertexPosition;
in vec4 vertexColor;
in mat4 instances;

uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

out mediump vec4 color;

void main(void) {
  gl_Position = projectionMatrix * viewMatrix * instances * vec4(vertexPosition, 1);
  color = vertexColor;
}