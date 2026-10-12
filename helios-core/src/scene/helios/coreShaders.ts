/**
 * GLSL for the stellar core. The look comes from stacking cheap layers,
 * not from marching a volume: an opaque heart, two additive turbulence shells,
 * a haze shell, filament tubes, a halo, and a fresnel glass envelope.
 */

/** Ashima Arts simplex noise (MIT), plus a small fBm on top. */
const NOISE = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0)) +
    i.y + vec4(0.0, i1.y, i2.y, 1.0)) +
    i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

float fbm(vec3 p) {
  float amp = 0.5;
  float sum = 0.0;
  for (int i = 0; i < OCTAVES; i++) {
    sum += amp * snoise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 4.1);
    amp *= 0.5;
  }
  return sum;
}

// Deep amber, orange-gold, pale yellow, white-hot.
vec3 stellar(float h) {
  vec3 c = mix(vec3(0.85, 0.19, 0.02), vec3(1.0, 0.45, 0.07), smoothstep(0.0, 0.35, h));
  c = mix(c, vec3(1.0, 0.79, 0.4), smoothstep(0.3, 0.72, h));
  return mix(c, vec3(1.0, 0.96, 0.86), smoothstep(0.72, 1.0, h));
}
`

const OUTPUT = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`

export const surfaceVertex = /* glsl */ `
varying vec3 vObj;
varying vec3 vWorld;
varying vec3 vNormalW;
void main() {
  vObj = position;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

const SURFACE_HEAD = /* glsl */ `
uniform float uTime;
uniform float uEnergy;
varying vec3 vObj;
varying vec3 vWorld;
varying vec3 vNormalW;
`

/** The compact, opaque, white-hot centre. */
export const heartFragment = /* glsl */ `
${SURFACE_HEAD}
${NOISE}
void main() {
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vWorld);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  vec3 p = normalize(vObj);
  float cell = fbm(p * 3.4 + vec3(0.0, uTime * 0.22, uTime * 0.15));
  float gran = snoise(p * 11.0 + vec3(uTime * 0.5, 0.0, -uTime * 0.37));
  float heat = clamp(0.6 + 0.42 * cell + 0.13 * gran, 0.0, 1.0);
  vec3 col = stellar(0.3 + 0.7 * heat);
  float safe = max(ndv, 0.0001);
  float limb = 0.45 + 0.55 * pow(safe, 0.6);
  // Cool cells stay near 1.0 so the granulation survives tone mapping; only the hot ones burn out.
  col = col * (0.5 + 2.3 * heat * heat) * limb + vec3(1.0, 0.97, 0.9) * pow(safe, 5.0) * 0.7;
  gl_FragColor = vec4(col * (0.015 + uEnergy), 1.0);
  ${OUTPUT}
}
`

/** Additive turbulence shell. Bright along the zero crossings of warped noise, which reads as filaments. */
export const plasmaFragment = /* glsl */ `
${SURFACE_HEAD}
uniform float uScale;
uniform float uSpeed;
uniform float uGain;
uniform float uFalloff;
uniform float uSharp;
uniform float uFade;
${NOISE}
void main() {
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vWorld);
  float ndv = abs(dot(N, V));
  float t = uTime * uSpeed;
  vec3 q = normalize(vObj) * uScale + vec3(0.0, t * 0.35, t * 0.2);
  vec3 warp = vec3(
    snoise(q + vec3(0.0, 0.0, t * 0.4)),
    snoise(q + vec3(5.2, 1.3, -t * 0.3)),
    snoise(q + vec3(-3.1, 7.7, t * 0.25)));
  float n = fbm(q + warp * 0.55);
  float filament = pow(clamp(1.0 - abs(n) * 1.9, 0.0, 1.0), uSharp);
  float cloud = smoothstep(-0.2, 0.7, n);
  float density = mix(cloud * 0.5, filament, 0.62);
  // Fade toward the silhouette so the shell never shows its edge.
  float body = pow(max(ndv, 0.0001), uFalloff);
  float heat = clamp(density * (0.5 + 0.55 * uEnergy), 0.0, 1.0);
  vec3 col = stellar(heat) * density * body * uGain * (0.02 + uEnergy) * uFade;
  gl_FragColor = vec4(col, 1.0);
  ${OUTPUT}
}
`

/** Soft amber haze that fills the sphere between the turbulence and the glass. */
export const hazeFragment = /* glsl */ `
${SURFACE_HEAD}
uniform float uGain;
uniform float uFade;
${NOISE}
void main() {
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vWorld);
  float ndv = abs(dot(N, V));
  float n = snoise(normalize(vObj) * 1.7 + vec3(0.0, uTime * 0.11, uTime * 0.07));
  float body = pow(max(ndv, 0.0001), 1.9);
  vec3 col = mix(vec3(1.0, 0.33, 0.04), vec3(1.0, 0.6, 0.18), body) * body * (0.82 + 0.18 * n);
  gl_FragColor = vec4(col * uGain * (0.02 + uEnergy) * uFade, 1.0);
  ${OUTPUT}
}
`

/**
 * Containment glass. Transmission would hide the additive plasma behind it,
 * so this is a fresnel shell with two procedural softbox reflections instead.
 */
export const glassFragment = /* glsl */ `
uniform float uEnergy;
uniform float uSide;
uniform float uOpacity;
varying vec3 vObj;
varying vec3 vWorld;
varying vec3 vNormalW;

float softbox(vec3 R, vec3 L, vec2 halfSize, float soft) {
  float d = dot(R, L);
  if (d <= 0.001) return 0.0;
  vec3 x = normalize(cross(vec3(0.0, 1.0, 0.0), L));
  vec3 y = cross(L, x);
  vec2 p = vec2(dot(R, x), dot(R, y)) / d;
  // smoothstep with edge0 > edge1 is undefined in GLSL, so invert an ordered one.
  vec2 q = 1.0 - smoothstep(halfSize - soft, halfSize + soft, abs(p));
  return q.x * q.y;
}

void main() {
  vec3 N = normalize(vNormalW) * uSide;
  vec3 V = normalize(cameraPosition - vWorld);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fresnel = pow(max(1.0 - ndv, 0.0001), 2.6);
  vec3 R = reflect(-V, N);

  // Wide feathered edges: a hard-edged rectangle on a sphere reads as a glitch, not a softbox.
  float key = softbox(R, normalize(vec3(0.52, 0.72, 0.46)), vec2(0.3, 0.2), 0.16);
  float rim = softbox(R, normalize(vec3(-0.62, 0.4, -0.68)), vec2(0.1, 0.5), 0.12);
  float top = softbox(R, normalize(vec3(-0.1, 0.98, 0.15)), vec2(0.5, 0.12), 0.14);
  // The inner surface only catches a ghost of the key.
  float glint = (key * 0.8 + rim * 0.55 + top * 0.3) * (uSide > 0.0 ? 1.0 : 0.1);

  vec3 amber = vec3(1.0, 0.52, 0.12);
  // The glass edge glows with light scattered out of the core.
  vec3 col = amber * fresnel * (0.25 + 0.95 * uEnergy);
  col += vec3(1.0, 0.9, 0.76) * glint * 1.15;
  float alpha = clamp(0.035 + fresnel * 0.6 + glint * 0.6, 0.0, 1.0) * uOpacity;
  gl_FragColor = vec4(col, alpha);
  ${OUTPUT}
}
`

export const haloVertex = /* glsl */ `
uniform float uSize;
varying vec2 vUv;
void main() {
  vUv = uv * 2.0 - 1.0;
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xy += position.xy * uSize;
  gl_Position = projectionMatrix * mv;
}
`

export const haloFragment = /* glsl */ `
uniform float uEnergy;
uniform float uGain;
varying vec2 vUv;
void main() {
  float r = length(vUv);
  float glow = exp(-r * r * 7.0) * 0.55 + exp(-r * r * 30.0) * 0.5;
  glow *= 1.0 - smoothstep(0.55, 1.0, r);
  vec3 col = mix(vec3(1.0, 0.38, 0.06), vec3(1.0, 0.72, 0.32), exp(-r * r * 12.0));
  gl_FragColor = vec4(col * glow * uGain * uEnergy, 1.0);
  ${OUTPUT}
}
`

export const filamentVertex = /* glsl */ `
attribute float aSeed;
varying vec2 vUv;
varying float vSeed;
void main() {
  vUv = uv;
  vSeed = aSeed;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

/** Prominence-like arcs: a bright pulse travels along each tube, and each one comes and goes. */
export const filamentFragment = /* glsl */ `
uniform float uTime;
uniform float uEnergy;
uniform float uGain;
varying vec2 vUv;
varying float vSeed;
${NOISE}
void main() {
  // Clamp before the fractional pow. Under MSAA the varying is extrapolated past
  // the tube ends, sin() goes a hair negative, and pow() of a negative is NaN:
  // one such pixel is enough for bloom to black out the whole frame.
  float along = clamp(vUv.x, 0.0, 1.0);
  float ends = pow(max(sin(3.14159265 * along), 0.0), 0.7);
  float t = uTime * (0.32 + 0.24 * vSeed) + vSeed * 17.0;
  float travel = 0.5 + 0.5 * sin(6.2831853 * (along * 1.4 - t));
  float flicker = 0.68 + 0.32 * snoise(vec3(along * 3.0, t * 1.6, vSeed * 9.0));
  float life = smoothstep(0.12, 0.62, 0.5 + 0.5 * sin(t * 0.55 + vSeed * 40.0));
  float intensity = ends * (0.16 + 0.84 * travel * travel) * flicker * life;
  vec3 col = mix(vec3(1.0, 0.4, 0.07), vec3(1.0, 0.82, 0.5), travel * travel);
  gl_FragColor = vec4(col * intensity * uGain * (0.02 + uEnergy), 1.0);
  ${OUTPUT}
}
`
