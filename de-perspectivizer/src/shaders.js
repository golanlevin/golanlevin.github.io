// Screen-filling triangles are expressed directly in clip coordinates.
export const vertexShader = `
precision highp float;
attribute vec3 aPosition;
void main() { gl_Position = vec4(aPosition.xy, 0.0, 1.0); }
`;

export const fragmentShader = `
precision highp float;
uniform sampler2D uFrame;
uniform mat3 uInverseHomography;
uniform vec2 uSourceSize;
uniform vec2 uCanvasSize;
uniform vec2 uDrawingBufferSize;
void main() {
  // Fragment coordinates use physical pixels; the homography uses panel pixels.
  vec2 panelUV = gl_FragCoord.xy / uDrawingBufferSize;
  vec2 destination = vec2(panelUV.x, 1.0 - panelUV.y) * uCanvasSize;
  vec3 source = uInverseHomography * vec3(destination, 1.0);
  vec2 uv = source.xy / source.z / uSourceSize;
  if (source.z <= 0.0 || uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    gl_FragColor = vec4(0.055, 0.067, 0.080, 1.0);
  } else {
    gl_FragColor = vec4(texture2D(uFrame, uv).rgb, 1.0);
  }
}
`;
