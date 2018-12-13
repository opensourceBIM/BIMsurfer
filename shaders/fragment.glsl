precision lowp int;
precision lowp float;

#ifdef WITH_PICKING
flat in uvec4 color;
layout(location = 0) out uvec4 myOutputColor;

in float depth;
layout(location = 1) out float myOutputDepth;
#else
in vec4 color;
out vec4 myOutputColor;
#endif

void main(void) {
   myOutputColor = color;

   #ifdef WITH_PICKING
   myOutputDepth = depth;
   #endif
}