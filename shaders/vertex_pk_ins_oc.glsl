#version 300 es

precision mediump int;
precision mediump float;

in vec3 vertexPosition;

in mat4 instanceMatrices;
in vec4 instancePickColors;

uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

out mediump vec4 color;

void main(void) {

  gl_Position = projectionMatrix * viewMatrix * instanceMatrices * vec4(vertexPosition, 1);
  color = instancePickColors;
}