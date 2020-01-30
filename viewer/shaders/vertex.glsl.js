export const VERTEX_SHADER_SOURCE = `

precision mediump int;
precision mediump float;

#ifdef WITH_QUANTIZEVERTICES
uniform mat4 vertexQuantizationMatrix;
in ivec3 vertexPosition;
#else
in vec3 vertexPosition;
#endif

#ifdef WITH_LINEPRIMITIVES
#ifdef WITH_QUANTIZEVERTICES
in ivec3 nextVertexPosition;
#else
in vec3 nextVertexPosition;
#endif
in float direction;
#endif

#ifndef WITH_PICKING
#ifndef WITH_LINES
#ifdef WITH_QUANTIZENORMALS
#ifdef WITH_OCT_ENCODE_NORMALS
in ivec2 vertexNormal;
#else
in ivec3 vertexNormal;
#endif
#else
in vec3 vertexNormal;
#endif
#endif
#endif

#ifndef WITH_USEOBJECTCOLORS
#ifndef WITH_PICKING
#ifndef WITH_LINES
#ifdef WITH_QUANTIZECOLORS
in uvec4 vertexColor;
#else
in vec4 vertexColor;
#endif
#endif
#endif
#endif

#ifdef WITH_INSTANCING
in mat4 instanceMatrices;
uniform uint numContainedInstances;
uniform uint containedInstances[256];
uniform uint containedMeansHidden;
#ifndef WITH_PICKING
#ifndef WITH_LINES
in mat3 instanceNormalMatrices;
#endif
#endif
#endif

#ifdef WITH_PICKING
#ifdef WITH_INSTANCING
in uvec4 instancePickColors;
#else
in uvec4 vertexPickColor;
#endif
flat out uvec4 color;
#else
uniform LightData {
	vec3 dir;
	vec3 color;
	vec3 ambientColor;
	float intensity;
} lightData;

out vec4 color;
#endif

#ifdef WITH_USEOBJECTCOLORS
uniform vec4 objectColor;
#endif

#ifdef WITH_LINEPRIMITIVES
uniform vec4 inputColor;
uniform mat4 matrix;
uniform float aspect;
uniform float thickness;
#else
#ifndef WITH_LINES
uniform mat3 viewNormalMatrix;
#endif
#endif

uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform vec3 postProcessingTranslation;

out vec3 worldCoords;

vec3 octDecode(vec2 oct) {
	vec3 v = vec3(oct.xy, 1.0 - abs(oct.x) - abs(oct.y));
	if (v.z < 0.0) {
		v.xy = (1.0 - abs(v.yx)) * vec2(v.x >= 0.0 ? 1.0 : -1.0, v.y >= 0.0 ? 1.0 : -1.0);
	}
	return normalize(v);
}

void main(void) {
#ifndef WITH_INSTANCING
	#ifdef WITH_QUANTIZEVERTICES
		vec4 floatVertex = vec4(postProcessingTranslation, 0) + vertexQuantizationMatrix * vec4(float(vertexPosition.x), float(vertexPosition.y), float(vertexPosition.z), 1);
	#else
	    vec4 floatVertex = vec4(postProcessingTranslation, 0) + vec4(vertexPosition, 1);
	#endif
#endif

#ifndef WITH_PICKING
#ifndef WITH_LINES
#ifdef WITH_QUANTIZENORMALS
#ifdef WITH_OCT_ENCODE_NORMALS
	vec2 normal = vec2(float(vertexNormal.x), float(vertexNormal.y));
	if (normal.x < 0.0) {
		normal.x = normal.x / 128.0;
	} else {
		normal.x = normal.x / 127.0;
	}
	if (normal.y < 0.0) {
		normal.y = normal.y / 128.0;
	} else {
		normal.y = normal.y / 127.0;
	}
    vec3 floatNormal = octDecode(normal);
#else
	vec3 floatNormal = vec3(float(vertexNormal.x) / 127.0, float(vertexNormal.y) / 127.0, float(vertexNormal.z) / 127.0);
//	floatNormal = vec3(0.0, 0.0, 1.0);
#endif
#else
    vec3 floatNormal = vertexNormal;
#endif
#endif
#endif

#ifdef WITH_USEOBJECTCOLORS
    vec4 floatColor = objectColor;
#else
#ifndef WITH_PICKING
#ifndef WITH_LINES
#ifdef WITH_QUANTIZECOLORS
    vec4 floatColor = vec4(float(vertexColor.x) / 255.0, float(vertexColor.y) / 255.0, float(vertexColor.z) / 255.0, float(vertexColor.w) / 255.0);
#else
    vec4 floatColor = vertexColor;
#endif
#endif
#endif
#endif

#ifdef WITH_INSTANCING
	#ifdef WITH_QUANTIZEVERTICES
		vec4 floatVertex = vec4(postProcessingTranslation, 0) + instanceMatrices * vertexQuantizationMatrix * vec4(float(vertexPosition.x), float(vertexPosition.y), float(vertexPosition.z), 1);
	#else
		vec4 floatVertex = vec4(postProcessingTranslation, 0) + instanceMatrices * vec4(vertexPosition, 1);
	#endif
#ifndef WITH_PICKING
#ifndef WITH_LINES
    floatNormal = instanceNormalMatrices * floatNormal;
#endif
#endif
#endif

#ifdef WITH_LINEPRIMITIVES
    // tfk: todo: line matrix could be same as instanceMatrix?
    vec2 aspectVec = vec2(aspect, 1.0);
    mat4 viewModel = viewMatrix * matrix;
    mat4 projViewModel = projectionMatrix * viewModel;
    vec4 currentProjected = projectionMatrix * (vec4(postProcessingTranslation, 0) + viewModel * floatVertex);
    vec2 currentScreen = currentProjected.xy / currentProjected.w * aspectVec;

#ifdef WITH_QUANTIZEVERTICES
    vec4 nextVertexPositionFloat = vec4(postProcessingTranslation, 0) + vertexQuantizationMatrix * vec4(float(nextVertexPosition.x), float(nextVertexPosition.y), float(nextVertexPosition.z), 1);
#else
    vec4 nextVertexPositionFloat = vec4(postProcessingTranslation, 0) + vec4(nextVertexPosition, 1);
#endif

    vec4 nextProjected = projViewModel * nextVertexPositionFloat;
    vec2 nextScreen = nextProjected.xy / nextProjected.w * aspectVec;

    vec2 dir = normalize(nextScreen - currentScreen);
    vec2 normal = vec2(-dir.y, dir.x);

    vec4 offset = vec4(normal / aspectVec * float(direction) * thickness * currentProjected.w, 0.0, 0.0);
    vec4 offset2 = vec4(dir / -2. / aspectVec * thickness * currentProjected.w, 0.0, 0.0);
    gl_Position = currentProjected + offset + offset2;

    color = inputColor;
#else

    gl_Position = projectionMatrix * viewMatrix * floatVertex;

#ifdef WITH_INSTANCING
    // Move the vertex off-screen when hidden

    bool contained = false;

    for (int i = 0; i < int(numContainedInstances); ++i) {
        if ((containedInstances[i] == uint(gl_InstanceID))) {
            contained = true;
            break;
        }
    }

    if (contained == (containedMeansHidden == uint(1))) {
        gl_Position = vec4(-10., -10., -10., -10.);
        return;
    }
#endif    

#ifdef WITH_PICKING
#ifdef WITH_INSTANCING
    color = instancePickColors;
#else
    color = vertexPickColor;
#endif
#else
#ifdef WITH_LINES
	// Line rendering color
	color = vec4(0.3, 0.3, 0.3, 1);
#else
    vec3 viewNormal = normalize(viewNormalMatrix * floatNormal);
    // This does not seem to work, I think the "abs" results in the model being dark on 2 sides, and being light on the other 2 sides
//    float lambert1 = abs(dot(floatNormal, normalize(lightData.dir)));
    float lambert2 = max(dot(-viewNormal, normalize(lightData.dir)), 0.0);
//    color = vec4((lambert1 * 0.85 + lambert2 * 0.2 + 0.3) * floatColor.rgb, floatColor.a);
    color = vec4((lambert2 * 0.7 + 0.3) * floatColor.rgb, floatColor.a);
//    color = floatColor;
#endif
#endif

#endif

    worldCoords = floatVertex.xyz;
}
`