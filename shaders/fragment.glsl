precision mediump int;
precision mediump float;

#ifdef WITH_PICKING
flat in uvec4 color;
layout(location = 0) out uvec4 myOutputColor;

in float depth;
layout(location = 1) out float myOutputDepth;
#else
in vec4 color;
layout(location = 0) out vec4 myOutputColor;

// out vec4 myOutputColor;
#endif

#ifndef WITH_PICKING
layout(location=1) out float myOutputAlpha;
#endif

void main(void) {
   #ifdef WITH_PICKING
   myOutputColor = color;
   myOutputDepth = depth;
   #else
   myOutputColor = color * color.a;
   myOutputAlpha = color.a;
   #endif
}