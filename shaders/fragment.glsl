precision mediump int;
precision mediump float;

#ifdef WITH_PICKING
flat in mediump uvec2 color;
out mediump uvec2 myOutputColor;
#else
in mediump vec4 color;
out vec4 myOutputColor;
#endif

void main(void) {
   myOutputColor = color;
}