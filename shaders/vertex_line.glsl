#version 300 es

precision mediump int;
precision mediump float;

in vec3 vertexPosition;

uniform vec4 inputColor;
uniform mat4 matrix;
uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;

out mediump vec4 color;

void main(void) {
  gl_Position = projectionMatrix * modelViewMatrix * matrix * vec4(vertexPosition, 1);
  
  color = inputColor;
}