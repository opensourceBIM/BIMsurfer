precision mediump int;
precision mediump float;

#ifdef WITH_PICKING
flat in mediump uvec2 color;
layout(location = 0) out mediump uvec2 myOutputColor;

in float depth;
layout(location = 1) out float myOutputDepth;
#else
in mediump vec4 color;
out vec4 myOutputColor;
#endif

void main(void) {
   myOutputColor = color;

   #ifdef WITH_PICKING
   myOutputDepth = depth;
   #endif
}