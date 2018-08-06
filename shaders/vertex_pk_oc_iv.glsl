#version 300 es

precision mediump int;
precision mediump float;

in ivec3 vertexPosition;
in vec4 vertexPickColor;

uniform mat4 vertexQuantizationMatrix;
uniform vec4 objectPickColor;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

out mediump vec4 color;

void main(void) {

  vec4 floatVertex = vertexQuantizationMatrix * vec4(float(vertexPosition.x), float(vertexPosition.y), float(vertexPosition.z), 1);

  gl_Position = projectionMatrix * viewMatrix * floatVertex;
  color = objectPickColor + vertexPickColor;
}