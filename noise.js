// tiny open-simplex implementation for procedural chunks
// based on https://gist.github.com/patriciogonzalezvivo/670c22f3966e662d2f83
export function openSimplex(seed = 1) {
  const perm = new Uint8Array(512);
  for (let i = 0; i < 256; i++) {
    perm[i] = i;
  }
  let n = BigInt(seed);
  for (let i = 255; i >= 0; i--) {
    n = (n * 6364136223846793005n + 1442695040888963407n) & 0xffffffffn;
    const r = Number(n % BigInt(i + 1));
    [perm[i], perm[r]] = [perm[r], perm[i]];
    perm[i + 256] = perm[i];
  }

  const grad2 = [
    [1, 1], [-1, 1], [1, -1], [-1, -1],
    [1, 0], [-1, 0], [0, 1], [0, -1]
  ];

  function dot(g, x, y) { return g[0] * x + g[1] * y; }

  return function noise2D(xin, yin) {
    const F2 = 0.366025403;   // 0.5*(Math.sqrt(3)-1)
    const G2 = 0.211324865;   // (3-Math.sqrt(3))/6
    let n0 = 0, n1 = 0, n2 = 0;

    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const X0 = i - t;
    const Y0 = j - t;
    const x0 = xin - X0;
    const y0 = yin - Y0;

    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;

    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;

    const ii = i & 255;
    const jj = j & 255;

    const gi0 = perm[ii + perm[jj]] % 8;
    const gi1 = perm[ii + i1 + perm[jj + j1]] % 8;
    const gi2 = perm[ii + 1 + perm[jj + 1]] % 8;

    let t0 = 0.5 - x0*x0 - y0*y0;
    if (t0 >= 0) {
      t0 *= t0;
      n0 = t0 * t0 * dot(grad2[gi0], x0, y0);
    }
    let t1 = 0.5 - x1*x1 - y1*y1;
    if (t1 >= 0) {
      t1 *= t1;
      n1 = t1 * t1 * dot(grad2[gi1], x1, y1);
    }
    let t2 = 0.5 - x2*x2 - y2*y2;
    if (t2 >= 0) {
      t2 *= t2;
      n2 = t2 * t2 * dot(grad2[gi2], x2, y2);
    }
    return 70 * (n0 + n1 + n2);
  };
}
