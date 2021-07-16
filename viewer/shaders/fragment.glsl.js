export const FRAGMENT_SHADER_SOURCE = `

precision highp int;
precision highp float;

in vec3 worldCoords;

#ifdef WITH_PICKING
flat in uvec4 color;
layout(location = 0) out uvec4 myOutputColor;
#ifdef QUANTIZE_COLOR_BUFFER
layout(location = 1) out uvec4 myOutputDepth;
layout(location = 2) out uvec4 myOutputNormal;
#else
layout(location = 1) out float myOutputDepth;
layout(location = 2) out vec4 myOutputNormal;
#endif
#else
in vec4 color;
layout(location = 0) out vec4 myOutputColor;
#endif

#ifndef WITH_PICKING
layout(location=1) out float myOutputAlpha;
#endif

uniform vec4 sectionPlane[6];

#define VIEW_THRESHOLD (200. * 1000.)

void main(void) {
#ifndef WITH_LINEPRIMITIVES
   // Lines are never rendered with the section plane enabled. So this is an
   // optimization measure rather than anything else.
   for (int i = 0; i < 6; ++i) {
      if (dot(worldCoords, sectionPlane[i].xyz) >= sectionPlane[i].w) {
         discard;
      }
   }

   float L = length(worldCoords.xy);
   // To give the geospatial context a more natural falloff.
   if (L > VIEW_THRESHOLD)  {
     discard;
   }
#else
   const float L = 1.;
#endif

#ifdef WITH_PICKING
	#ifdef QUANTIZE_COLOR_BUFFER
	myOutputColor = color;
   // TODO probably should check whether 24 bits of precision are available
   uint intDepth = uint(gl_FragCoord.z * float(uint(1) << uint(24)));
   myOutputDepth = uvec4(intDepth >> 24, intDepth >> 16, intDepth >> 8, 0);
   // The picking program does not have normal attributes, so we *have* to
   // use the shader derivatives. @todo reevaluate
   vec3 normalizedNormal = normalize(cross(dFdx(worldCoords), dFdy(worldCoords))); 
   myOutputNormal = uvec4(int(normalizedNormal.x * 127.0), int(normalizedNormal.y * 127.0), int(normalizedNormal.z * 127.0), 0);
	#else
   myOutputColor = color;
   myOutputDepth = gl_FragCoord.z;
  // The picking program does not have normal attributes, so we *have* to
   // use the shader derivatives. @todo reevaluate
   myOutputNormal.xyz = normalize(cross(dFdx(worldCoords), dFdy(worldCoords)));

  // The next bit is disabled for now because precision was not ok
   // TODO probably should check whether 24 bits of precision are available
//   uint intDepth = uint(gl_FragCoord.z * float(uint(1) << uint(24)));
//   myOutputDepth = uvec4(intDepth >> 24, intDepth >> 16, intDepth >> 8, 0);
   // The picking program does not have normal attributes, so we *have* to
   // use the shader derivatives. @todo reevaluate
//   vec3 normalizedNormal = normalize(cross(dFdx(worldCoords), dFdy(worldCoords))); 
//   myOutputNormal = uvec4(int(normalizedNormal.x * 127.0), int(normalizedNormal.y * 127.0), int(normalizedNormal.z * 127.0), 0);
	
	#endif
#else
  // TODO if we move the lighting to the fragment shader, we can enable back-face-culling (for those objects that can handle it) and use gl_FrontFacing to decide to invert the normal)

//   float mist = 1. - L / (VIEW_THRESHOLD * 0.9);
//   mist = pow(mist, 0.5);

//   myOutputColor = vec4(color.rgb, color.a * mist);
   myOutputColor = color;
   myOutputAlpha = 1.;
#endif
}
`