// Ripple Grid background using OGL (vanilla JS version)
// Creates a full-bleed animated grid with ripple and optional mouse interaction

(function () {
  const { Renderer, Program, Triangle, Mesh } = require('ogl');

  function hexToRgbArr(hex) {
    const res = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return res
      ? [parseInt(res[1], 16) / 255, parseInt(res[2], 16) / 255, parseInt(res[3], 16) / 255]
      : [1, 1, 1];
  }

  function initRippleGrid(options = {}) {
    const opts = Object.assign(
      {
        enableRainbow: false,
        gridColor: '#ffffff',
        rippleIntensity: 0.05,
        gridSize: 10.0,
        gridThickness: 15.0,
        fadeDistance: 1.5,
        vignetteStrength: 2.0,
        glowIntensity: 0.1,
        opacity: 0.8,
        gridRotation: 0,
        mouseInteraction: true,
        mouseInteractionRadius: 1.2,
        containerSelector: '#ripple-grid'
      },
      options
    );

    const container = document.querySelector(opts.containerSelector);
    if (!container) return null;

    // Ensure container is styled to cover the window
    container.style.position = 'fixed';
    container.style.inset = '0';
    container.style.zIndex = '0';
    container.style.pointerEvents = 'none';
    container.style.overflow = 'hidden';

    const renderer = new Renderer({ dpr: Math.min(window.devicePixelRatio, 2), alpha: true });
    const gl = renderer.gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.canvas.style.width = '100%';
    gl.canvas.style.height = '100%';
    container.appendChild(gl.canvas);

    const vert = `
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

    const frag = `precision highp float;
uniform float iTime;
uniform vec2 iResolution;
uniform bool enableRainbow;
uniform vec3 gridColor;
uniform float rippleIntensity;
uniform float gridSize;
uniform float gridThickness;
uniform float fadeDistance;
uniform float vignetteStrength;
uniform float glowIntensity;
uniform float opacity;
uniform float gridRotation;
uniform bool mouseInteraction;
uniform vec2 mousePosition;
uniform float mouseInfluence;
uniform float mouseInteractionRadius;
varying vec2 vUv;

float pi = 3.141592;

mat2 rotate(float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return mat2(c, -s, s, c);
}

void main() {
  vec2 uv = vUv * 2.0 - 1.0;
  uv.x *= iResolution.x / iResolution.y;

  if (gridRotation != 0.0) {
    uv = rotate(gridRotation * pi / 180.0) * uv;
  }

  float dist = length(uv);
  float func = sin(pi * (iTime - dist));
  vec2 rippleUv = uv + uv * func * rippleIntensity;

  if (mouseInteraction && mouseInfluence > 0.0) {
    vec2 mouseUv = (mousePosition * 2.0 - 1.0);
    mouseUv.x *= iResolution.x / iResolution.y;
    float mouseDist = length(uv - mouseUv);
    float influence = mouseInfluence * exp(-mouseDist * mouseDist / (mouseInteractionRadius * mouseInteractionRadius));
    float mouseWave = sin(pi * (iTime * 2.0 - mouseDist * 3.0)) * influence;
    rippleUv += normalize(uv - mouseUv) * mouseWave * rippleIntensity * 0.3;
  }

  vec2 a = sin(gridSize * 0.5 * pi * rippleUv - pi / 2.0);
  vec2 b = abs(a);

  float aaWidth = 0.5;
  vec2 smoothB = vec2(
    smoothstep(0.0, aaWidth, b.x),
    smoothstep(0.0, aaWidth, b.y)
  );

  vec3 color = vec3(0.0);
  color += exp(-gridThickness * smoothB.x * (0.8 + 0.5 * sin(pi * iTime)));
  color += exp(-gridThickness * smoothB.y);
  color += 0.5 * exp(-(gridThickness / 4.0) * sin(smoothB.x));
  color += 0.5 * exp(-(gridThickness / 3.0) * smoothB.y);

  if (glowIntensity > 0.0) {
    color += glowIntensity * exp(-gridThickness * 0.5 * smoothB.x);
    color += glowIntensity * exp(-gridThickness * 0.5 * smoothB.y);
  }

  float ddd = exp(-2.0 * clamp(pow(dist, fadeDistance), 0.0, 1.0));
  vec2 vignetteCoords = vUv - 0.5;
  float vignetteDistance = length(vignetteCoords);
  float vignette = 1.0 - pow(vignetteDistance * 2.0, vignetteStrength);
  vignette = clamp(vignette, 0.0, 1.0);

  vec3 t;
  if (enableRainbow) {
    t = vec3(
      uv.x * 0.5 + 0.5 * sin(iTime),
      uv.y * 0.5 + 0.5 * cos(iTime),
      pow(cos(iTime), 4.0)
    ) + 0.5;
  } else {
    t = gridColor;
  }

  float finalFade = ddd * vignette;
  float alpha = length(color) * finalFade * opacity;
  gl_FragColor = vec4(color * t * finalFade * opacity, alpha);
}`;

    const uniforms = {
      iTime: { value: 0 },
      iResolution: { value: [1, 1] },
      enableRainbow: { value: !!opts.enableRainbow },
      gridColor: { value: hexToRgbArr(opts.gridColor) },
      rippleIntensity: { value: opts.rippleIntensity },
      gridSize: { value: opts.gridSize },
      gridThickness: { value: opts.gridThickness },
      fadeDistance: { value: opts.fadeDistance },
      vignetteStrength: { value: opts.vignetteStrength },
      glowIntensity: { value: opts.glowIntensity },
      opacity: { value: opts.opacity },
      gridRotation: { value: opts.gridRotation },
      mouseInteraction: { value: !!opts.mouseInteraction },
      mousePosition: { value: [0.5, 0.5] },
      mouseInfluence: { value: 0 },
      mouseInteractionRadius: { value: opts.mouseInteractionRadius }
    };

    const geometry = new Triangle(gl);
    const program = new Program(gl, { vertex: vert, fragment: frag, uniforms });
    const mesh = new Mesh(gl, { geometry, program });

    function resize() {
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w, h);
      uniforms.iResolution.value = [w, h];
    }

    const mouse = { x: 0.5, y: 0.5 };
    const targetMouse = { x: 0.5, y: 0.5 };
    let targetInfluence = 0;

    function onMouseMove(e) {
      if (!uniforms.mouseInteraction.value) return;
      const rect = container.getBoundingClientRect();
      targetMouse.x = (e.clientX - rect.left) / rect.width;
      targetMouse.y = 1.0 - (e.clientY - rect.top) / rect.height;
    }
    function onMouseEnter() { if (uniforms.mouseInteraction.value) targetInfluence = 1.0; }
    function onMouseLeave() { if (uniforms.mouseInteraction.value) targetInfluence = 0.0; }

    window.addEventListener('resize', resize);
    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mouseenter', onMouseEnter);
    container.addEventListener('mouseleave', onMouseLeave);
    resize();

    let rafId = 0;
    function render(t) {
      uniforms.iTime.value = t * 0.001;
      const lerp = 0.1;
      mouse.x += (targetMouse.x - mouse.x) * lerp;
      mouse.y += (targetMouse.y - mouse.y) * lerp;
      uniforms.mousePosition.value = [mouse.x, mouse.y];
      uniforms.mouseInfluence.value += (targetInfluence - uniforms.mouseInfluence.value) * 0.05;

      renderer.render({ scene: mesh });
      rafId = requestAnimationFrame(render);
    }
    rafId = requestAnimationFrame(render);

    function destroy() {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      container.removeEventListener('mousemove', onMouseMove);
      container.removeEventListener('mouseenter', onMouseEnter);
      container.removeEventListener('mouseleave', onMouseLeave);
      renderer.gl.getExtension('WEBGL_lose_context')?.loseContext();
      container.contains(gl.canvas) && container.removeChild(gl.canvas);
    }

    return { destroy, uniforms };
  }

  // Expose globally
  window.initRippleGrid = initRippleGrid;
})();

