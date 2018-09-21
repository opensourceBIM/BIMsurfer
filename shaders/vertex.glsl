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
#ifdef WITH_QUANTIZENORMALS
in ivec3 vertexNormal;
#else
in vec3 vertexNormal;
#endif
#endif

#ifndef WITH_USEOBJECTCOLORS
#ifndef WITH_PICKING
#ifdef WITH_QUANTIZECOLORS
in uvec4 vertexColor;
#else
in vec4 vertexColor;
#endif
#endif
#endif

#ifdef WITH_INSTANCING
in mat4 instanceMatrices;
#ifndef WITH_PICKING
in mat3 instanceNormalMatrices;
#endif
#endif

#ifdef WITH_PICKING
#ifdef WITH_INSTANCING
in uvec2 instancePickColors;
#else
in uvec2 vertexPickColor;
#endif
flat out mediump uvec2 color;
out mediump float depth;
#else
uniform LightData {
	vec3 dir;
	vec3 color;
	vec3 ambientColor;
	float intensity;
} lightData;

out mediump vec4 color;
#endif

#ifdef WITH_USEOBJECTCOLORS
uniform vec4 objectColor;
#endif


#ifdef WITH_TRIANGLEPRIMITIVES
uniform mat4 matrix;
#endif

#ifdef WITH_LINEPRIMITIVES
uniform vec4 inputColor;
uniform mat4 matrix;
uniform float aspect;
uniform float thickness;
#else
uniform mat3 viewNormalMatrix;
#endif

uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

void main(void) {
#ifdef WITH_QUANTIZEVERTICES
    vec4 floatVertex = vertexQuantizationMatrix * vec4(float(vertexPosition.x), float(vertexPosition.y), float(vertexPosition.z), 1);
#else
    vec4 floatVertex = vec4(vertexPosition, 1);
#endif

#ifndef WITH_PICKING
#ifdef WITH_QUANTIZENORMALS
    vec3 floatNormal = vec3(float(vertexNormal.x) / 127.0, float(vertexNormal.y) / 127.0, float(vertexNormal.z) / 127.0);
#else
    vec3 floatNormal = vertexNormal;
#endif
#endif

#ifdef WITH_USEOBJECTCOLORS
    vec4 floatColor = objectColor;
#else
#ifndef WITH_PICKING
#ifdef WITH_QUANTIZECOLORS
    vec4 floatColor = vec4(float(vertexColor.x) / 255.0, float(vertexColor.y) / 255.0, float(vertexColor.z) / 255.0, float(vertexColor.w) / 255.0);
#else
    vec4 floatColor = vertexColor;
#endif
#endif
#endif

#ifdef WITH_INSTANCING
    floatVertex = instanceMatrices * floatVertex;
#ifndef WITH_PICKING
    floatNormal = instanceNormalMatrices * floatNormal;
#endif
#endif

#ifdef WITH_LINEPRIMITIVES
    // tfk: todo: line matrix could be same as instanceMatrix?
    color = inputColor;
    vec2 aspectVec = vec2(aspect, 1.0);
    mat4 projViewModel = projectionMatrix * viewMatrix * matrix;
    vec4 currentProjected = projViewModel * floatVertex;
    vec2 currentScreen = currentProjected.xy / currentProjected.w * aspectVec;

#ifdef WITH_QUANTIZEVERTICES
    vec4 nextVertexPositionFloat = vertexQuantizationMatrix * vec4(float(nextVertexPosition.x), float(nextVertexPosition.y), float(nextVertexPosition.z), 1);
#else
    vec4 nextVertexPositionFloat = vec4(nextVertexPosition, 1);
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

#ifdef WITH_TRIANGLEPRIMITIVES
    gl_Position = projectionMatrix * viewMatrix * matrix * floatVertex;
#else
    gl_Position = projectionMatrix * viewMatrix * floatVertex;
#endif


#ifdef WITH_PICKING
#ifdef WITH_INSTANCING
    color.rg = instancePickColors;
#else
    color.rg = vertexPickColor;
#endif
    depth = gl_Position.z / gl_Position.w;
#else
    vec3 viewNormal = normalize(viewNormalMatrix * floatNormal);
    float lambertian = max(dot(-viewNormal, normalize(lightData.dir)), 0.0);
    color = vec4(lambertian * floatColor.rgb, floatColor.a);
#endif

#endif

}