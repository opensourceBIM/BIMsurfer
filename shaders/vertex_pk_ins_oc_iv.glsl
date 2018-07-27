#version 300 es

precision mediump int;
precision mediump float;

in ivec3 vertexPosition;
in mat4 instances;

uniform mat4 vertexQuantizationMatrix;
uniform vec4 objectColor;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

out mediump vec4 color;

void main(void) {
  vec4 floatVertex = vec4(float(vertexPosition.x), float(vertexPosition.y), float(vertexPosition.z), 1);
  floatVertex = vertexQuantizationMatrix * floatVertex;

  gl_Position = projectionMatrix * viewMatrix * instances * floatVertex;

  color = objectColor;
}