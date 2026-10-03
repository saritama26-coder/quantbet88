import React, { useState, useMemo } from 'react';
import {
  Layers,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Plus,
  ShieldAlert,
  Info,
  DollarSign,
  Scale,
} from 'lucide-react';
import {
  ParlaySelection,
  ConfidenceLevel,
  calculateParlayQuant,
  round2,
} from '../lib/quantEngine';

interface ParlayBuilderProps {
  bankroll?: number;
  initialSelections?: ParlaySelection[];
}

export const ParlayBuilder: React.FC<ParlayBuilderProps> = ({
  bankroll = 1000,
  initialSelections,
}) => {
  const [selections, setSelections] = useState<ParlaySelection[]>(
    initialSelections && initialSelections.length > 0
      ? initialSelections
      : [
          {
            id: 'p-1',
            match: 'Arsenal vs Chelsea',
            market: '1X2 (Resultado Final)',
            optionName: 'Local (Arsenal)',
            odd: 1.85,
            estimatedProb: 58.50,
            individualMargin: 4.80,
            confidence: 'ALTA',
            isIndependent: true,
          },
          {
            id: 'p-2',
            match: 'Bayern Múnich vs Dortmund',
            market: 'Total Goles',
            optionName: 'Más de 2.5 Goles',
            odd: 1.65,
            estimatedProb: 65.00,
            individualMargin: 4.50,
            confidence: 'ALTA',
            isIndependent: true,
          },
        ]
  );

  const [currentBankroll, setCurrentBankroll] = useState(bankroll);

  // Add selection
  const handleAddSelection = () => {
    if (selections.length >= 3) {
      alert('Regla cuantitativa de combinadas: Máximo 3 selecciones permitidas para evitar la multiplicación descontrolada del margen de la casa.');
      return;
    }

    const nextId = `p-${Date.now()}`;
    setSelections([
      ...selections,
      {
        id: nextId,
        match: 'Nuevo Partido',
        market: '1X2',
        optionName: 'Local',
        odd: 1.80,
        estimatedProb: 58.00,
        individualMargin: 5.00,
        confidence: 'ALTA',
        isIndependent: true,
      },
    ]);
  };

  // Remove selection
  const handleRemove = (id: string) => {
    setSelections(selections.filter((s) => s.id !== id));
  };

  // Auto-detect correlation if matches are identical
  const enrichedSelections = useMemo(() => {
    const matchCounts: Record<string, number> = {};
    selections.forEach((s) => {
      const key = s.match.trim().toLowerCase();
      matchCounts[key] = (matchCounts[key] || 0) + 1;
    });

    return selections.map((s) => {
      const count = matchCounts[s.match.trim().toLowerCase()] || 0;
      const isCorrelated = count > 1 || !s.isIndependent;
      return {
        ...s,
        isIndependent: !isCorrelated,
        correlationNote:
          count > 1
            ? 'ADVERTENCIA: Pertenece al mismo partido. Eventos correlacionados.'
            : undefined,
      };
    });
  }, [selections]);

  // Compute parlay math
  const parlayResult = useMemo(() => {
    return calculateParlayQuant(enrichedSelections, currentBankroll);
  }, [enrichedSelections, currentBankroll]);

  return (
    <div className="space-y-6">
      {/* Intro Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
        <div className="flex items-start gap-4">
          <div className="p-2.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">
              Constructor de Apuestas Combinadas Cuantitativas (Parlay EV+)
            </h2>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Las casas de apuestas promueven combinadas porque multiplican su margen a expensas del apostador. El protocolo cuantitativo impone reglas inflexibles: <strong>máximo 2 a 3 selecciones</strong>, cada una debe tener EV+ individual verificado, eventos rigurosamente <strong>independientes</strong> (cero correlación), cálculo explícito de margen acumulado y <strong>tope de bankroll de solo 1.00%</strong>.
            </p>
          </div>
        </div>
      </div>

      {/* Selections List */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-slate-800 gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white">
              Selecciones para la Combinada ({selections.length} de 3 permitidas)
            </h3>
            <p className="text-xs text-slate-400">
              Cada selección debe tener EV positivo por separado y superar su umbral mínimo de seguridad.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleAddSelection}
              disabled={selections.length >= 3}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-xs font-semibold text-white transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Añadir Selección</span>
            </button>
          </div>
        </div>

        {/* List of cards */}
        <div className="space-y-3">
          {selections.map((sel, idx) => {
            const pFrac = sel.estimatedProb / 100;
            const indEv = round2((pFrac * sel.odd - 1) * 100);
            const threshold = sel.confidence === 'ALTA' ? 3.0 : sel.confidence === 'MEDIA' ? 5.0 : 999;
            const hasValidEv = indEv >= threshold && sel.confidence !== 'BAJA';

            return (
              <div
                key={sel.id}
                className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded bg-slate-800 text-slate-300 font-mono text-xs flex items-center justify-center font-bold">
                      {idx + 1}
                    </span>
                    <input
                      type="text"
                      value={sel.match}
                      onChange={(e) => {
                        const updated = [...selections];
                        updated[idx].match = e.target.value;
                        setSelections(updated);
                      }}
                      className="bg-transparent border-b border-slate-700 text-sm font-semibold text-white focus:outline-none focus:border-emerald-500 px-1 py-0.5"
                      placeholder="Partido"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                        hasValidEv
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : 'bg-rose-950 text-rose-300 border border-rose-800'
                      }`}
                    >
                      {hasValidEv ? `EV+ Individual: +${indEv}%` : `EV Insuficiente: ${indEv}%`}
                    </span>

                    {selections.length > 1 && (
                      <button
                        onClick={() => handleRemove(sel.id)}
                        className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                        title="Eliminar selección"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-500 text-[10px] font-mono">Selección / Pronóstico</label>
                    <input
                      type="text"
                      value={sel.optionName}
                      onChange={(e) => {
                        const updated = [...selections];
                        updated[idx].optionName = e.target.value;
                        setSelections(updated);
                      }}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-500 text-[10px] font-mono">Cuota Casa</label>
                    <input
                      type="number"
                      step="0.01"
                      min="1.01"
                      value={sel.odd}
                      onChange={(e) => {
                        const updated = [...selections];
                        updated[idx].odd = parseFloat(e.target.value) || 1.01;
                        setSelections(updated);
                      }}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-emerald-400 font-mono font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-500 text-[10px] font-mono">Prob. Estimada %</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={sel.estimatedProb}
                      onChange={(e) => {
                        const updated = [...selections];
                        updated[idx].estimatedProb = parseFloat(e.target.value) || 0;
                        setSelections(updated);
                      }}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-cyan-300 font-mono font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-500 text-[10px] font-mono">Margen Mercado %</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={sel.individualMargin}
                      onChange={(e) => {
                        const updated = [...selections];
                        updated[idx].individualMargin = parseFloat(e.target.value) || 0;
                        setSelections(updated);
                      }}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-300 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-500 text-[10px] font-mono">Confianza</label>
                    <select
                      value={sel.confidence}
                      onChange={(e) => {
                        const updated = [...selections];
                        updated[idx].confidence = e.target.value as ConfidenceLevel;
                        setSelections(updated);
                      }}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono"
                    >
                      <option value="ALTA">ALTA (Umbral 3%)</option>
                      <option value="MEDIA">MEDIA (Umbral 5%)</option>
                      <option value="BAJA">BAJA (No apostar)</option>
                    </select>
                  </div>
                </div>

                {/* Independent check */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-400">
                    <input
                      type="checkbox"
                      checked={sel.isIndependent}
                      onChange={(e) => {
                        const updated = [...selections];
                        updated[idx].isIndependent = e.target.checked;
                        setSelections(updated);
                      }}
                      className="w-3.5 h-3.5 rounded text-emerald-500 bg-slate-900 border-slate-700"
                    />
                    <span>Evento independiente de los demás seleccionados</span>
                  </label>

                  {enrichedSelections[idx]?.correlationNote && (
                    <span className="text-amber-400 text-[11px] font-medium">
                      {enrichedSelections[idx].correlationNote}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Parlay Math Results */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Scale className="w-4 h-4 text-emerald-400" />
          Métricas Cuantitativas de la Combinada
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
          <div className="bg-slate-950 p-3 rounded border border-slate-800">
            <span className="text-slate-500 block text-[11px] font-sans">Cuota Combinada</span>
            <div className="text-lg font-bold text-white mt-0.5">
              {parlayResult.combinedOdd.toFixed(2)}
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              Π cuota_i = {selections.map((s) => s.odd.toFixed(2)).join(' × ')}
            </div>
          </div>

          <div className="bg-slate-950 p-3 rounded border border-slate-800">
            <span className="text-slate-500 block text-[11px] font-sans">Probabilidad Combinada</span>
            <div className="text-lg font-bold text-cyan-300 mt-0.5">
              {parlayResult.combinedProb.toFixed(2)}%
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              Π p_i (Solo eventos independientes)
            </div>
          </div>

          <div className="bg-slate-950 p-3 rounded border border-slate-800">
            <span className="text-slate-500 block text-[11px] font-sans">Margen Acumulado</span>
            <div className="text-lg font-bold text-amber-400 mt-0.5">
              {parlayResult.cumulativeMarginPercent.toFixed(2)}%
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              [Π (1 + m_i)] − 1
            </div>
          </div>

          <div className="bg-slate-950 p-3 rounded border border-slate-800">
            <span className="text-slate-500 block text-[11px] font-sans">EV Combinado</span>
            <div
              className={`text-lg font-bold mt-0.5 ${
                parlayResult.combinedEvPercent > 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {parlayResult.combinedEvPercent >= 0 ? '+' : ''}
              {parlayResult.combinedEvPercent.toFixed(2)}%
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              Cuota Mínima: {parlayResult.minAcceptableCombinedOdd.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Suggested Stake card */}
        <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <span className="text-slate-500 text-xs font-mono block">
              Gestión de Stake de la Combinada (Tope estricto: 1.00%)
            </span>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xl font-bold font-mono text-emerald-400">
                {parlayResult.suggestedStakePercent.toFixed(2)}% del bankroll
              </span>
              {currentBankroll > 0 && parlayResult.suggestedStakeAmount !== undefined && (
                <span className="text-sm font-mono text-slate-300">
                  (${parlayResult.suggestedStakeAmount.toFixed(2)} USD)
                </span>
              )}
            </div>
          </div>

          <div className="text-right">
            <span className="text-slate-500 text-xs font-mono block">Veredicto Combinada</span>
            <span
              className={`inline-block mt-1 px-3 py-1 rounded text-xs font-bold font-sans tracking-wide ${
                parlayResult.verdict === 'APOSTAR'
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                  : 'bg-rose-950 text-rose-300 border border-rose-800'
              }`}
            >
              {parlayResult.verdict}
            </span>
          </div>
        </div>

        {/* Reason breakdown */}
        <div className="bg-slate-950/80 border border-slate-800/80 rounded p-3 text-xs text-slate-300 space-y-1">
          <div className="font-semibold text-slate-200">Justificación Cuantitativa:</div>
          <p className="leading-relaxed">{parlayResult.verdictReason}</p>
        </div>
      </div>

      <div className="p-3 bg-slate-950 border border-slate-800/80 rounded text-center text-xs text-slate-400 italic">
        «Análisis informativo basado en estimaciones; no garantiza resultados.»
      </div>
    </div>
  );
};
