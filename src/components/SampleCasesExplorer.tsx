import React, { useState } from 'react';
import { BookOpen, ArrowRight, ShieldCheck, AlertTriangle, FileText, CheckCircle2 } from 'lucide-react';
import { SAMPLE_CASES, SampleCase } from '../data/sampleCases';
import { calculateMarketQuant } from '../lib/quantEngine';
import { ReportView } from './ReportView';

interface SampleCasesExplorerProps {
  onLoadCaseIntoCalculator: (sample: SampleCase) => void;
}

export const SampleCasesExplorer: React.FC<SampleCasesExplorerProps> = ({
  onLoadCaseIntoCalculator,
}) => {
  const [selectedCase, setSelectedCase] = useState<SampleCase>(SAMPLE_CASES[0]);
  const [showReportModal, setShowReportModal] = useState(false);

  const quantResult = calculateMarketQuant(
    selectedCase.options,
    selectedCase.confidence,
    selectedCase.bankroll,
    selectedCase.pendingLineups
  );

  return (
    <div className="space-y-6">
      {/* Intro Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
        <div className="flex items-start gap-4">
          <div className="p-2.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">
              Banco de Casos de Estudio Verificados (Casos Reales)
            </h2>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Explora cómo se aplica de punta a punta el protocolo cuantitativo ante los 3 escenarios posibles: cuando hay valor real justificable (<strong>APOSTAR</strong>), cuando el mercado está saturado de margen (<strong>NO APOSTAR</strong>), y cuando la cuota o alineación exigen paciencia táctica (<strong>ESPERAR</strong>).
            </p>
          </div>
        </div>
      </div>

      {/* Case Selector Tabs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {SAMPLE_CASES.map((item) => {
          const isSelected = selectedCase.id === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setSelectedCase(item)}
              className={`p-4 rounded-lg border text-left transition-all relative ${
                isSelected
                  ? 'bg-slate-800/90 border-emerald-500/60 shadow-lg shadow-slate-950'
                  : 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-mono text-slate-400">{item.competition}</span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded font-sans tracking-wide ${
                    item.expectedVerdict === 'APOSTAR'
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      : item.expectedVerdict === 'ESPERAR'
                      ? 'bg-amber-950 text-amber-300 border border-amber-800'
                      : 'bg-rose-950 text-rose-300 border border-rose-800'
                  }`}
                >
                  {item.expectedVerdict}
                </span>
              </div>
              <h3 className="text-sm font-semibold text-white leading-snug">{item.match}</h3>
              <p className="text-xs text-slate-400 mt-1 line-clamp-2">{item.tagline}</p>
            </button>
          );
        })}
      </div>

      {/* Case Details Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-slate-800 gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white">{selectedCase.title}</h3>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {selectedCase.matchDateTime} · Mercado: <span className="text-slate-200 font-mono">{selectedCase.market}</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onLoadCaseIntoCalculator(selectedCase)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition-colors"
            >
              <span>Cargar en Workbench</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Narrative rationale */}
        <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-lg text-xs leading-relaxed text-slate-300 space-y-2">
          <div className="font-semibold text-slate-200 font-mono text-[11px] uppercase tracking-wider">
            Dictamen del Analista Cuantitativo:
          </div>
          <p>{selectedCase.explanation}</p>
        </div>

        {/* Embedded Full Report View */}
        <ReportView
          match={selectedCase.match}
          competition={selectedCase.competition}
          matchDateTime={selectedCase.matchDateTime}
          market={selectedCase.market}
          captureTime={selectedCase.captureTime}
          bankroll={selectedCase.bankroll}
          result={quantResult}
          verifiedContext={selectedCase.verifiedContext}
          risks={selectedCase.risks}
          sources={selectedCase.sources}
        />
      </div>
    </div>
  );
};
