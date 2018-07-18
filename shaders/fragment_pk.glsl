#version 300 es

precision mediump int;
precision mediump float;

in mediump vec4 color;

out vec4 myOutputColor;

void main(void) {
   myOutputColor = color;
}