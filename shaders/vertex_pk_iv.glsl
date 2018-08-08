#version 300 es

precision mediump int;
precision mediump float;

in ivec3 vertexPosition;
in uvec2 vertexPickColor;

uniform mat4 vertexQuantizationMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

flat out mediump uvec2 color;

void main(void) {

  vec4 floatVertex = vertexQuantizationMatrix * vec4(float(vertexPosition.x), float(vertexPosition.y), float(vertexPosition.z), 1);
  
  gl_Position = projectionMatrix * viewMatrix * floatVertex;
  color = vertexPickColor;
}