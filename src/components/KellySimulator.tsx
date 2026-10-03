import React from 'react';
import {
  DollarSign,
  TrendingUp,
  ShieldCheck,
  Percent,
  Sliders,
  AlertTriangle,
  Info,
  Scale,
  Sparkles,
} from 'lucide-react';
import {
  KellyFractionType,
  KELLY_MULTIPLIERS,
  MarketOption,
  OptionCalculation,
  round2,
} from '../lib/quantEngine';

interface KellySimulatorProps {
  bankroll: number;
  onBankrollChange: (bankroll: number) => void;
  selectedKelly: KellyFractionType;
  onKellyChange: (fraction: KellyFractionType) => void;
  applyCap: boolean;
  onToggleCap: (apply: boolean) => void;
  options: OptionCalculation[];
}

const PRESET_AMOUNTS = [500, 1000, 2500, 5000, 10000];

export const KellySimulator: React.FC<KellySimulatorProps> = ({
  bankroll,
  onBankrollChange,
  selectedKelly,
  onKellyChange,
  applyCap,
  onToggleCap,
  options,
}) => {
  const activeMultiplier = KELLY_MULTIPLIERS[selectedKelly];

  // Find options with positive EV (if any)
  const evPositiveOptions = options.filter((o) => o.evPercent > 0);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-slate-800 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Scale className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">
              Simulador Interactivo de Capital y Criterio de Kelly
            </h3>
            <p className="text-xs text-slate-400">
              Modifica tu bankroll total y conmuta en tiempo real entre fracciones de Kelly (1/2, 1/4, 1/8).
            </p>
          </div>
        </div>

        {/* Cap status */}
        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer bg-slate-950 px-2.5 py-1 rounded border border-slate-800">
          <input
            type="checkbox"
            checked={applyCap}
            onChange={(e) => onToggleCap(e.target.checked)}
            className="w-3.5 h-3.5 rounded text-emerald-500 bg-slate-900 border-slate-700"
          />
          <span>Tope de Seguridad (Máx 2.00%)</span>
        </label>
      </div>

      {/* Bankroll Input & Presets */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
        <div className="lg:col-span-5 space-y-1.5">
          <label className="block text-slate-400 text-xs font-mono">
            Bankroll Total Disponible (USD)
          </label>
          <div className="relative">
            <span className="absolute left-3 top-2 text-slate-500 font-mono font-bold">$</span>
            <input
              type="number"
              min="0"
              step="100"
              value={bankroll || ''}
              onChange={(e) => onBankrollChange(Math.max(0, parseFloat(e.target.value) || 0))}
              className="w-full bg-slate-950 border border-slate-800 rounded pl-7 pr-3 py-1.5 text-white font-mono text-base font-bold focus:outline-none focus:border-emerald-500"
              placeholder="1000"
            />
          </div>
          {/* Quick presets */}
          <div className="flex items-center gap-1.5 flex-wrap pt-1">
            <span className="text-[10px] text-slate-500 font-mono">Atajos:</span>
            {PRESET_AMOUNTS.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => onBankrollChange(amt)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                  bankroll === amt
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold'
                    : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                ${amt.toLocaleString()}
              </button>
            ))}
          </div>
        </div>

        {/* Kelly Segmented Switcher */}
        <div className="lg:col-span-7 space-y-1.5">
          <label className="block text-slate-400 text-xs font-mono">
            Fracción del Criterio de Kelly (Impacto en Varianza y Crecimiento)
          </label>
          <div className="grid grid-cols-3 gap-2">
            {/* 1/8 Kelly */}
            <button
              type="button"
              onClick={() => onKellyChange('1/8')}
              className={`p-2.5 rounded-lg border text-left transition-all ${
                selectedKelly === '1/8'
                  ? 'bg-slate-800 border-cyan-500/60 shadow-md text-white'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-xs text-cyan-300">1/8 Kelly</span>
                <span className="text-[10px] font-mono text-slate-500">12.5%</span>
              </div>
              <div className="text-[11px] font-semibold text-slate-200 mt-0.5">Ultra-Conservador</div>
              <div className="text-[10px] text-slate-400 leading-tight mt-0.5">
                Mínimo drawdown; máxima preservación.
              </div>
            </button>

            {/* 1/4 Kelly */}
            <button
              type="button"
              onClick={() => onKellyChange('1/4')}
              className={`p-2.5 rounded-lg border text-left transition-all relative ${
                selectedKelly === '1/4'
                  ? 'bg-emerald-950/40 border-emerald-500/60 shadow-md text-white ring-1 ring-emerald-500/30'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-xs text-emerald-400">1/4 Kelly</span>
                <span className="text-[10px] font-mono text-emerald-500/90 font-bold">Oficial</span>
              </div>
              <div className="text-[11px] font-semibold text-emerald-300 mt-0.5">Estándar Protocolo</div>
              <div className="text-[10px] text-slate-400 leading-tight mt-0.5">
                75% del retorno con solo 25% del riesgo.
              </div>
            </button>

            {/* 1/2 Kelly */}
            <button
              type="button"
              onClick={() => onKellyChange('1/2')}
              className={`p-2.5 rounded-lg border text-left transition-all ${
                selectedKelly === '1/2'
                  ? 'bg-slate-800 border-amber-500/60 shadow-md text-white'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-xs text-amber-300">1/2 Kelly</span>
                <span className="text-[10px] font-mono text-slate-500">50.0%</span>
              </div>
              <div className="text-[11px] font-semibold text-slate-200 mt-0.5">Moderado-Agresivo</div>
              <div className="text-[10px] text-slate-400 leading-tight mt-0.5">
                Crecimiento rápido pero mayor volatilidad.
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Comparative Stake Impact Table */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center justify-between text-xs">
          <span className="font-mono font-semibold text-slate-300">
            Comparativa de Asignación en Tiempo Real por Opción del Mercado:
          </span>
          <span className="text-[11px] font-mono text-slate-400">
            Bankroll base: <strong className="text-white">${bankroll.toLocaleString()} USD</strong>
          </span>
        </div>

        <div className="overflow-x-auto border border-slate-800 rounded-lg">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-950 text-slate-400 uppercase font-mono text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Opción</th>
                <th className="py-2.5 px-2 text-right">Cuota</th>
                <th className="py-2.5 px-2 text-right">EV %</th>
                <th className="py-2.5 px-2 text-right">Kelly 100%</th>
                <th
                  className={`py-2.5 px-2 text-right ${
                    selectedKelly === '1/8' ? 'bg-cyan-950/30 text-cyan-300 font-bold' : ''
                  }`}
                >
                  1/8 Kelly (12.5%)
                </th>
                <th
                  className={`py-2.5 px-2 text-right ${
                    selectedKelly === '1/4' ? 'bg-emerald-950/30 text-emerald-300 font-bold' : ''
                  }`}
                >
                  1/4 Kelly (25%)
                </th>
                <th
                  className={`py-2.5 px-2 text-right ${
                    selectedKelly === '1/2' ? 'bg-amber-950/30 text-amber-300 font-bold' : ''
                  }`}
                >
                  1/2 Kelly (50%)
                </th>
                <th className="py-2.5 px-3 text-right bg-slate-950 font-bold text-white">
                  Stake Activo ({selectedKelly})
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono tabular-nums">
              {options.map((opt) => {
                const hasValue = opt.evPercent > 0;
                const fullK = opt.fullKellyFraction * 100;

                // 1/8
                const s1_8_raw = 0.125 * fullK;
                const s1_8 = hasValue ? (applyCap ? Math.min(2.0, Math.max(0, s1_8_raw)) : Math.max(0, s1_8_raw)) : 0;
                const m1_8 = (s1_8 / 100) * bankroll;

                // 1/4
                const s1_4_raw = 0.25 * fullK;
                const s1_4 = hasValue ? (applyCap ? Math.min(2.0, Math.max(0, s1_4_raw)) : Math.max(0, s1_4_raw)) : 0;
                const m1_4 = (s1_4 / 100) * bankroll;

                // 1/2
                const s1_2_raw = 0.5 * fullK;
                const s1_2 = hasValue ? (applyCap ? Math.min(2.0, Math.max(0, s1_2_raw)) : Math.max(0, s1_2_raw)) : 0;
                const m1_2 = (s1_2 / 100) * bankroll;

                // Active
                const activeStakePct =
                  selectedKelly === '1/8' ? s1_8 : selectedKelly === '1/4' ? s1_4 : s1_2;
                const activeStakeMoney = (activeStakePct / 100) * bankroll;
                const expectedProfit = activeStakeMoney * (opt.odd - 1);
                const expectedValueMoney = activeStakeMoney * (opt.evPercent / 100);

                return (
                  <tr
                    key={opt.id}
                    className={`hover:bg-slate-800/20 transition-colors ${
                      hasValue ? 'bg-emerald-950/10' : ''
                    }`}
                  >
                    <td className="py-2.5 px-3 font-sans text-slate-200">
                      <div className="flex items-center gap-1.5">
                        {hasValue && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                        <span className="font-medium">{opt.name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-right text-slate-300">{opt.odd.toFixed(2)}</td>
                    <td
                      className={`py-2.5 px-2 text-right font-bold ${
                        hasValue ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {opt.evPercent >= 0 ? '+' : ''}
                      {opt.evPercent.toFixed(2)}%
                    </td>
                    <td className="py-2.5 px-2 text-right text-slate-500">
                      {hasValue ? `${round2(fullK)}%` : '0.00%'}
                    </td>

                    {/* 1/8 Kelly */}
                    <td
                      className={`py-2.5 px-2 text-right ${
                        selectedKelly === '1/8' ? 'bg-cyan-950/20 font-bold text-cyan-300' : 'text-slate-400'
                      }`}
                    >
                      {hasValue ? (
                        <span>
                          {s1_8.toFixed(2)}%{' '}
                          <span className="text-[10px] text-slate-500">(${m1_8.toFixed(2)})</span>
                        </span>
                      ) : (
                        <span className="text-slate-600">0.00%</span>
                      )}
                    </td>

                    {/* 1/4 Kelly */}
                    <td
                      className={`py-2.5 px-2 text-right ${
                        selectedKelly === '1/4' ? 'bg-emerald-950/20 font-bold text-emerald-300' : 'text-slate-400'
                      }`}
                    >
                      {hasValue ? (
                        <span>
                          {s1_4.toFixed(2)}%{' '}
                          <span className="text-[10px] text-slate-500">(${m1_4.toFixed(2)})</span>
                        </span>
                      ) : (
                        <span className="text-slate-600">0.00%</span>
                      )}
                    </td>

                    {/* 1/2 Kelly */}
                    <td
                      className={`py-2.5 px-2 text-right ${
                        selectedKelly === '1/2' ? 'bg-amber-950/20 font-bold text-amber-300' : 'text-slate-400'
                      }`}
                    >
                      {hasValue ? (
                        <span>
                          {s1_2.toFixed(2)}%{' '}
                          <span className="text-[10px] text-slate-500">(${m1_2.toFixed(2)})</span>
                        </span>
                      ) : (
                        <span className="text-slate-600">0.00%</span>
                      )}
                    </td>

                    {/* Active Stake */}
                    <td className="py-2.5 px-3 text-right bg-slate-950/60 font-bold text-emerald-400">
                      {activeStakePct > 0 ? (
                        <div>
                          <span>
                            {activeStakePct.toFixed(2)}% (${activeStakeMoney.toFixed(2)} USD)
                          </span>
                          <div className="text-[10px] font-normal text-slate-400 font-sans">
                            Gcia potencial: +${expectedProfit.toFixed(2)} | EV: +${expectedValueMoney.toFixed(2)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-600">0.00% ($0.00)</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Kelly Theory & Risk Management Callout */}
      <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 text-xs text-slate-300 space-y-2">
        <div className="flex items-center gap-2 text-emerald-400 font-semibold font-mono text-[11px] uppercase tracking-wider">
          <Info className="w-3.5 h-3.5" />
          <span>Matemática Cuantitativa: ¿Por qué fraccionar el Criterio de Kelly?</span>
        </div>
        <p className="leading-relaxed text-slate-400">
          La fórmula teórica de Kelly completa (<code className="text-emerald-300 font-mono">f = (p × c − 1) / (c − 1)</code>) maximiza la tasa asintótica de crecimiento del capital, pero asume que las probabilidades estimadas son 100% exactas y perfectas. En el mundo real, los errores de estimación conducen a sobreapuestas severas.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 font-mono text-[11px]">
          <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
            <span className="text-cyan-300 font-bold block">1/8 Kelly:</span>
            <span className="text-slate-400 font-sans text-[11px]">Reduce la volatilidad en un 87.5%; ideal para rachas adversas o perfiles de riesgo ultra-conservadores.</span>
          </div>
          <div className="bg-slate-900/80 p-2 rounded border border-emerald-800/40">
            <span className="text-emerald-400 font-bold block">1/4 Kelly (Recomendado):</span>
            <span className="text-slate-400 font-sans text-[11px]">Captura el 75% del crecimiento óptimo con solo un 25% de la varianza. El estándar de los fondos cuantitativos.</span>
          </div>
          <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
            <span className="text-amber-300 font-bold block">1/2 Kelly:</span>
            <span className="text-slate-400 font-sans text-[11px]">Duplica el stake de 1/4 Kelly; solo aconsejable si las probabilidades provienen de modelos con miles de pruebas fuera de muestra.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
