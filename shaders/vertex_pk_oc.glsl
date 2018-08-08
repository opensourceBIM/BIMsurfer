#version 300 es

precision mediump int;
precision mediump float;

in vec3 vertexPosition;
in uvec2 vertexPickColor;

uniform uvec2 objectPickColor;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

flat out mediump uvec2 color;

void main(void) {

  gl_Position = projectionMatrix * viewMatrix * vec4(vertexPosition, 1);
  color = objectPickColor + vertexPickColor;
}