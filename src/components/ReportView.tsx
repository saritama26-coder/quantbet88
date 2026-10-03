import React, { useState } from 'react';
import { Copy, Check, Download, AlertTriangle, ExternalLink, ShieldCheck, HelpCircle, FileDown } from 'lucide-react';
import { QuantitativeMarketResult, OptionCalculation, round2 } from '../lib/quantEngine';
import { exportQuantReportToPdf } from '../lib/pdfExporter';

interface ReportViewProps {
  match: string;
  competition: string;
  matchDateTime: string;
  market: string;
  captureTime: string;
  bankroll?: number;
  result: QuantitativeMarketResult;
  verifiedContext?: {
    xgRecent?: string;
    homeAwayForm?: string;
    injuriesAndLineup?: string;
    scheduleAndRest?: string;
    competitiveContext?: string;
    referee?: string;
    weather?: string;
    unconfirmed?: string[];
  };
  risks?: string[];
  sources?: { title: string; url: string; date: string }[];
  rawAiText?: string;
}

export const ReportView: React.FC<ReportViewProps> = ({
  match,
  competition,
  matchDateTime,
  market,
  captureTime,
  bankroll,
  result,
  verifiedContext,
  risks = [],
  sources = [],
  rawAiText,
}) => {
  const [copied, setCopied] = useState(false);

  // Generate plain text compliant with the strict output format
  const generatePlainTextReport = () => {
    let text = `================================================================================
INFORME CUANTITATIVO DE VALOR ESPERADO (EV+) - QUANTBET
================================================================================

1. ENCABEZADO
--------------------------------------------------------------------------------
Partido:                 ${match}
Competición:             ${competition}
Fecha y hora del partido: ${matchDateTime} (Hora de Guayaquil GMT-5)
Mercado evaluado:        ${market}
Hora de captura cuotas:  ${captureTime}
${bankroll ? `Bankroll de referencia:  $${bankroll.toFixed(2)} USD` : 'Bankroll de referencia:  No especificado'}

2. MARGEN DE LA CASA
--------------------------------------------------------------------------------
Suma de probabilidades implícitas: S = Σ (1 / cuota)
S = ${result.options.map((o) => `(1 / ${o.odd.toFixed(2)})`).join(' + ')} = ${result.sumImpliedProb.toFixed(4)}
Margen de la casa = (S - 1) × 100% = (${result.sumImpliedProb.toFixed(4)} - 1) × 100% = ${result.houseMarginPercent.toFixed(2)}%

Probabilidades justas (método proporcional desmargenado):
${result.options.map((o) => `* ${o.name}: (1 / ${o.odd.toFixed(2)}) / ${result.sumImpliedProb.toFixed(4)} = ${o.fairProb.toFixed(2)}%`).join('\n')}

3. CONTEXTO VERIFICADO (SOLO DATOS CON FUENTE)
--------------------------------------------------------------------------------
${verifiedContext?.xgRecent ? `* xG últimos partidos: ${verifiedContext.xgRecent}` : '* xG últimos partidos: [No puedo confirmar datos de xG actualizados]'}
${verifiedContext?.homeAwayForm ? `* Rendimiento local/visita: ${verifiedContext.homeAwayForm}` : '* Rendimiento local/visita: [No puedo confirmar estadísticas de localía]'}
${verifiedContext?.injuriesAndLineup ? `* Bajas y alineación: ${verifiedContext.injuriesAndLineup}` : '* Bajas y alineación: [No puedo confirmar parte médico oficial]'}
${verifiedContext?.scheduleAndRest ? `* Calendario y descanso: ${verifiedContext.scheduleAndRest}` : '* Calendario y descanso: [No puedo confirmar días de descanso]'}
${verifiedContext?.competitiveContext ? `* Contexto competitivo: ${verifiedContext.competitiveContext}` : '* Contexto competitivo: [No puedo confirmar posición en tabla]'}
${verifiedContext?.referee ? `* Árbitro: ${verifiedContext.referee}` : ''}
${verifiedContext?.weather ? `* Clima: ${verifiedContext.weather}` : ''}
${verifiedContext?.unconfirmed && verifiedContext.unconfirmed.length > 0 ? `\n* Datos no verificados:\n${verifiedContext.unconfirmed.map((u) => `  - No puedo confirmar: ${u}`).join('\n')}` : ''}

4. PROBABILIDADES ESTIMADAS (ESTIMACIÓN)
--------------------------------------------------------------------------------
${result.options.map((o) => `* ${o.name}: [ESTIMACIÓN] ${o.estimatedProb.toFixed(2)}% (Divergencia vs justa: ${o.diffFromFair >= 0 ? '+' : ''}${o.diffFromFair.toFixed(2)}%)`).join('\n')}
Suma total probabilidades estimadas: ${result.options.reduce((acc, o) => acc + o.estimatedProb, 0).toFixed(2)}%

5. TABLA RESUMEN CUANTITATIVA
--------------------------------------------------------------------------------
${'Opción'.padEnd(20)} | ${'Cuota'.padEnd(6)} | ${'P.Imp%'.padEnd(7)} | ${'P.Just%'.padEnd(8)} | ${'P.Est%'.padEnd(7)} | ${'EV%'.padEnd(8)} | ${'CuotaMín'.padEnd(9)} | ${'Stake%'.padEnd(7)} ${bankroll ? `| ${'Stake($)'.padEnd(9)} ` : ''}| Confianza
${'-'.repeat(bankroll ? 108 : 95)}
${result.options
  .map(
    (o) =>
      `${o.name.slice(0, 20).padEnd(20)} | ${o.odd.toFixed(2).padEnd(6)} | ${o.impliedProb.toFixed(2).padEnd(7)} | ${o.fairProb.toFixed(2).padEnd(8)} | ${o.estimatedProb.toFixed(2).padEnd(7)} | ${(o.evPercent >= 0 ? '+' : '') + o.evPercent.toFixed(2).padEnd(7)} | ${o.minAcceptableOdd.toFixed(2).padEnd(9)} | ${o.suggestedStakePercent.toFixed(2).padEnd(7)}% ${bankroll ? `| $${(o.suggestedStakeAmount || 0).toFixed(2).padEnd(8)} ` : ''}| ${o.confidence}`
  )
  .join('\n')}

6. VEREDICTO FINAL
--------------------------------------------------------------------------------
VEREDICTO: ${result.overallVerdict}
Regla aplicada:
${result.options.map((o) => `* ${o.name}: [${o.verdict}] ${o.verdictRule}`).join('\n')}

7. RIESGOS PRINCIPALES
--------------------------------------------------------------------------------
${risks.length > 0 ? risks.map((r, i) => `${i + 1}. ${r}`).join('\n') : '1. Variabilidad intrínseca del deporte y eventos fortuitos.\n2. Margen de error en las estimaciones estadísticas.'}

8. FUENTES VERIFICADAS
--------------------------------------------------------------------------------
${sources.length > 0 ? sources.map((s) => `* ${s.title}: ${s.url} (Consultado: ${s.date})`).join('\n') : '* Sitios de ligas oficiales, Understat, FBref, SofaScore, FotMob, Transfermarkt.'}

--------------------------------------------------------------------------------
Análisis informativo basado en estimaciones; no garantiza resultados.
================================================================================`;
    return text;
  };

  const handleCopy = () => {
    const textToCopy = rawAiText || generatePlainTextReport();
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const textToDownload = rawAiText || generatePlainTextReport();
    const blob = new Blob([textToDownload], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `informe_cuantitativo_${match.toLowerCase().replace(/[^a-z0-9]/g, '_')}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPdf = () => {
    exportQuantReportToPdf({
      match,
      competition,
      matchDateTime,
      market,
      captureTime,
      bankroll,
      result,
      verifiedContext,
      risks,
      sources,
    });
  };

  const getVerdictBadge = (verdict: string) => {
    switch (verdict) {
      case 'APOSTAR':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40 text-sm tracking-wide">
            ✓ APOSTAR (EV+)
          </span>
        );
      case 'ESPERAR':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40 text-sm tracking-wide">
            ⏳ ESPERAR MEJOR CUOTA / ALINEACIONES
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-rose-500/20 text-rose-300 font-bold border border-rose-500/40 text-sm tracking-wide">
            ✕ NO APOSTAR (SIN VALOR)
          </span>
        );
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-6">
      {/* Top action bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-800 gap-3">
        <div>
          <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
            Informe Cuantitativo Oficial
          </span>
          <h2 className="text-lg font-bold text-white mt-0.5">
            {match}
          </h2>
          <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
            <span>{competition}</span>
            <span>·</span>
            <span className="text-emerald-400 font-mono">{market}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors border border-slate-700"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Copiado</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copiar Informe</span>
              </>
            )}
          </button>

          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors border border-slate-700"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Descargar TXT</span>
          </button>

          <button
            onClick={handleExportPdf}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition-colors border border-emerald-500 shadow-sm"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>Exportar PDF</span>
          </button>
        </div>
      </div>

      {/* 1. Encabezado */}
      <div className="bg-slate-950/70 border border-slate-800/80 rounded p-4 text-xs font-mono grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <span className="text-slate-500 block text-[11px]">Competición</span>
          <span className="text-slate-200 font-sans font-medium">{competition}</span>
        </div>
        <div>
          <span className="text-slate-500 block text-[11px]">Fecha y Hora (Guayaquil)</span>
          <span className="text-slate-200">{matchDateTime}</span>
        </div>
        <div>
          <span className="text-slate-500 block text-[11px]">Hora Captura Cuota</span>
          <span className="text-emerald-400">{captureTime}</span>
        </div>
        <div>
          <span className="text-slate-500 block text-[11px]">Bankroll Referencial</span>
          <span className="text-slate-200">{bankroll ? `$${bankroll.toFixed(2)} USD` : 'No especificado'}</span>
        </div>
      </div>

      {/* 2. Margen de la Casa */}
      <div className="space-y-2">
        <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400 font-semibold flex items-center justify-between">
          <span>2. Margen de la Casa</span>
          <span className="text-emerald-400">Margen: {result.houseMarginPercent.toFixed(2)}%</span>
        </h3>
        <div className="bg-slate-950/80 border border-slate-800/80 rounded p-3 text-xs font-mono space-y-1.5">
          <div className="text-slate-300">
            <span className="text-slate-500">Suma probabilidades implícitas: </span>
            <span className="text-emerald-300">S = Σ (1 / cuota)</span> = {result.options.map((o) => `(1 / ${o.odd.toFixed(2)})`).join(' + ')} = <span className="text-white font-bold">{result.sumImpliedProb.toFixed(4)}</span>
          </div>
          <div className="text-slate-300">
            <span className="text-slate-500">Margen casa: </span>
            <span>(S − 1) × 100% = ({result.sumImpliedProb.toFixed(4)} − 1) × 100% = </span>
            <span className={`font-bold ${result.houseMarginPercent > 7 ? 'text-rose-400' : 'text-emerald-400'}`}>
              {result.houseMarginPercent.toFixed(2)}%
            </span>
          </div>
          <div className="text-slate-400 text-[11px] pt-1 border-t border-slate-800/60">
            Probabilidad justa proporcional = (1 / cuota) / S (elimina el sobreprecio para calcular el valor real)
          </div>
        </div>
      </div>

      {/* 3. Contexto Verificado */}
      <div className="space-y-2">
        <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400 font-semibold">
          3. Contexto Verificado (Solo Datos con Fuente)
        </h3>
        <div className="bg-slate-950/80 border border-slate-800/80 rounded p-4 text-xs space-y-2 leading-relaxed">
          {verifiedContext?.xgRecent && (
            <div className="text-slate-300">
              <span className="text-emerald-400 font-mono font-medium">[DATO xG]: </span>
              {verifiedContext.xgRecent}
            </div>
          )}
          {verifiedContext?.homeAwayForm && (
            <div className="text-slate-300">
              <span className="text-emerald-400 font-mono font-medium">[DATO Local/Visita]: </span>
              {verifiedContext.homeAwayForm}
            </div>
          )}
          {verifiedContext?.injuriesAndLineup && (
            <div className="text-slate-300">
              <span className="text-emerald-400 font-mono font-medium">[DATO Alineaciones/Bajas]: </span>
              {verifiedContext.injuriesAndLineup}
            </div>
          )}
          {verifiedContext?.scheduleAndRest && (
            <div className="text-slate-300">
              <span className="text-emerald-400 font-mono font-medium">[DATO Calendario/Descanso]: </span>
              {verifiedContext.scheduleAndRest}
            </div>
          )}
          {verifiedContext?.competitiveContext && (
            <div className="text-slate-300">
              <span className="text-emerald-400 font-mono font-medium">[DATO Contexto Competitivo]: </span>
              {verifiedContext.competitiveContext}
            </div>
          )}
          {verifiedContext?.referee && (
            <div className="text-slate-300">
              <span className="text-emerald-400 font-mono font-medium">[DATO Árbitro]: </span>
              {verifiedContext.referee}
            </div>
          )}
          {verifiedContext?.weather && (
            <div className="text-slate-300">
              <span className="text-emerald-400 font-mono font-medium">[DATO Clima]: </span>
              {verifiedContext.weather}
            </div>
          )}
          {verifiedContext?.unconfirmed && verifiedContext.unconfirmed.length > 0 && (
            <div className="pt-2 border-t border-slate-800/60 text-amber-300">
              <span className="font-mono font-semibold">[No puedo confirmar]: </span>
              {verifiedContext.unconfirmed.join(' · ')}
            </div>
          )}
        </div>
      </div>

      {/* 4. Tabla Resumen Cuantitativa (Mandatory 9 Columns) */}
      <div className="space-y-2">
        <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400 font-semibold">
          4. Tabla Resumen Cuantitativa (Cálculos con 2 decimales)
        </h3>

        <div className="overflow-x-auto border border-slate-800 rounded-lg">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-950 text-slate-400 uppercase font-mono text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Opción</th>
                <th className="py-2.5 px-2 text-right">Cuota</th>
                <th className="py-2.5 px-2 text-right">Prob. Impl.</th>
                <th className="py-2.5 px-2 text-right">Prob. Justa</th>
                <th className="py-2.5 px-2 text-right">Prob. Estim.</th>
                <th className="py-2.5 px-2 text-right">EV %</th>
                <th className="py-2.5 px-2 text-right">Cuota Mín.</th>
                <th className="py-2.5 px-2 text-right">Stake (% bank)</th>
                {bankroll && <th className="py-2.5 px-2 text-right">Stake ($)</th>}
                <th className="py-2.5 px-3 text-center">Confianza</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono tabular-nums">
              {result.options.map((opt) => {
                const isPositiveEv = opt.evPercent > 0;
                const isApostar = opt.verdict === 'APOSTAR';

                return (
                  <tr
                    key={opt.id}
                    className={`transition-colors ${
                      isApostar
                        ? 'bg-emerald-950/20 font-medium'
                        : opt.verdict === 'ESPERAR'
                        ? 'bg-amber-950/10'
                        : 'hover:bg-slate-800/20'
                    }`}
                  >
                    <td className="py-2.5 px-3 font-sans text-slate-200">
                      <div className="flex items-center gap-1.5">
                        {isApostar && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        )}
                        <span>{opt.name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-right text-slate-200 font-bold">
                      {opt.odd.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-2 text-right text-slate-400">
                      {opt.impliedProb.toFixed(2)}%
                    </td>
                    <td className="py-2.5 px-2 text-right text-slate-300">
                      {opt.fairProb.toFixed(2)}%
                    </td>
                    <td className="py-2.5 px-2 text-right text-cyan-300 font-bold">
                      {opt.estimatedProb.toFixed(2)}%
                    </td>
                    <td
                      className={`py-2.5 px-2 text-right font-bold ${
                        isPositiveEv
                          ? opt.evPercent >= (opt.confidence === 'ALTA' ? 3 : 5)
                            ? 'text-emerald-400'
                            : 'text-amber-400'
                          : 'text-rose-400'
                      }`}
                    >
                      {opt.evPercent >= 0 ? '+' : ''}
                      {opt.evPercent.toFixed(2)}%
                    </td>
                    <td className="py-2.5 px-2 text-right text-slate-400">
                      {opt.minAcceptableOdd.toFixed(2)}
                    </td>
                    <td
                      className={`py-2.5 px-2 text-right font-bold ${
                        opt.suggestedStakePercent > 0
                          ? 'text-emerald-400'
                          : 'text-slate-500'
                      }`}
                    >
                      {opt.suggestedStakePercent.toFixed(2)}%
                    </td>
                    {bankroll && (
                      <td className="py-2.5 px-2 text-right text-emerald-300">
                        ${(opt.suggestedStakeAmount || 0).toFixed(2)}
                      </td>
                    )}
                    <td className="py-2.5 px-3 text-center">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                          opt.confidence === 'ALTA'
                            ? 'text-emerald-300 bg-emerald-950/60 border border-emerald-800/60'
                            : opt.confidence === 'MEDIA'
                            ? 'text-amber-300 bg-amber-950/60 border border-amber-800/60'
                            : 'text-rose-300 bg-rose-950/60 border border-rose-800/60'
                        }`}
                      >
                        {opt.confidence}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 font-mono">
          <span>Suma de probabilidades estimadas: {result.options.reduce((acc, o) => acc + o.estimatedProb, 0).toFixed(2)}%</span>
          <span>Tope Kelly: 2.00% del bankroll</span>
        </div>
      </div>

      {/* 5. Veredicto Final */}
      <div className="space-y-3">
        <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400 font-semibold">
          5. Veredicto Oficial
        </h3>
        <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <span className="text-xs text-slate-400 block mb-1">Decisión Cuantitativa:</span>
              <div>{getVerdictBadge(result.overallVerdict)}</div>
            </div>
            {result.recommendedOption && result.overallVerdict === 'APOSTAR' && (
              <div className="text-right">
                <span className="text-xs text-slate-400 block mb-1">Selección Recomendada:</span>
                <span className="text-sm font-semibold text-emerald-400 font-mono">
                  {result.recommendedOption.name} @ {result.recommendedOption.odd.toFixed(2)}
                </span>
              </div>
            )}
          </div>

          <div className="text-xs text-slate-300 space-y-1.5 pt-2 border-t border-slate-800/80">
            {result.options.map((opt) => (
              <div key={opt.id} className="flex items-start gap-2">
                <span className="font-mono text-slate-400 shrink-0 font-medium">
                  {opt.name}:
                </span>
                <span className="text-slate-300">{opt.verdictRule}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 6. Riesgos Principales */}
      <div className="space-y-2">
        <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400 font-semibold">
          6. Riesgos Principales Identificados
        </h3>
        <div className="bg-slate-950/80 border border-slate-800/80 rounded p-4 text-xs space-y-1.5">
          {risks.length > 0 ? (
            risks.map((risk, index) => (
              <div key={index} className="flex items-start gap-2 text-slate-300">
                <span className="text-amber-400 font-mono font-bold shrink-0">{index + 1}.</span>
                <span>{risk}</span>
              </div>
            ))
          ) : (
            <div className="text-slate-400 italic">
              1. Variabilidad intrínseca del deporte y margen de error en muestras de xG.
            </div>
          )}
        </div>
      </div>

      {/* 7. Fuentes */}
      <div className="space-y-2">
        <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400 font-semibold">
          7. Fuentes Citadas (Con enlace y fecha de consulta)
        </h3>
        <div className="bg-slate-950/80 border border-slate-800/80 rounded p-3 text-xs space-y-1 font-mono">
          {sources.length > 0 ? (
            sources.map((s, idx) => (
              <div key={idx} className="flex items-center gap-2 text-slate-300">
                <span className="text-slate-500">•</span>
                <span className="font-sans font-medium text-slate-200">{s.title}:</span>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-400 hover:underline flex items-center gap-1 truncate max-w-md"
                >
                  <span className="truncate">{s.url}</span>
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
                <span className="text-slate-500 text-[11px] shrink-0">(Cons: {s.date})</span>
              </div>
            ))
          ) : (
            <div className="text-slate-400 italic font-sans">
              Understat, FBref, SofaScore, FotMob, Transfermarkt.
            </div>
          )}
        </div>
      </div>

      {/* 8. Nota Final Obligatoria */}
      <div className="p-3 bg-slate-950 border border-slate-800/80 rounded text-center text-xs text-slate-400 italic">
        «Análisis informativo basado en estimaciones; no garantiza resultados.»
      </div>
    </div>
  );
};
