/* =========================================================================
   RIFTBOUND: CLASH PROTOCOL — 05 SHADERS
   Hand-written GLSL for the look, with a hard budget in mind: this has to run
   on a 4 GB integrated-GPU laptop, so every material here is a *replacement*
   for a built-in one, never an addition. No extra draw calls, no extra passes,
   one shared program, and all per-frame uniforms are shared objects so a single
   write per frame updates every material.

   three r158 notes:
     - outputColorSpace defaults to sRGB, so every fragment shader ends with
       <colorspace_fragment>; without it these materials render darker and more
       saturated than the built-in ones sitting next to them.
     - Color(hex) is converted sRGB -> linear by ColorManagement, so uniforms
       built from hex are already in the space the maths expects.
   ========================================================================= */
(function (root) {
  'use strict';
  var RB = root.RB;
  var T = root.THREE;

  var S = { enabled: true, time: 0 };

  /* Uniform objects shared by every material. Writing `.value` once updates
     all of them, so per-frame cost is O(1) rather than O(materials). */
  var U = {
    time: { value: 0 },
    light: { value: new T.Vector3(-0.45, 0.78, 0.44).normalize() },
    rim: { value: new T.Color(0xbfe6ff) },
    rimAmt: { value: 0.85 },
    /* Hemisphere ambient, in linear space. Without this the shader is lit only
       by the key, so anything facing away from it goes to the floor of the ramp
       and the whole stage reads as black silhouettes — which is exactly what
       happened the first time this was wired up. */
    ambTop: { value: new T.Color().setRGB(0.105, 0.135, 0.180) },
    ambBot: { value: new T.Color().setRGB(0.052, 0.042, 0.034) },
    /* Key colour matters as much as its strength: the foundry is lit by a warm
       forge and the temple by warm daylight, and a scalar-only key throws that
       away, leaving every arena looking like the same grey studio. */
    keyCol: { value: new T.Color(0xffffff) },
    keyAmt: { value: 0.80 }
  };

  /* ------------------------------------------------------------- character */
  /* Three-band toon ramp + fresnel rim. The ramp is what makes flat-shaded
     boxes read as designed shapes instead of untextured primitives; the rim
     separates a fighter from a busy stage without adding a light. */
  var CHAR_VERT = [
    'varying vec3 vN;',
    'varying vec3 vV;',
    'void main() {',
    '  vec4 wp = modelMatrix * vec4(position, 1.0);',
    '  vN = normalize(mat3(modelMatrix) * normal);',
    '  vV = normalize(cameraPosition - wp.xyz);',
    '  gl_Position = projectionMatrix * viewMatrix * wp;',
    '}'
  ].join('\n');

  var CHAR_FRAG = [
    'uniform vec3 uColor;',
    'uniform vec3 uLight;',
    'uniform vec3 uRim;',
    'uniform vec3 uEmit;',
    'uniform vec3 uAmbTop;',
    'uniform vec3 uAmbBot;',
    'uniform vec3 uKeyCol;',
    'uniform float uKeyAmt;',
    'uniform float uRimAmt;',
    'uniform float uSteps;',
    'uniform float uFlash;',
    'varying vec3 vN;',
    'varying vec3 vV;',
    'void main() {',
    '  vec3 n = normalize(vN);',
    '  vec3 v = normalize(vV);',
    '  float ndl = dot(n, normalize(uLight)) * 0.5 + 0.5;',
    /* Quantised ramp. Step count is a uniform so characters can take a hard
       3-step look while large stage geometry uses more steps — three bands over
       a wall-sized box reads as a flat slab, not as form. */
    '  float q = clamp(floor(ndl * uSteps) / max(1.0, uSteps - 1.0), 0.0, 1.0);',
    '  float band = mix(0.30, 1.0, q);',
    /* hemisphere ambient keeps unlit faces readable instead of black */
    '  vec3 amb = mix(uAmbBot, uAmbTop, clamp(n.y * 0.5 + 0.5, 0.0, 1.0));',
    '  vec3 col = uColor * (amb + band * uKeyCol * uKeyAmt);',
    '  float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 2.6);',
    '  col += uRim * fres * uRimAmt;',
    '  col += uEmit;',
    '  col += vec3(uFlash);',
    '  gl_FragColor = vec4(col, 1.0);',
    '  #include <colorspace_fragment>',
    '}'
  ].join('\n');

  /* Materials are NOT cached across rigs. Two fighters can share a palette (tag
     mode mirrors, same-character matches), and a shared material would flash
     both of them at once. The GPU program is still shared — three caches by
     shader source — so this costs a few objects, not a few compiles. */
  S.charMaterial = function (colorHex, rimAmt, emitHex, steps) {
    if (!S.enabled) {
      var lm = new T.MeshLambertMaterial({ color: colorHex });
      if (emitHex) lm.emissive = new T.Color(emitHex);
      return lm;
    }
    var m = new T.ShaderMaterial({
      uniforms: {
        uColor: { value: new T.Color(colorHex) },
        uEmit: { value: new T.Color(emitHex || 0x000000) },
        uFlash: { value: 0 },
        uLight: U.light,
        uRim: U.rim,
        uAmbTop: U.ambTop,
        uAmbBot: U.ambBot,
        uKeyCol: U.keyCol,
        uKeyAmt: U.keyAmt,
        uSteps: { value: steps || 3 },
        /* Characters follow the stage's rim strength; props pass an explicit,
           much lower value. Passing a per-material default here would silently
           override setLight() and leave the rim doing nothing. */
        uRimAmt: rimAmt == null ? U.rimAmt : { value: rimAmt }
      },
      vertexShader: CHAR_VERT,
      fragmentShader: CHAR_FRAG
    });
    m.userData.isToon = true;
    return m;
  };

  /* Stage props reuse the character shader with almost no rim — same program,
     so it costs nothing extra to compile, and the stage stops looking like a
     different renderer from the fighters. More steps because a wall-sized box
     needs more than three bands to read as a surface. */
  S.propMaterial = function (colorHex, rimAmt, emitHex) {
    return S.charMaterial(colorHex, rimAmt == null ? 0.10 : rimAmt, emitHex, 6);
  };

  /* ------------------------------------------------------------------ floor */
  /* One extra shader, one extra draw call: an energy grid that scrolls toward
     the camera. Deliberately avoids fwidth/derivatives (no extension needed,
     no per-pixel cost on weak GPUs) and fades with distance so it cannot alias
     into moire at the back of the stage. */
  var FLOOR_VERT = [
    'varying vec3 vW;',
    'varying vec2 vUv;',
    'void main() {',
    '  vec4 wp = modelMatrix * vec4(position, 1.0);',
    '  vW = wp.xyz;',
    '  vUv = uv;',
    '  gl_Position = projectionMatrix * viewMatrix * wp;',
    '}'
  ].join('\n');

  var FLOOR_FRAG = [
    'uniform vec3 uBase;',
    'uniform vec3 uLine;',
    'uniform float uTime;',
    'uniform vec2 uScale;',
    'varying vec3 vW;',
    'varying vec2 vUv;',
    'void main() {',
    '  vec2 p = vec2(vW.x, vW.z) * uScale;',
    '  p.y += uTime * 0.35;',
    '  vec2 f = abs(fract(p) - 0.5);',
    '  float line = smoothstep(0.045, 0.0, min(f.x, f.y));',
    /* travelling pulse band, cheap: one sin over world z */
    '  float pulse = 0.5 + 0.5 * sin(vW.z * 0.9 - uTime * 2.2);',
    '  float fade = smoothstep(26.0, 4.0, length(vW.xyz - cameraPosition));',
    '  vec3 col = uBase;',
    '  col += uLine * line * (0.10 + pulse * 0.14) * fade;',
    '  col += uLine * 0.022 * pulse * fade;',
    '  gl_FragColor = vec4(col, 1.0);',
    '  #include <colorspace_fragment>',
    '}'
  ].join('\n');

  S.floorMaterial = function (baseHex, lineHex, scale) {
    if (!S.enabled) {
      return new T.MeshLambertMaterial({ color: baseHex });
    }
    return new T.ShaderMaterial({
      uniforms: {
        uBase: { value: new T.Color(baseHex) },
        uLine: { value: new T.Color(lineHex) },
        uTime: U.time,
        uScale: { value: new T.Vector2(scale || 0.55, scale || 0.55) }
      },
      vertexShader: FLOOR_VERT,
      fragmentShader: FLOOR_FRAG
    });
  };

  /* -------------------------------------------------------------- lighting */
  /* Point the shared light at the stage's key light so characters keep matching
     the arena they are standing in. Called once per stage load.
     `amb` is [topR,topG,topB, botR,botG,botB] in linear space — a daylight arena
     needs a much stronger ambient than a night forge or it reads as black. */
  S.setLight = function (dirX, dirY, dirZ, rimHex, rimAmt, amb, keyHex) {
    U.light.value.set(dirX, dirY, dirZ).normalize();
    if (rimHex != null) U.rim.value.setHex(rimHex);
    if (rimAmt != null) U.rimAmt.value = rimAmt;
    if (keyHex != null) U.keyCol.value.setHex(keyHex);
    if (amb) {
      U.ambTop.value.setRGB(amb[0], amb[1], amb[2]);
      U.ambBot.value.setRGB(amb[3], amb[4], amb[5]);
    }
  };

  /* Single per-frame tick. Cheap enough to call unconditionally. */
  S.update = function (dt) {
    if (!S.enabled) return;
    S.time += dt;
    U.time.value = S.time;
  };

  /* ?lite=1 disables every custom shader and falls back to built-ins. Used as
     the escape hatch on very weak hardware, and by the test suite to prove the
     game still runs without the shader path. */
  S.setEnabled = function (on) {
    S.enabled = !!on;
  };

  RB.Shader = S;
})(typeof globalThis !== 'undefined' ? globalThis : this);
