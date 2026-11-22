import * as THREE from 'three';

export function createCanvasTexture(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  repeatX = 1,
  repeatY = 1,
  maxAnisotropy = 4
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  draw(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;
  return texture;
}

export function createRadialShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 60);
  grad.addColorStop(0, 'rgba(0,0,0,0.65)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.28)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createVoxelCheckerTexture(
  colorA: string,
  colorB: string,
  gridSize = 8,
  repeatX = 1,
  repeatY = 1,
  anisotropy = 4
): THREE.CanvasTexture {
  return createCanvasTexture(
    128,
    128,
    (ctx, w, h) => {
      const cellW = w / gridSize;
      const cellH = h / gridSize;
      for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
          ctx.fillStyle = (x + y) % 2 === 0 ? colorA : colorB;
          ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
        }
      }
    },
    repeatX,
    repeatY,
    anisotropy
  );
}

export function createCopacabanaTexture(anisotropy = 4): THREE.CanvasTexture {
  return createCanvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#0f172a';
      for (let row = 0; row < 4; row++) {
        ctx.beginPath();
        const baseY = row * 64 + 16;
        ctx.moveTo(0, baseY);
        for (let x = 0; x <= w; x += 16) {
          ctx.lineTo(x, baseY + Math.sin((x / w) * Math.PI * 2) * 16);
        }
        for (let x = w; x >= 0; x -= 16) {
          ctx.lineTo(x, baseY + 24 + Math.sin((x / w) * Math.PI * 2) * 16);
        }
        ctx.closePath();
        ctx.fill();
      }
    },
    1,
    6,
    anisotropy
  );
}

export function createTrackRoadTexture(
  laneBg: string,
  stripeColor: string,
  dividerColor: string,
  anisotropy = 4
): THREE.CanvasTexture {
  return createCanvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = laneBg;
      ctx.fillRect(0, 0, w, h);
      // Subtle pixel noise blocks
      for (let i = 0; i < 160; i++) {
        ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.07)';
        ctx.fillRect((i * 37) % w, (i * 53) % h, 10, 10);
      }
      // Side curbs
      ctx.fillStyle = stripeColor;
      ctx.fillRect(0, 0, 12, h);
      ctx.fillRect(w - 12, 0, 12, h);
      // Lane dividers (3 lanes)
      ctx.fillStyle = dividerColor;
      const x1 = Math.floor(w / 3);
      const x2 = Math.floor((w * 2) / 3);
      for (let y = 0; y < h; y += 32) {
        ctx.fillRect(x1 - 3, y + 4, 6, 18);
        ctx.fillRect(x2 - 3, y + 4, 6, 18);
      }
    },
    1,
    8,
    anisotropy
  );
}

export function createTurfTexture(anisotropy = 4): THREE.CanvasTexture {
  return createCanvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#15803d';
      ctx.fillRect(0, 0, w, h);
      // Mow stripes
      ctx.fillStyle = '#16a34a';
      ctx.fillRect(0, 0, w, h / 2);
      // White chalk lines for 3 lanes
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(4, 0, 6, h);
      ctx.fillRect(w - 10, 0, 6, h);
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillRect(Math.floor(w / 3) - 2, 0, 4, h);
      ctx.fillRect(Math.floor((w * 2) / 3) - 2, 0, 4, h);
    },
    1,
    8,
    anisotropy
  );
}

export function createNeonRoadTexture(anisotropy = 4): THREE.CanvasTexture {
  return createCanvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ec4899';
      ctx.fillRect(0, 0, 10, h);
      ctx.fillStyle = '#06b6d4';
      ctx.fillRect(w - 10, 0, 10, h);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.75)';
      const x1 = Math.floor(w / 3);
      const x2 = Math.floor((w * 2) / 3);
      for (let y = 0; y < h; y += 32) {
        ctx.fillRect(x1 - 2, y + 4, 4, 20);
        ctx.fillRect(x2 - 2, y + 4, 4, 20);
      }
    },
    1,
    8,
    anisotropy
  );
}

export function createForestTrailTexture(anisotropy = 4): THREE.CanvasTexture {
  return createCanvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#78350f';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 180; i++) {
        ctx.fillStyle = i % 3 === 0 ? '#92400e' : '#65a30d';
        const px = (i * 41) % w;
        const py = (i * 67) % h;
        ctx.fillRect(px, py, i % 3 === 0 ? 14 : 6, 8);
      }
      // Subtle mossy lane edge
      ctx.fillStyle = '#4d7c0f';
      ctx.fillRect(0, 0, 18, h);
      ctx.fillRect(w - 18, 0, 18, h);
      ctx.fillStyle = 'rgba(254, 243, 199, 0.25)';
      ctx.fillRect(Math.floor(w / 3) - 2, 0, 4, h);
      ctx.fillRect(Math.floor((w * 2) / 3) - 2, 0, 4, h);
    },
    1,
    8,
    anisotropy
  );
}
