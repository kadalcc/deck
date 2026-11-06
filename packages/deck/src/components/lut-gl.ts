import { type CubeLut, parseCube } from "./lut.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * GRADING ON THE GPU  —  a .cube LUT over an image or a video (WebGL2, loaded lazily)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The LUT is a 3D texture (RGB16F, linearly filtered: trilinear interpolation for free); one
 * full-screen triangle samples the picture, looks its colour up and mixes by `lutStrength`.
 *
 *   image   graded ONCE into a canvas, which becomes a blob URL the `<img>` shows, and the GL
 *           context is let go at once. Every copy of the slide (stage, presenter, overview,
 *           print) shares that one result, nothing holds a context, and print and the exports
 *           picture the graded image like any other.
 *   video   a canvas over the `<video>`, drawn each frame while it plays (one context per playing
 *           video, on the slide being shown only), and once after a seek or a pause.
 *
 * The picture must be readable by WebGL: same-origin, or served with CORS (the deck host's media
 * is). When it isn't, or there is no WebGL2, or the context is lost, the media shows ungraded.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const VERT = `#version 300 es
in vec2 p;
out vec2 uv;
void main() {
  uv = vec2(p.x + 1.0, 1.0 - p.y) * 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
precision highp sampler3D;
uniform sampler2D picture;
uniform sampler3D lut;
uniform float strength;
uniform float size;
uniform vec3 dmin;
uniform vec3 dmax;
in vec2 uv;
out vec4 color;
void main() {
  vec4 c = texture(picture, uv);
  vec3 x = clamp((c.rgb - dmin) / (dmax - dmin), 0.0, 1.0);
  vec3 g = texture(lut, x * ((size - 1.0) / size) + 0.5 / size).rgb;
  color = vec4(mix(c.rgb, g, strength), c.a);
}`;

/** One canvas's WebGL2 program with a LUT uploaded; `draw` grades a picture into the canvas. */
export class Grader {
  private gl: WebGL2RenderingContext;
  private picture: WebGLTexture;
  private strengthAt: WebGLUniformLocation | null;

  constructor(
    readonly canvas: HTMLCanvasElement,
    lut: CubeLut,
    strength: number,
  ) {
    const gl = canvas.getContext("webgl2", {
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
      antialias: false,
      depth: false,
      stencil: false,
    });
    if (!gl) throw new Error("WebGL2 is not available");
    this.gl = gl;
    const shader = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(s) ?? "shader");
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
    gl.bindAttribLocation(prog, 0, "p");
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(prog) ?? "program");
    gl.useProgram(prog);
    // One triangle that covers the viewport.
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, gl.createTexture());
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage3D(
      gl.TEXTURE_3D,
      0,
      gl.RGB16F,
      lut.size,
      lut.size,
      lut.size,
      0,
      gl.RGB,
      gl.FLOAT,
      lut.data,
    );
    for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R])
      gl.texParameteri(gl.TEXTURE_3D, p, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    gl.activeTexture(gl.TEXTURE0);
    this.picture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.picture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    gl.uniform1i(gl.getUniformLocation(prog, "picture"), 0);
    gl.uniform1i(gl.getUniformLocation(prog, "lut"), 1);
    gl.uniform1f(gl.getUniformLocation(prog, "size"), lut.size);
    gl.uniform3fv(gl.getUniformLocation(prog, "dmin"), lut.domainMin);
    gl.uniform3fv(gl.getUniformLocation(prog, "dmax"), lut.domainMax);
    this.strengthAt = gl.getUniformLocation(prog, "strength");
    gl.uniform1f(this.strengthAt, strength);
  }

  get lost(): boolean {
    return this.gl.isContextLost();
  }

  setStrength(strength: number) {
    this.gl.uniform1f(this.strengthAt, strength);
  }

  /** Grade one picture (an image, a video frame) into the canvas, at `width`×`height`. */
  draw(source: TexImageSource, width: number, height: number) {
    const { gl, canvas } = this;
    if (gl.isContextLost()) return;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.bindTexture(gl.TEXTURE_2D, this.picture);
    // A cross-origin picture without CORS throws here (SecurityError): the caller falls back.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Let the GPU context go now, rather than whenever the canvas is collected. */
  dispose() {
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}

// ── LUTs and graded images, each fetched and made once per page ─────────────────────────────

const luts = new Map<string, Promise<CubeLut>>();

/** The LUT at `url`, parsed; one request per address for the life of the page. */
export function loadLut(url: string): Promise<CubeLut> {
  let got = luts.get(url);
  if (!got) {
    got = fetch(url, { credentials: "omit" }).then(async (res) => {
      if (!res.ok) throw new Error(`${url}: ${res.status}`);
      return parseCube(await res.text());
    });
    got.catch(() => luts.delete(url));
    luts.set(url, got);
  }
  return got;
}

/** The longest side a graded image is drawn at (a slide is 1920 wide; a lightbox may zoom). */
const MAX_SIDE = 4096;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`${src}: the image did not load with CORS`));
    img.src = src;
  });
}

const graded = new Map<string, Promise<string>>();

/**
 * `src` graded by the LUT at `lut`, as a blob URL (WebP where the browser writes it, else PNG;
 * alpha kept). Cached per (image, LUT, strength): every copy of the slide shows the same result.
 */
export function gradeImage(src: string, lut: string, strength: number): Promise<string> {
  const key = `${src}\n${lut}\n${strength}`;
  let got = graded.get(key);
  if (!got) {
    got = Promise.all([loadImage(src), loadLut(lut)]).then(async ([img, cube]) => {
      const w0 = img.naturalWidth || img.width;
      const h0 = img.naturalHeight || img.height;
      const k = Math.min(1, MAX_SIDE / Math.max(w0, h0, 1));
      const w = Math.max(1, Math.round(w0 * k));
      const h = Math.max(1, Math.round(h0 * k));
      const canvas = document.createElement("canvas");
      const grader = new Grader(canvas, cube, strength);
      try {
        grader.draw(img, w, h);
        const blob = await new Promise<Blob | null>((res) =>
          canvas.toBlob(res, "image/webp", 0.95),
        );
        if (!blob) throw new Error("the graded image could not be encoded");
        return URL.createObjectURL(blob);
      } finally {
        grader.dispose();
      }
    });
    got.catch(() => graded.delete(key));
    graded.set(key, got);
  }
  return got;
}
