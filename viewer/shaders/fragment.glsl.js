export const FRAGMENT_SHADER_SOURCE = `

precision mediump int;
precision mediump float;

in vec3 worldCoords;

#ifdef WITH_PICKING
flat in uvec4 color;
layout(location = 0) out uvec4 myOutputColor;
layout(location = 1) out float myOutputDepth;
layout(location = 2) out vec4 myOutputNormal;
#else
in vec4 color;
layout(location = 0) out vec4 myOutputColor;
#endif

#ifndef WITH_PICKING
layout(location=1) out float myOutputAlpha;
#endif

uniform vec4 sectionPlane;

void main(void) {
#ifndef WITH_LINEPRIMITIVES
   // Lines are never rendered with the section plane enabled. So this is an
   // optimization measure rather than anything else.
   if (dot(worldCoords, sectionPlane.xyz) >= sectionPlane.w) {
      discard;
   }
#endif

#ifdef WITH_PICKING
   myOutputColor = color;
   myOutputDepth = gl_FragCoord.z;
   // The picking program does not have normal attributes, so we *have* to
   // use the shader derivatives. @todo reevaluate
   myOutputNormal.xyz = normalize(cross(dFdx(worldCoords), dFdy(worldCoords)));
#else
   myOutputColor = color;// vec4(color.rgb * color.a, color.a);
   myOutputAlpha = 1.;
#endif
}
`