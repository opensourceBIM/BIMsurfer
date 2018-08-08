#version 300 es

precision mediump int;
precision mediump float;

flat in mediump uvec2 color;

out mediump uvec2 myOutputColor;

void main(void) {
   myOutputColor = color;
}