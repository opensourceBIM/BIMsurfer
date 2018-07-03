#version 300 es

precision mediump int;
precision mediump float;

uniform LightData {
	vec3 lightPosition;
	vec3 lightColor;
	vec3 ambientColor;
	float shininess;
} lightData;

in mediump vec3 vertex;
in mediump vec4 color;
in mediump vec3 normal;

out vec4 myOutputColor;

void main(void) {
  mediump vec3 to_light;
  mediump vec3 vertex_normal;
  mediump vec3 reflection;
  mediump vec3 to_camera;
  mediump float cos_angle;
  mediump vec3 diffuse_color;
  mediump vec3 specular_color;
  mediump vec3 ambient_color;

  // Calculate the ambient color as a percentage of the surface color
  ambient_color = lightData.ambientColor * vec3(color);

  // Calculate a vector from the fragment location to the light source
  to_light = lightData.lightPosition - vertex;
  to_light = normalize( to_light );

  // The vertex's normal vector is being interpolated across the primitive
  // which can make it un-normalized. So normalize the vertex's normal vector.
  vertex_normal = normalize( normal );

  // Calculate the cosine of the angle between the vertex's normal vector
  // and the vector going to the light.
  cos_angle = dot(vertex_normal, to_light);
  cos_angle = clamp(cos_angle, 0.0, 1.0);

  // Scale the color of this fragment based on its angle to the light.
  diffuse_color = vec3(color) * cos_angle;

  // Calculate the reflection vector
  reflection = 2.0 * dot(vertex_normal,to_light) * vertex_normal - to_light;

  // Calculate a vector from the fragment location to the camera.
  // The camera is at the origin, so negating the vertex location gives the vector
  to_camera = -1.0 * vertex;

  // Calculate the cosine of the angle between the reflection vector
  // and the vector going to the camera.
  reflection = normalize( reflection );
  to_camera = normalize( to_camera );
  cos_angle = dot(reflection, to_camera);
  cos_angle = clamp(cos_angle, 0.0, 1.0);
  cos_angle = pow(cos_angle, lightData.shininess);

  // The specular color is from the light source, not the object
  if (cos_angle > 0.0) {
    specular_color = lightData.lightColor * cos_angle;
    diffuse_color = diffuse_color * (1.0 - cos_angle);
  } else {
    specular_color = vec3(0.0, 0.0, 0.0);
  }

  myOutputColor = vec4(ambient_color + diffuse_color + specular_color, color.a);
}