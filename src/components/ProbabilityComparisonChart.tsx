import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  Cell,
  ReferenceLine,
} from 'recharts';
import { OptionCalculation, ConfidenceLevel } from '../lib/quantEngine';
import { BarChart3, TrendingUp, CheckCircle2, AlertCircle } from 'lucide-react';

interface ProbabilityComparisonChartProps {
  options: OptionCalculation[];
  confidence: ConfidenceLevel;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
  options: OptionCalculation[];
  minThreshold: number;
}

const CustomTooltip: React.FC<CustomTooltipProps> = ({
  active,
  payload,
  label,
  options,
  minThreshold,
}) => {
  if (!active || !payload || !payload.length) return null;

  const currentOption = options.find((o) => o.name === label);
  if (!currentOption) return null;

  const exceedsThreshold =
    currentOption.evPercent >= minThreshold && currentOption.confidence !== 'BAJA';
  const isPositiveEv = currentOption.evPercent > 0;

  return (
    <div className="bg-slate-950 border border-slate-700/80 rounded-lg p-3 shadow-xl text-xs font-mono space-y-2 z-50 min-w-[220px]">
      <div className="font-sans font-bold text-white text-sm border-b border-slate-800 pb-1 flex items-center justify-between">
        <span>{label}</span>
        <span className="text-emerald-400 font-mono">@{currentOption.odd.toFixed(2)}</span>
      </div>

      <div className="space-y-1 text-slate-300">
        <div className="flex justify-between items-center">
          <span className="text-slate-400">Prob. Implícita (Casa):</span>
          <span className="text-slate-200 font-bold">{currentOption.impliedProb.toFixed(2)}%</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-slate-400">Prob. Justa (Desmargenada):</span>
          <span className="text-slate-300">{currentOption.fairProb.toFixed(2)}%</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-slate-400">Prob. Estimada (Modelo):</span>
          <span className="text-cyan-300 font-bold">{currentOption.estimatedProb.toFixed(2)}%</span>
        </div>
        <div className="flex justify-between items-center border-t border-slate-800/80 pt-1">
          <span className="text-slate-400">Ventaja vs Implícita:</span>
          <span
            className={`font-bold ${
              currentOption.estimatedProb >= currentOption.impliedProb
                ? 'text-emerald-400'
                : 'text-rose-400'
            }`}
          >
            {currentOption.estimatedProb >= currentOption.impliedProb ? '+' : ''}
            {(currentOption.estimatedProb - currentOption.impliedProb).toFixed(2)}%
          </span>
        </div>
      </div>

      <div className="border-t border-slate-800/80 pt-1.5 flex items-center justify-between">
        <span className="text-slate-400">Valor Esperado (EV):</span>
        <span
          className={`font-bold text-sm ${
            exceedsThreshold
              ? 'text-emerald-400'
              : isPositiveEv
              ? 'text-amber-400'
              : 'text-rose-400'
          }`}
        >
          {currentOption.evPercent >= 0 ? '+' : ''}
          {currentOption.evPercent.toFixed(2)}%
        </span>
      </div>

      <div className="pt-1">
        <span
          className={`text-[10px] font-sans font-semibold px-2 py-0.5 rounded block text-center ${
            exceedsThreshold
              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
              : isPositiveEv
              ? 'bg-amber-950 text-amber-300 border border-amber-800'
              : 'bg-rose-950 text-rose-300 border border-rose-800'
          }`}
        >
          {exceedsThreshold
            ? `✓ Supera Umbral EV+ (${minThreshold.toFixed(1)}%)`
            : isPositiveEv
            ? `⚠ EV positivo pero < Umbral (${minThreshold.toFixed(1)}%)`
            : '✕ Sin Valor Esperado Positivo'}
        </span>
      </div>
    </div>
  );
};

export const ProbabilityComparisonChart: React.FC<ProbabilityComparisonChartProps> = ({
  options,
  confidence,
}) => {
  const minThreshold = confidence === 'ALTA' ? 3.0 : confidence === 'MEDIA' ? 5.0 : 999;

  // Prepare chart data
  const data = options.map((opt) => {
    const exceedsThreshold = opt.evPercent >= minThreshold && opt.confidence !== 'BAJA';
    const isPositiveEv = opt.evPercent > 0;

    return {
      name: opt.name,
      odd: opt.odd,
      impliedProb: opt.impliedProb,
      estimatedProb: opt.estimatedProb,
      fairProb: opt.fairProb,
      evPercent: opt.evPercent,
      exceedsThreshold,
      isPositiveEv,
    };
  });

  const valuePicksCount = data.filter((d) => d.exceedsThreshold).length;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-slate-800 gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <BarChart3 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <span>Comparativa Visual: Probabilidad Implícita vs Estimada</span>
              {valuePicksCount > 0 && (
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold">
                  {valuePicksCount} con Valor EV+
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-400">
              Las barras de estimación resaltadas en verde identifican selecciones con valor esperado positivo sobre el umbral de seguridad ({minThreshold === 999 ? 'N/A' : `≥ ${minThreshold.toFixed(1)}%`}).
            </p>
          </div>
        </div>

        {/* Legend pills */}
        <div className="flex items-center gap-2 text-[11px] font-mono flex-wrap">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300">
            <span className="w-2.5 h-2.5 rounded-sm bg-slate-600 inline-block" />
            <span>Prob. Implícita</span>
          </div>

          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-950/40 border border-emerald-800/80 text-emerald-300">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block shadow-sm shadow-emerald-500/50" />
            <span>Estimada (EV+ Válido)</span>
          </div>

          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-950 border border-slate-800 text-slate-400">
            <span className="w-2.5 h-2.5 rounded-sm bg-slate-500 inline-block" />
            <span>Estimada (Sin Valor)</span>
          </div>
        </div>
      </div>

      {/* Recharts Bar Chart Container */}
      <div className="w-full h-72 pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 20, right: 30, left: 0, bottom: 25 }}
            barGap={6}
            barCategoryGap={20}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis
              dataKey="name"
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: '#334155' }}
              interval={0}
              tick={{ fill: '#cbd5e1' }}
            />
            <YAxis
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: '#334155' }}
              tickFormatter={(v) => `${v}%`}
              domain={[0, (dataMax: number) => Math.min(100, Math.ceil((dataMax + 10) / 10) * 10)]}
            />
            <Tooltip
              content={<CustomTooltip options={options} minThreshold={minThreshold} />}
              cursor={{ fill: 'rgba(51, 65, 85, 0.2)' }}
            />

            {/* Implied Probability Bar (Neutral slate-600) */}
            <Bar
              dataKey="impliedProb"
              name="Probabilidad Implícita (Casa)"
              fill="#475569"
              radius={[4, 4, 0, 0]}
              maxBarSize={45}
            />

            {/* Estimated Probability Bar with Dynamic Highlighting */}
            <Bar
              dataKey="estimatedProb"
              name="Probabilidad Estimada"
              radius={[4, 4, 0, 0]}
              maxBarSize={45}
            >
              {data.map((entry, index) => {
                let barColor = '#64748b'; // default neutral
                if (entry.exceedsThreshold) {
                  barColor = '#10b981'; // Green for EV+ exceeding threshold
                } else if (entry.isPositiveEv) {
                  barColor = '#f59e0b'; // Amber for positive but below threshold
                } else {
                  barColor = '#475569'; // Slate for negative EV
                }
                return (
                  <Cell
                    key={`cell-${index}`}
                    fill={barColor}
                    stroke={entry.exceedsThreshold ? '#34d399' : undefined}
                    strokeWidth={entry.exceedsThreshold ? 1.5 : 0}
                  />
                );
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Analytical Callout footer */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs font-mono text-slate-400 bg-slate-950/70 p-3 rounded border border-slate-800/80 gap-2">
        <div className="flex items-center gap-2">
          {valuePicksCount > 0 ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-slate-300">
                Se detecta ventaja cuantitativa en{' '}
                <strong className="text-emerald-400">
                  {data.filter((d) => d.exceedsThreshold).map((d) => d.name).join(', ')}
                </strong>
                , donde la probabilidad estimada supera el precio implícito de la casa.
              </span>
            </>
          ) : (
            <>
              <AlertCircle className="w-4 h-4 text-slate-500 shrink-0" />
              <span>
                Ninguna opción supera el umbral de seguridad de EV ({minThreshold.toFixed(1)}%). El margen de la casa absorbe la rentabilidad esperada.
              </span>
            </>
          )}
        </div>

        <span className="text-slate-500 shrink-0">
          Umbral activo: {minThreshold === 999 ? 'Bloqueado (Confianza Baja)' : `+${minThreshold.toFixed(1)}%`}
        </span>
      </div>
    </div>
  );
};
