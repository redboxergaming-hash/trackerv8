import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { constants, freeFallNoDrag, simulateFall, type Params } from './simulation';

type FormState = Params;

const defaults: FormState = {
  dt: 0.01,
  m: 100,
  A: 1,
  cw: 0.5,
  rho: 1.23,
  y0: 3000,
  v0: 0,
  duration: 5,
};

function App() {
  const [params, setParams] = useState<FormState>(defaults);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(() => simulateFall(defaults));

  const sampledData = showAll ? data : data.filter((_, i) => i % 10 === 0 || i === data.length - 1);
  const final = data[data.length - 1];
  const maxSpeedPoint = useMemo(() => data.reduce((acc, cur) => (Math.abs(cur.v) > Math.abs(acc.v) ? cur : acc), data[0]), [data]);

  const tCompare = Math.min(5, params.duration);
  const freeFall = freeFallNoDrag(tCompare, params.y0);
  const dragDelta = Math.abs(final.v - freeFall.v);

  const handleChange = (key: keyof FormState, value: string) => {
    setParams((prev) => ({ ...prev, [key]: Number(value) }));
  };

  const validate = () => {
    if (params.dt <= 0) return 'dt muss größer als 0 sein.';
    if (params.m <= 0) return 'Masse m muss größer als 0 sein.';
    if (params.A <= 0) return 'Fläche A muss größer als 0 sein.';
    if (params.cw < 0 || params.rho <= 0) return 'c_w muss >= 0 und rho > 0 sein.';
    if (params.duration <= 0) return 'Simulationsdauer muss größer als 0 sein.';
    return '';
  };

  const run = () => {
    const e = validate();
    setError(e);
    if (e) return;
    setData(simulateFall(params));
  };

  const exportCsv = () => {
    const rows = ['t,F,a,v,y', ...data.map((d) => `${d.t},${d.F},${d.a},${d.v},${d.y}`)];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'fallsimulation.csv';
    a.click();
  };

  const copyData = async () => {
    await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
  };

  return (
    <main className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <h1 className="text-2xl md:text-4xl font-bold text-sky-800">Methode der kleinen Schritte – Freier Fall mit Luftwiderstand</h1>
      <section className="bg-white rounded-xl shadow p-4 border border-slate-200">
        Die Bewegung wird in kleine Zeitabschnitte zerlegt. Für jeden Schritt werden Kraft, Beschleunigung,
        Geschwindigkeit und Höhe neu berechnet. So entsteht eine numerische Näherung der realen Fallbewegung.
      </section>

      <section className="grid md:grid-cols-4 gap-3 bg-white rounded-xl p-4 shadow border border-slate-200">
        {Object.entries(params).map(([k, v]) => (
          <label key={k} className="text-sm flex flex-col gap-1">
            <span className="font-medium">{k}</span>
            <input className="border rounded px-3 py-2" type="number" value={v} onChange={(e) => handleChange(k as keyof FormState, e.target.value)} />
          </label>
        ))}
        <div className="md:col-span-4 flex flex-wrap gap-3 items-center">
          <button onClick={run} className="bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-lg font-semibold">Simulation berechnen</button>
          <button onClick={exportCsv} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg">CSV exportieren</button>
          <button onClick={copyData} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg">Daten kopieren</button>
          <button onClick={() => {
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'fallsimulation.json';
            a.click();
          }} className="bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded-lg">Als JSON exportieren</button>
          {error && <span className="text-red-600 font-medium">{error}</span>}
        </div>
      </section>

      <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[['Geschwindigkeit', `${final.v.toFixed(3)} m/s`], ['Höhe', `${final.y.toFixed(3)} m`], ['Beschleunigung', `${final.a.toFixed(3)} m/s²`], ['Resultierende Kraft', `${final.F.toFixed(3)} N`], ['Max. Geschwindigkeit', `${maxSpeedPoint.v.toFixed(3)} m/s`], ['Zeitpunkt max. v', `${maxSpeedPoint.t.toFixed(2)} s`]].map(([title, value]) => (
          <article key={title} className="bg-white rounded-xl shadow p-4 border border-slate-200">
            <h3 className="text-sm text-slate-500">{title}</h3>
            <p className="text-xl font-bold text-sky-800">{value}</p>
          </article>
        ))}
      </section>

      <section className="bg-white rounded-xl shadow p-4 border border-slate-200">
        <h2 className="font-semibold mb-2">Vergleich: Freier Fall ohne Luftwiderstand (t = {tCompare.toFixed(2)} s)</h2>
        <p>v ohne Luftwiderstand: <strong>{freeFall.v.toFixed(3)} m/s</strong></p>
        <p>y ohne Luftwiderstand: <strong>{freeFall.y.toFixed(3)} m</strong></p>
        <p className="mt-2 text-slate-700">Bewertung: {dragDelta > 3 ? 'Der Luftwiderstand ist bereits deutlich bemerkbar.' : 'Der Luftwiderstand ist nach 5 s noch eher gering.'}</p>
      </section>

      <section className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow p-4 border border-slate-200 h-80"><h2 className="font-semibold">t-v-Diagramm</h2><ResponsiveContainer width="100%" height="90%"><LineChart data={sampledData}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="t" unit="s"/><YAxis unit="m/s"/><Tooltip/><Line type="monotone" dataKey="v" stroke="#0284c7" dot={false}/></LineChart></ResponsiveContainer></div>
        <div className="bg-white rounded-xl shadow p-4 border border-slate-200 h-80"><h2 className="font-semibold">t-y-Diagramm</h2><ResponsiveContainer width="100%" height="90%"><LineChart data={sampledData}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="t" unit="s"/><YAxis unit="m"/><Tooltip/><Line type="monotone" dataKey="y" stroke="#16a34a" dot={false}/></LineChart></ResponsiveContainer></div>
      </section>

      <section className="bg-white rounded-xl shadow border border-slate-200 overflow-hidden">
        <div className="p-3 flex justify-between items-center"><h2 className="font-semibold">Wertetabelle</h2><label className="text-sm"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="mr-2"/>Alle Werte anzeigen</label></div>
        <div className="max-h-96 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-sky-100 sticky top-0"><tr><th className="p-2">t [s]</th><th>F [N]</th><th>a [m/s²]</th><th>v [m/s]</th><th>y [m]</th></tr></thead>
            <tbody>{sampledData.map((d, i) => <tr key={i} className="odd:bg-slate-50"><td className="p-2">{d.t.toFixed(2)}</td><td>{d.F.toFixed(2)}</td><td>{d.a.toFixed(3)}</td><td>{d.v.toFixed(3)}</td><td>{d.y.toFixed(3)}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <footer className="text-xs text-slate-500">Konstanten: g = {constants.g} m/s²</footer>
    </main>
  );
}

export default App;
