precision mediump int;
precision mediump float;

in vec3 worldCoords;

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

uniform vec4 sectionPlane;

void main(void) {
   if (dot(worldCoords, sectionPlane.xyz) >= sectionPlane.w) {
      discard;
   }
   #ifdef WITH_PICKING
   myOutputColor = color;
   myOutputDepth = depth;
   #else
   myOutputColor = vec4(color.rgb * color.a, color.a);
   myOutputAlpha = 1.;
   #endif
}