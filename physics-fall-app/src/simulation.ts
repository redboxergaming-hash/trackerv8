export type Params = {
  dt: number;
  m: number;
  A: number;
  cw: number;
  rho: number;
  y0: number;
  v0: number;
  duration: number;
};

export type Step = {
  t: number;
  F: number;
  a: number;
  v: number;
  y: number;
};

const g = 9.81;

export function simulateFall(params: Params): Step[] {
  const steps = Math.max(1, Math.floor(params.duration / params.dt));
  const data: Step[] = [];
  let t = 0;
  let v = params.v0;
  let y = params.y0;

  data.push({ t, F: -params.m * g + 0.5 * params.rho * params.cw * params.A * v ** 2, a: 0, v, y });

  for (let i = 0; i < steps; i += 1) {
    t += params.dt;
    // Resultierende Kraft: Gewicht (nach unten, negativ) + Luftwiderstand (nach oben)
    const F = -params.m * g + 0.5 * params.rho * params.cw * params.A * v ** 2;
    const a = F / params.m;
    v = v + a * params.dt;
    y = y + v * params.dt;
    data.push({ t, F, a, v, y });
    if (y <= 0) break;
  }

  return data;
}

export function freeFallNoDrag(t: number, y0: number) {
  return {
    v: -g * t,
    y: y0 - 0.5 * g * t ** 2,
  };
}

export const constants = { g };
