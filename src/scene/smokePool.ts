import * as THREE from 'three';

/**
 * Fumaça / fuligem compartilhada: rastro das bolas de fogo, fuligem que
 * emerge das chamas das criaturas de fogo e a fumaça das fusões/explosões.
 * É um pool fixo (ring buffer) atualizado na CPU — sem alocação por frame.
 *
 * A renderização fica em <SmokeLayer/>; qualquer sistema pode criar
 * emissores chamando pool.spawn(...) (coordenadas de MUNDO).
 */

let smokeTexCache: THREE.Texture | null = null;
function smokeTexture(): THREE.Texture {
  if (smokeTexCache) return smokeTexCache;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const gr = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  gr.addColorStop(0, 'rgba(0,0,0,1)');
  gr.addColorStop(0.45, 'rgba(0,0,0,0.5)');
  gr.addColorStop(0.8, 'rgba(0,0,0,0.14)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, 64, 64);
  // marmorizado: clareia/escurece manchas pra fumaça não parecer bola lisa
  const img = ctx.getImageData(0, 0, 64, 64);
  let s = 0x2545f491;
  for (let i = 0; i < img.data.length; i += 4) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const n = ((s >>> 8) & 1023) / 1023 - 0.5; // -0.5..0.5
    const x = (i / 4) % 64;
    const y = Math.floor(i / 4 / 64);
    const w = Math.sin(x * 0.35 + y * 0.11) * Math.cos(y * 0.31 - x * 0.07);
    const a = img.data[i + 3];
    img.data[i + 3] = Math.max(0, Math.min(255, a * (1 + n * 0.5 + w * 0.28)));
  }
  ctx.putImageData(img, 0, 0);
  smokeTexCache = new THREE.CanvasTexture(c);
  return smokeTexCache;
}

export interface SmokeSpawn {
  /** velocidade inicial (mundo) */
  vx?: number;
  vy?: number;
  vz?: number;
  /** espalhamento posicional */
  jitter?: number;
  /** vida em segundos (e variação aleatória) */
  life?: number;
  lifeVar?: number;
  /** raio inicial em unidades de mundo (incha ~3x ao envelhecer) */
  size?: number;
  /** 0 = fuligem fria, 1 = brasa iluminada por dentro */
  heat?: number;
  /** deriva ascendente (gás quente) */
  rise?: number;
  /** arrasto do ar (maior = para mais rápido) */
  drag?: number;
}

const SMOKE_VERT = /* glsl */ `
attribute float aAge;   // 0 = recém-nascida, 1 = morrendo
attribute float aSize;  // raio base
attribute float aSeed;
attribute float aHeat;
uniform float uTime;
varying float vA;
varying vec3 vC;
void main() {
  float grow = aSize * mix(1.0, 3.1, aAge); // puff incha ao envelhecer
  float a = smoothstep(0.0, 0.12, aAge) * (1.0 - aAge) * (1.0 - aAge);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  // tremor sutil de corrente de ar (de graça, no GPU)
  mv.x += sin(uTime * 3.1 + aSeed * 21.7) * 0.05 * aAge;
  mv.y += cos(uTime * 2.4 + aSeed * 15.3) * 0.05 * aAge;
  gl_PointSize = grow * (2.0) * (300.0 / max(0.5, -mv.z));
  gl_Position = projectionMatrix * mv;
  vA = a;
  // brasa quente perto da chama → fuligem cinza-quente depois
  float heat = aHeat * (1.0 - smoothstep(0.0, 0.45, aAge));
  vC = mix(vec3(0.42, 0.38, 0.36), vec3(1.0, 0.5, 0.2), heat);
}
`;

const SMOKE_FRAG = /* glsl */ `
uniform sampler2D uMap;
varying float vA;
varying vec3 vC;
void main() {
  float m = texture2D(uMap, gl_PointCoord).a;
  float a = m * vA;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vC, a * 0.34);
}
`;

export class SmokePool {
  readonly geo: THREE.BufferGeometry;
  readonly mat: THREE.ShaderMaterial;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly drag: Float32Array;
  private readonly ageArr: Float32Array;
  private readonly sizeArr: Float32Array;
  private readonly seedArr: Float32Array;
  private readonly heatArr: Float32Array;
  private readonly posAttr: THREE.BufferAttribute;
  private readonly ageAttr: THREE.BufferAttribute;
  private readonly dynamicAttrs: THREE.BufferAttribute[];
  private cursor = 0;
  private readonly cap: number;

  constructor(cap = 600) {
    this.cap = cap;
    this.pos = new Float32Array(cap * 3);
    this.vel = new Float32Array(cap * 3);
    this.life = new Float32Array(cap);
    this.maxLife = new Float32Array(cap);
    this.drag = new Float32Array(cap);
    this.ageArr = new Float32Array(cap);
    this.sizeArr = new Float32Array(cap);
    this.seedArr = new Float32Array(cap);
    this.heatArr = new Float32Array(cap);
    for (let i = 0; i < cap; i++) {
      this.ageArr[i] = 1; // nascem "mortas" (invisíveis)
      this.pos[i * 3 + 1] = -50;
    }

    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.ageAttr = new THREE.BufferAttribute(this.ageArr, 1).setUsage(THREE.DynamicDrawUsage);
    const sizeAttr = new THREE.BufferAttribute(this.sizeArr, 1).setUsage(THREE.DynamicDrawUsage);
    const seedAttr = new THREE.BufferAttribute(this.seedArr, 1).setUsage(THREE.DynamicDrawUsage);
    const heatAttr = new THREE.BufferAttribute(this.heatArr, 1).setUsage(THREE.DynamicDrawUsage);

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', this.posAttr);
    this.geo.setAttribute('aAge', this.ageAttr);
    this.geo.setAttribute('aSize', sizeAttr);
    this.geo.setAttribute('aSeed', seedAttr);
    this.geo.setAttribute('aHeat', heatAttr);
    this.dynamicAttrs = [this.posAttr, this.ageAttr, sizeAttr, seedAttr, heatAttr];

    this.mat = new THREE.ShaderMaterial({
      vertexShader: SMOKE_VERT,
      fragmentShader: SMOKE_FRAG,
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 }, uMap: { value: smokeTexture() } },
    });
  }

  /** partículas vivas no momento (para orçamentos de emissão) */
  get aliveCount(): number {
    let n = 0;
    for (let i = 0; i < this.cap; i++) if (this.life[i] > 0) n++;
    return n;
  }

  spawn(x: number, y: number, z: number, o: SmokeSpawn = {}): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.cap;
    const j = o.jitter ?? 0.12;
    const p = i * 3;
    this.pos[p] = x + (Math.random() - 0.5) * j * 2;
    this.pos[p + 1] = y + (Math.random() - 0.5) * j * 2;
    this.pos[p + 2] = z + (Math.random() - 0.5) * j * 2;
    const life = (o.life ?? 0.7) * (1 + (Math.random() - 0.5) * (o.lifeVar ?? 0.6));
    this.life[i] = life;
    this.maxLife[i] = life;
    this.vel[p] = (o.vx ?? 0) + (Math.random() - 0.5) * 0.35;
    this.vel[p + 1] = (o.vy ?? 0) + (Math.random() - 0.5) * 0.3;
    this.vel[p + 2] = (o.vz ?? 0) + (Math.random() - 0.5) * 0.35;
    this.drag[i] = o.drag ?? 3.2;
    this.sizeArr[i] = (o.size ?? 0.08) * (0.8 + Math.random() * 0.45);
    this.seedArr[i] = Math.random();
    this.heatArr[i] = o.heat ?? 0;
  }

  /** física + buffers (chamar uma única vez por frame) */
  update(dt: number, time: number): void {
    this.mat.uniforms.uTime.value = time;
    const { pos, vel, life, maxLife, drag, ageArr } = this;
    for (let i = 0; i < this.cap; i++) {
      if (life[i] <= 0) {
        if (ageArr[i] !== 1) ageArr[i] = 1;
        continue;
      }
      life[i] -= dt;
      const o = i * 3;
      const d = 1 - Math.min(0.9, drag[i] * dt);
      vel[o] *= d;
      vel[o + 2] *= d;
      vel[o + 1] = vel[o + 1] * d + 0.5 * dt; // fumaça quente sobe
      pos[o] += vel[o] * dt;
      pos[o + 1] += vel[o + 1] * dt;
      pos[o + 2] += vel[o + 2] * dt;
      ageArr[i] = life[i] <= 0 ? 1 : 1 - life[i] / maxLife[i];
    }
    for (const a of this.dynamicAttrs) a.needsUpdate = true;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}
