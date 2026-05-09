/* AYN Landing — CardNav + TargetCursor + DarkVeil + Interactions */
/* Non-module script — DarkVeil uses raw WebGL fallback */

(function() {
  'use strict';

  // ═══ DarkVeil WebGL Background (inline, no OGL dependency) ═══
  const DarkVeil = (() => {
    const vert = `attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`;
    // Simplified organic dark shader (no CPPN, pure GLSL for compatibility)
    const frag = `
precision mediump float;
uniform vec2 uR;uniform float uT;
#define PI 3.14159265
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p*=2.;a*=.5;}return v;}
void main(){
  vec2 uv=gl_FragCoord.xy/uR;
  float t=uT*.15;
  vec2 p=uv*3.;
  float f1=fbm(p+vec2(t*.7,t*.3));
  float f2=fbm(p+vec2(f1*1.5+t*.2,f1*1.2-t*.1));
  float f3=fbm(p+vec2(f2*2.+t*.1,f2*1.8+t*.15));
  vec3 c1=vec3(.04,.04,.07);
  vec3 c2=vec3(.02,.03,.06);
  vec3 c3=vec3(.06,.08,.12);
  vec3 c4=vec3(.03,.05,.08);
  vec3 col=mix(c1,c2,f1);
  col=mix(col,c3,f2*.7);
  col=mix(col,c4,f3*.5);
  col+=vec3(.01,.02,.03)*sin(uv.x*PI*2.+t);
  float vig=1.-length((uv-.5)*1.5);
  col*=smoothstep(0.,.7,vig);
  gl_FragColor=vec4(col,1.);
}`;

    function init() {
      const canvas = document.getElementById('darkveil-canvas');
      if (!canvas) return;
      const parent = canvas.parentElement;
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return;

      function mkShader(type, src) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; }
        return s;
      }

      const vs = mkShader(gl.VERTEX_SHADER, vert);
      const fs = mkShader(gl.FRAGMENT_SHADER, frag);
      if (!vs || !fs) return;

      const pg = gl.createProgram();
      gl.attachShader(pg, vs);
      gl.attachShader(pg, fs);
      gl.linkProgram(pg);
      if (!gl.getProgramParameter(pg, gl.LINK_STATUS)) return;
      gl.useProgram(pg);

      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,-1,3,3,-1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(pg, 'p');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

      const uR = gl.getUniformLocation(pg, 'uR');
      const uT = gl.getUniformLocation(pg, 'uT');

      function resize() {
        const w = parent.clientWidth, h = parent.clientHeight;
        canvas.width = w * Math.min(devicePixelRatio, 2);
        canvas.height = h * Math.min(devicePixelRatio, 2);
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        gl.viewport(0, 0, canvas.width, canvas.height);
      }
      addEventListener('resize', resize);
      resize();

      const t0 = performance.now();
      (function loop() {
        gl.uniform2f(uR, canvas.width, canvas.height);
        gl.uniform1f(uT, (performance.now() - t0) / 1000);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        requestAnimationFrame(loop);
      })();
    }

    return { init };
  })();

  // ═══ LightRays WebGL Overlay (React Bits port — raw WebGL) ═══
  const LightRays = (() => {
    // Config — tune these for the AYN aesthetic
    const CFG = {
      origin: 'top-center',
      color: [0.25, 0.85, 0.95],  // Cyan-teal rays for contrast against dark base
      speed: 0.8,
      spread: 0.8,
      rayLength: 2.2,
      fadeDistance: 1.5,
      saturation: 0.85,
      mouseInfluence: 0.08,
      noiseAmount: 0.05,
      distortion: 0.03,
      pulsating: true
    };

    const vert = `attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`;

    const frag = `precision highp float;
uniform float iTime;
uniform vec2  iResolution;
uniform vec2  rayPos;
uniform vec2  rayDir;
uniform vec3  raysColor;
uniform float raysSpeed;
uniform float lightSpread;
uniform float rayLength;
uniform float pulsating;
uniform float fadeDistance;
uniform float saturation;
uniform vec2  mousePos;
uniform float mouseInfluence;
uniform float noiseAmount;
uniform float distortion;

float noise(vec2 st){
  return fract(sin(dot(st.xy,vec2(12.9898,78.233)))*43758.5453123);
}

float rayStrength(vec2 raySource,vec2 rayRefDir,vec2 coord,
                  float seedA,float seedB,float speed){
  vec2 sourceToCoord=coord-raySource;
  vec2 dirNorm=normalize(sourceToCoord);
  float cosAngle=dot(dirNorm,rayRefDir);
  float distortedAngle=cosAngle+distortion*sin(iTime*2.+length(sourceToCoord)*0.01)*0.2;
  float spreadFactor=pow(max(distortedAngle,0.),1./max(lightSpread,0.001));
  float distance=length(sourceToCoord);
  float maxDist=iResolution.x*rayLength;
  float lengthFalloff=clamp((maxDist-distance)/maxDist,0.,1.);
  float fadeFalloff=clamp((iResolution.x*fadeDistance-distance)/(iResolution.x*fadeDistance),0.5,1.);
  float pulse=pulsating>0.5?(0.8+0.2*sin(iTime*speed*3.)):1.;
  float baseStrength=clamp(
    (0.45+0.15*sin(distortedAngle*seedA+iTime*speed))+
    (0.3+0.2*cos(-distortedAngle*seedB+iTime*speed)),
    0.,1.
  );
  return baseStrength*lengthFalloff*fadeFalloff*spreadFactor*pulse;
}

void main(){
  vec2 coord=vec2(gl_FragCoord.x,iResolution.y-gl_FragCoord.y);
  vec2 finalRayDir=rayDir;
  if(mouseInfluence>0.){
    vec2 mouseScreenPos=mousePos*iResolution.xy;
    vec2 mouseDirection=normalize(mouseScreenPos-rayPos);
    finalRayDir=normalize(mix(rayDir,mouseDirection,mouseInfluence));
  }
  vec4 rays1=vec4(1.)*rayStrength(rayPos,finalRayDir,coord,36.2214,21.11349,1.5*raysSpeed);
  vec4 rays2=vec4(1.)*rayStrength(rayPos,finalRayDir,coord,22.3991,18.0234,1.1*raysSpeed);
  vec4 fragColor=rays1*0.5+rays2*0.4;
  if(noiseAmount>0.){
    float n=noise(coord*0.01+iTime*0.1);
    fragColor.rgb*=(1.-noiseAmount+noiseAmount*n);
  }
  float brightness=1.-(coord.y/iResolution.y);
  fragColor.x*=0.1+brightness*0.8;
  fragColor.y*=0.3+brightness*0.6;
  fragColor.z*=0.5+brightness*0.5;
  if(saturation!=1.){
    float gray=dot(fragColor.rgb,vec3(0.299,0.587,0.114));
    fragColor.rgb=mix(vec3(gray),fragColor.rgb,saturation);
  }
  fragColor.rgb*=raysColor;
  gl_FragColor=fragColor;
}`;

    // Get anchor position and direction based on origin
    function getAnchorAndDir(origin, w, h) {
      const out = 0.2;
      switch (origin) {
        case 'top-left':     return { a: [0, -out * h], d: [0, 1] };
        case 'top-right':    return { a: [w, -out * h], d: [0, 1] };
        case 'left':         return { a: [-out * w, 0.5 * h], d: [1, 0] };
        case 'right':        return { a: [(1 + out) * w, 0.5 * h], d: [-1, 0] };
        case 'bottom-left':  return { a: [0, (1 + out) * h], d: [0, -1] };
        case 'bottom-center':return { a: [0.5 * w, (1 + out) * h], d: [0, -1] };
        case 'bottom-right': return { a: [w, (1 + out) * h], d: [0, -1] };
        default:             return { a: [0.5 * w, -out * h], d: [0, 1] }; // top-center
      }
    }

    // Smooth mouse tracking
    let mouse = { x: 0.5, y: 0.5 };
    let smoothMouse = { x: 0.5, y: 0.5 };

    function init() {
      const canvas = document.getElementById('lightrays-canvas');
      if (!canvas) return;
      const parent = canvas.parentElement;
      const gl = canvas.getContext('webgl', { alpha: true }) || canvas.getContext('experimental-webgl', { alpha: true });
      if (!gl) return;

      // Enable blending for transparent background
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      function mkShader(type, src) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn('LightRays:', gl.getShaderInfoLog(s)); return null; }
        return s;
      }

      const vs = mkShader(gl.VERTEX_SHADER, vert);
      const fs = mkShader(gl.FRAGMENT_SHADER, frag);
      if (!vs || !fs) return;

      const pg = gl.createProgram();
      gl.attachShader(pg, vs);
      gl.attachShader(pg, fs);
      gl.linkProgram(pg);
      if (!gl.getProgramParameter(pg, gl.LINK_STATUS)) return;
      gl.useProgram(pg);

      // Fullscreen triangle
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 3, 3, -1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(pg, 'p');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

      // Uniform locations
      const u = {};
      ['iTime', 'iResolution', 'rayPos', 'rayDir', 'raysColor', 'raysSpeed',
       'lightSpread', 'rayLength', 'pulsating', 'fadeDistance', 'saturation',
       'mousePos', 'mouseInfluence', 'noiseAmount', 'distortion'].forEach(
        name => u[name] = gl.getUniformLocation(pg, name)
      );

      // Mouse tracking
      window.addEventListener('mousemove', e => {
        const rect = parent.getBoundingClientRect();
        mouse.x = (e.clientX - rect.left) / rect.width;
        mouse.y = (e.clientY - rect.top) / rect.height;
      });

      function resize() {
        const w = parent.clientWidth, h = parent.clientHeight;
        const dpr = Math.min(devicePixelRatio, 2);
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        gl.viewport(0, 0, canvas.width, canvas.height);
      }
      addEventListener('resize', resize);
      resize();

      const t0 = performance.now();
      (function loop() {
        const t = (performance.now() - t0) / 1000;
        const w = canvas.width, h = canvas.height;
        const { a, d } = getAnchorAndDir(CFG.origin, w, h);

        // Smooth mouse
        smoothMouse.x += (mouse.x - smoothMouse.x) * 0.08;
        smoothMouse.y += (mouse.y - smoothMouse.y) * 0.08;

        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.uniform1f(u.iTime, t);
        gl.uniform2f(u.iResolution, w, h);
        gl.uniform2f(u.rayPos, a[0], a[1]);
        gl.uniform2f(u.rayDir, d[0], d[1]);
        gl.uniform3f(u.raysColor, CFG.color[0], CFG.color[1], CFG.color[2]);
        gl.uniform1f(u.raysSpeed, CFG.speed);
        gl.uniform1f(u.lightSpread, CFG.spread);
        gl.uniform1f(u.rayLength, CFG.rayLength);
        gl.uniform1f(u.pulsating, CFG.pulsating ? 1.0 : 0.0);
        gl.uniform1f(u.fadeDistance, CFG.fadeDistance);
        gl.uniform1f(u.saturation, CFG.saturation);
        gl.uniform2f(u.mousePos, smoothMouse.x, smoothMouse.y);
        gl.uniform1f(u.mouseInfluence, CFG.mouseInfluence);
        gl.uniform1f(u.noiseAmount, CFG.noiseAmount);
        gl.uniform1f(u.distortion, CFG.distortion);

        gl.drawArrays(gl.TRIANGLES, 0, 3);
        requestAnimationFrame(loop);
      })();
    }

    return { init };
  })();

  // ═══ CardNav (React Bits port) ═══
  const CardNav = (() => {
    let isExpanded = false;
    function init() {
      const nav = document.getElementById('card-nav');
      const hamburger = document.getElementById('hamburger');
      if (!nav || !hamburger || typeof gsap === 'undefined') return;
      const cards = nav.querySelectorAll('.nav-card');
      gsap.set(nav, { height: 60, overflow: 'hidden' });
      gsap.set(cards, { y: 50, opacity: 0 });
      hamburger.addEventListener('click', () => {
        if (!isExpanded) {
          isExpanded = true;
          hamburger.classList.add('open');
          nav.classList.add('open');
          const h = calcH(nav);
          gsap.timeline()
            .to(nav, { height: h, duration: 0.4, ease: 'power3.out' })
            .to(cards, { y: 0, opacity: 1, duration: 0.4, ease: 'power3.out', stagger: 0.08 }, '-=0.1');
        } else {
          isExpanded = false;
          hamburger.classList.remove('open');
          gsap.timeline({ onComplete: () => nav.classList.remove('open') })
            .to(cards, { y: 50, opacity: 0, duration: 0.3, ease: 'power3.in', stagger: 0.05 })
            .to(nav, { height: 60, duration: 0.35, ease: 'power3.in' }, '-=0.15');
        }
      });
      nav.querySelectorAll('.nav-card-link').forEach(l =>
        l.addEventListener('click', () => { if (isExpanded) hamburger.click(); })
      );
      window.addEventListener('resize', () => { if (isExpanded) gsap.set(nav, { height: calcH(nav) }); });
    }
    function calcH(nav) {
      if (window.innerWidth <= 768) {
        const c = nav.querySelector('.card-nav-content');
        if (c) {
          const sv = [c.style.visibility, c.style.pointerEvents, c.style.position, c.style.height];
          c.style.visibility='visible';c.style.pointerEvents='auto';c.style.position='static';c.style.height='auto';
          c.offsetHeight;
          const h = 60 + c.scrollHeight + 16;
          c.style.visibility=sv[0];c.style.pointerEvents=sv[1];c.style.position=sv[2];c.style.height=sv[3];
          return h;
        }
      }
      return 260;
    }
    return { init };
  })();

  // ═══ TargetCursor (React Bits port) ═══
  const TargetCursor = (() => {
    const CFG = { sel: '.cursor-target', spin: 2, hover: 0.2, bw: 3, cs: 12 };
    const mob = (() => {
      const t = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      return (t && window.innerWidth <= 768) || /android|iphone|ipad/i.test(navigator.userAgent);
    })();
    if (mob) return { init: () => {} };

    let cursor, dot, corners, spinTl = null, activeTarget = null, curLeave = null, resumeT = null, tgtPos = null;
    let str = { current: 0 };

    function init() {
      cursor = document.getElementById('target-cursor');
      if (!cursor || typeof gsap === 'undefined') return;
      dot = cursor.querySelector('.target-cursor-dot');
      corners = cursor.querySelectorAll('.target-cursor-corner');
      gsap.set(cursor, { xPercent: -50, yPercent: -50, x: innerWidth / 2, y: innerHeight / 2 });
      mkSpin();
      addEventListener('mousemove', e => gsap.to(cursor, { x: e.clientX, y: e.clientY, duration: .1, ease: 'power3.out' }));
      addEventListener('mousedown', () => { gsap.to(dot, { scale: .7, duration: .3 }); gsap.to(cursor, { scale: .9, duration: .2 }); });
      addEventListener('mouseup', () => { gsap.to(dot, { scale: 1, duration: .3 }); gsap.to(cursor, { scale: 1, duration: .2 }); });
      addEventListener('mouseover', onEnter, { passive: true });
      addEventListener('scroll', onScroll, { passive: true });
    }

    function mkSpin() {
      if (spinTl) spinTl.kill();
      spinTl = gsap.timeline({ repeat: -1 }).to(cursor, { rotation: '+=360', duration: CFG.spin, ease: 'none' });
    }

    function tickFn() {
      if (!tgtPos || !cursor) return;
      const s = str.current; if (!s) return;
      const cx = gsap.getProperty(cursor, 'x'), cy = gsap.getProperty(cursor, 'y');
      corners.forEach((c, i) => {
        const x = gsap.getProperty(c, 'x') || 0, y = gsap.getProperty(c, 'y') || 0;
        const tx = tgtPos[i].x - cx, ty = tgtPos[i].y - cy;
        const d = s >= .99 ? .2 : .05;
        gsap.to(c, { x: x + (tx - x) * s, y: y + (ty - y) * s, duration: d, ease: d === 0 ? 'none' : 'power1.out', overwrite: 'auto' });
      });
    }

    function onEnter(e) {
      let t = e.target;
      while (t && t !== document.body) { if (t.matches && t.matches(CFG.sel)) break; t = t.parentElement; }
      if (!t || t === document.body || !cursor) return;
      if (activeTarget === t) return;
      if (activeTarget && curLeave) activeTarget.removeEventListener('mouseleave', curLeave);
      if (resumeT) { clearTimeout(resumeT); resumeT = null; }

      activeTarget = t;
      corners.forEach(c => gsap.killTweensOf(c));
      gsap.killTweensOf(cursor, 'rotation');
      if (spinTl) spinTl.pause();
      gsap.set(cursor, { rotation: 0 });

      const r = t.getBoundingClientRect();
      const cx = gsap.getProperty(cursor, 'x'), cy = gsap.getProperty(cursor, 'y');
      tgtPos = [
        { x: r.left - CFG.bw, y: r.top - CFG.bw },
        { x: r.right + CFG.bw - CFG.cs, y: r.top - CFG.bw },
        { x: r.right + CFG.bw - CFG.cs, y: r.bottom + CFG.bw - CFG.cs },
        { x: r.left - CFG.bw, y: r.bottom + CFG.bw - CFG.cs }
      ];

      gsap.ticker.add(tickFn);
      gsap.to(str, { current: 1, duration: CFG.hover, ease: 'power2.out' });
      corners.forEach((c, i) => gsap.to(c, { x: tgtPos[i].x - cx, y: tgtPos[i].y - cy, duration: .2, ease: 'power2.out' }));

      const leave = () => {
        gsap.ticker.remove(tickFn); tgtPos = null;
        gsap.set(str, { current: 0, overwrite: true }); activeTarget = null;
        const p = [{ x: -CFG.cs * 1.5, y: -CFG.cs * 1.5 }, { x: CFG.cs * .5, y: -CFG.cs * 1.5 },
                   { x: CFG.cs * .5, y: CFG.cs * .5 }, { x: -CFG.cs * 1.5, y: CFG.cs * .5 }];
        const tl = gsap.timeline();
        corners.forEach((c, i) => tl.to(c, { x: p[i].x, y: p[i].y, duration: .3, ease: 'power3.out' }, 0));
        resumeT = setTimeout(() => { if (!activeTarget && cursor) mkSpin(); resumeT = null; }, 50);
        t.removeEventListener('mouseleave', leave); curLeave = null;
      };
      curLeave = leave;
      t.addEventListener('mouseleave', leave);
    }

    function onScroll() {
      if (!activeTarget || !cursor) return;
      const mx = gsap.getProperty(cursor, 'x'), my = gsap.getProperty(cursor, 'y');
      const el = document.elementFromPoint(mx, my);
      if (!el || (el !== activeTarget && (!el.closest || el.closest(CFG.sel) !== activeTarget)))
        if (curLeave) curLeave();
    }

    return { init };
  })();

  // ═══ SpotlightCard glow ═══
  document.querySelectorAll('[data-tilt]').forEach(c => {
    c.addEventListener('mousemove', e => {
      const r = c.getBoundingClientRect();
      c.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      c.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
  });

  // ═══ Scroll Reveal ═══
  const obs = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) e.target.classList.add('visible');
  }), { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
  document.querySelectorAll('.reveal').forEach(el => obs.observe(el));

  // ═══ Speed Counter ═══
  const spd = document.getElementById('speed-counter');
  let counted = false;
  if (spd) new IntersectionObserver(es => {
    if (es[0].isIntersecting && !counted) {
      counted = true;
      const t0 = performance.now();
      (function u(n) {
        const p = Math.min((n - t0) / 1500, 1);
        spd.textContent = Math.round(30 * (1 - Math.pow(1 - p, 3))) + '+';
        if (p < 1) requestAnimationFrame(u);
      })(t0);
    }
  }, { threshold: .5 }).observe(spd);

  // ═══ Smooth Scroll ═══
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const t = document.querySelector(a.getAttribute('href'));
      if (t) { e.preventDefault(); t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
  });
  const dl = document.getElementById('dl-btn');
  if (dl) dl.addEventListener('click', () => console.log('[AYN] APK download', new Date().toISOString()));

  // ═══ Boot ═══
  function boot() {
    DarkVeil.init();
    LightRays.init();
    CardNav.init();
    TargetCursor.init();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
