#version 300 es

precision mediump int;
precision mediump float;

in vec3 vertexPosition;
in mat4 instances;

uniform vec4 vertexColor;
uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;

out mediump vec4 color;

void main(void) {
  gl_Position = projectionMatrix * modelViewMatrix * instances * vec4(vertexPosition, 1);
  color = vertexColor;
}