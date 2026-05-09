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
  vec3 c1=vec3(.15,.05,.25);
  vec3 c2=vec3(.08,.02,.18);
  vec3 c3=vec3(.25,.08,.35);
  vec3 c4=vec3(.05,.08,.20);
  vec3 col=mix(c1,c2,f1);
  col=mix(col,c3,f2*.7);
  col=mix(col,c4,f3*.5);
  col+=vec3(.03,.01,.05)*sin(uv.x*PI*2.+t);
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
    CardNav.init();
    TargetCursor.init();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
