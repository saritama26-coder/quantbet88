import React, { useState } from 'react';
import {
  Sparkles,
  Search,
  ExternalLink,
  Copy,
  Check,
  Download,
  AlertTriangle,
  RefreshCw,
  Plus,
  Trash2,
  Database,
  ArrowRight,
  ShieldAlert,
  Sliders,
  Cpu,
} from 'lucide-react';

interface OddsRow {
  option: string;
  odd: string;
}

interface LiveAiAnalyzerProps {
  onTransferToWorkbench?: (data: {
    match: string;
    competition: string;
    matchDateTime: string;
    market: string;
    captureTime: string;
    bankroll: number;
    options: { id: string; name: string; odd: number; estimatedProb: number }[];
  }) => void;
}

export const LiveAiAnalyzer: React.FC<LiveAiAnalyzerProps> = ({ onTransferToWorkbench }) => {
  const [match, setMatch] = useState('Manchester City vs Liverpool');
  const [competition, setCompetition] = useState('Premier League');
  const [matchDateTime, setMatchDateTime] = useState('2026-10-04 10:30');
  const [market, setMarket] = useState('1X2 (Resultado Final)');
  const [captureTime, setCaptureTime] = useState('09:45');
  const [bankroll, setBankroll] = useState('1000');
  const [additionalContext, setAdditionalContext] = useState('');
  const [forceDeterministic, setForceDeterministic] = useState(false);

  const [oddsRows, setOddsRows] = useState<OddsRow[]>([
    { option: 'Local (Manchester City)', odd: '2.05' },
    { option: 'Empate', odd: '3.60' },
    { option: 'Visitante (Liverpool)', odd: '3.40' },
  ]);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quotaWarning, setQuotaWarning] = useState<string | null>(null);
  const [analysisOutput, setAnalysisOutput] = useState<string | null>(null);
  const [sources, setSources] = useState<{ title: string; url: string }[]>([]);
  const [copied, setCopied] = useState(false);

  // Add row
  const handleAddRow = () => {
    setOddsRows([...oddsRows, { option: `Opción ${oddsRows.length + 1}`, odd: '2.00' }]);
  };

  // Remove row
  const handleRemoveRow = (index: number) => {
    if (oddsRows.length <= 2) {
      alert('Un mercado deportivo requiere como mínimo 2 opciones.');
      return;
    }
    setOddsRows(oddsRows.filter((_, i) => i !== index));
  };

  // Run analysis
  const handleRunAnalysis = async (overrideDeterministic?: boolean) => {
    setError(null);
    setQuotaWarning(null);

    // Validation
    if (!match.trim() || !competition.trim()) {
      setError('Por favor indica el partido y la competición.');
      return;
    }

    if (!captureTime.trim()) {
      setError('La hora de captura de la cuota es obligatoria según las reglas del protocolo.');
      return;
    }

    const parsedOdds = oddsRows.map((r) => ({
      option: r.option.trim(),
      odd: parseFloat(r.odd),
    }));

    for (const item of parsedOdds) {
      if (!item.option || isNaN(item.odd) || item.odd <= 1.0) {
        setError(`La cuota para «${item.option || 'una opción'}» debe ser un número decimal válido mayor a 1.00.`);
        return;
      }
    }

    setIsLoading(true);
    setAnalysisOutput(null);

    const isDet = overrideDeterministic !== undefined ? overrideDeterministic : forceDeterministic;

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          match,
          competition,
          matchDateTime,
          market,
          captureTime,
          odds: parsedOdds,
          bankroll: bankroll ? parseFloat(bankroll) : undefined,
          additionalContext: additionalContext.trim() || undefined,
          forceDeterministic: isDet,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al procesar el análisis en el servidor.');
      }

      setAnalysisOutput(data.analysis);
      setSources(data.sources || []);

      if (data.warning || data.isQuotaWarning) {
        setQuotaWarning(
          data.warning ||
            'La cuota de solicitudes de la API de Google Gemini en tiempo real está agotada temporalmente (HTTP 429). QuantBet ejecutó automáticamente el análisis con su motor cuantitativo determinístico local con desmargenado matemático y reglas de seguridad.'
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido al consultar el servidor.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    if (!analysisOutput) return;
    navigator.clipboard.writeText(analysisOutput);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!analysisOutput) return;
    const blob = new Blob([analysisOutput], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `analisis_cuantitativo_${match.toLowerCase().replace(/[^a-z0-9]/g, '_')}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleSendToWorkbench = () => {
    if (onTransferToWorkbench) {
      const parsedOdds = oddsRows.map((r, idx) => ({
        id: String(idx + 1),
        name: r.option,
        odd: parseFloat(r.odd) || 2.0,
        estimatedProb: Math.round((100 / oddsRows.length) * 100) / 100,
      }));

      onTransferToWorkbench({
        match,
        competition,
        matchDateTime,
        market,
        captureTime,
        bankroll: parseFloat(bankroll) || 1000,
        options: parsedOdds,
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Intro box */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
        <div className="flex items-start gap-4">
          <div className="p-2.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">
              Analizador Cuantitativo de Valor Esperado (EV+)
            </h2>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Calcula con rigor científico el margen de la casa, desmargena proporcionalmente, estima probabilidades sin sesgos de certeza y ejecuta las reglas de veredicto oficiales. Cuenta con modo asistido por IA y motor cuantitativo local de respaldo ante saturaciones de cuota.
            </p>
          </div>
        </div>
      </div>

      {/* Quota Notice Banner if triggered */}
      {quotaWarning && (
        <div className="bg-amber-950/40 border border-amber-800/80 rounded-lg p-4 text-xs text-amber-300 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-semibold text-amber-200">
              Modo Determinístico Cuantitativo Activo (Respaldo Automático 429)
            </div>
            <p className="leading-relaxed text-amber-300/90">{quotaWarning}</p>
            <div className="pt-2 flex items-center gap-2">
              <button
                onClick={handleSendToWorkbench}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-amber-600/30 hover:bg-amber-600/50 text-amber-200 text-[11px] font-semibold transition-colors border border-amber-500/40"
              >
                <Sliders className="w-3 h-3" />
                <span>Abrir este evento en el Workbench para ajustar probabilidades</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Input Form */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-slate-800 gap-2">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Search className="w-4 h-4 text-cyan-400" />
            Datos del Evento y Cuotas Reales a Evaluar
          </h3>

          {/* Mode Switcher */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded border border-slate-800 text-[11px]">
            <button
              type="button"
              onClick={() => setForceDeterministic(false)}
              className={`px-2 py-1 rounded transition-colors ${
                !forceDeterministic
                  ? 'bg-cyan-500/20 text-cyan-300 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className="flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-cyan-400" />
                <span>Búsqueda Web (IA)</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setForceDeterministic(true)}
              className={`px-2 py-1 rounded transition-colors ${
                forceDeterministic
                  ? 'bg-emerald-500/20 text-emerald-300 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className="flex items-center gap-1">
                <Cpu className="w-3 h-3 text-emerald-400" />
                <span>Motor Cuantitativo Local (Sin Límite)</span>
              </span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="block text-slate-400 mb-1 font-mono text-[11px]">Partido</label>
            <input
              type="text"
              value={match}
              onChange={(e) => setMatch(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-white font-sans focus:outline-none focus:border-cyan-500"
              placeholder="ej: Manchester City vs Liverpool"
            />
          </div>

          <div>
            <label className="block text-slate-400 mb-1 font-mono text-[11px]">Competición</label>
            <input
              type="text"
              value={competition}
              onChange={(e) => setCompetition(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-white font-sans focus:outline-none focus:border-cyan-500"
              placeholder="ej: Premier League"
            />
          </div>

          <div>
            <label className="block text-slate-400 mb-1 font-mono text-[11px]">
              Fecha y Hora (Guayaquil GMT-5)
            </label>
            <input
              type="text"
              value={matchDateTime}
              onChange={(e) => setMatchDateTime(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-white font-mono focus:outline-none focus:border-cyan-500"
              placeholder="2026-10-04 10:30"
            />
          </div>

          <div>
            <label className="block text-slate-400 mb-1 font-mono text-[11px]">Mercado a Evaluar</label>
            <input
              type="text"
              value={market}
              onChange={(e) => setMarket(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-white font-sans focus:outline-none focus:border-cyan-500"
              placeholder="ej: 1X2 (Resultado Final)"
            />
          </div>

          <div>
            <label className="block text-slate-400 mb-1 font-mono text-[11px]">
              Hora de Captura de Cuotas <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={captureTime}
              onChange={(e) => setCaptureTime(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-white font-mono focus:outline-none focus:border-cyan-500"
              placeholder="09:45 (GMT-5)"
            />
          </div>

          <div>
            <label className="block text-slate-400 mb-1 font-mono text-[11px]">Bankroll (Opcional, USD)</label>
            <div className="relative">
              <span className="absolute left-2.5 top-1.5 text-slate-500">$</span>
              <input
                type="number"
                value={bankroll}
                onChange={(e) => setBankroll(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded pl-6 pr-2.5 py-1.5 text-white font-mono focus:outline-none focus:border-cyan-500"
                placeholder="1000"
              />
            </div>
          </div>
        </div>

        {/* Odds list */}
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-300 font-semibold">
              Opciones del Mercado y Cuotas Exactas de la Casa:
            </span>
            <button
              onClick={handleAddRow}
              className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-cyan-300"
            >
              <Plus className="w-3 h-3" />
              <span>Añadir opción</span>
            </button>
          </div>

          <div className="space-y-2">
            {oddsRows.map((row, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="text"
                  value={row.option}
                  onChange={(e) => {
                    const updated = [...oddsRows];
                    updated[idx].option = e.target.value;
                    setOddsRows(updated);
                  }}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white font-sans focus:outline-none focus:border-cyan-500"
                  placeholder="Nombre de la opción (ej: Local)"
                />
                <input
                  type="number"
                  step="0.01"
                  min="1.01"
                  value={row.odd}
                  onChange={(e) => {
                    const updated = [...oddsRows];
                    updated[idx].odd = e.target.value;
                    setOddsRows(updated);
                  }}
                  className="w-24 text-right bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-emerald-400 font-mono font-bold focus:outline-none focus:border-emerald-500"
                  placeholder="2.00"
                />
                {oddsRows.length > 2 && (
                  <button
                    onClick={() => handleRemoveRow(idx)}
                    className="p-1.5 text-slate-500 hover:text-rose-400"
                    title="Eliminar opción"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Additional context */}
        <div>
          <label className="block text-slate-400 mb-1 font-mono text-[11px]">
            Contexto o fuentes adicionales que conozcas (Opcional):
          </label>
          <textarea
            rows={2}
            value={additionalContext}
            onChange={(e) => setAdditionalContext(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white font-sans focus:outline-none focus:border-cyan-500"
            placeholder="ej: El delantero centro titular es baja confirmada. Árbitro designado: Anthony Taylor..."
          />
        </div>

        {/* Submit action bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between pt-2 gap-3">
          {error && (
            <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-950/40 p-2 rounded border border-rose-800/60 w-full sm:w-auto">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center gap-2 ml-auto w-full sm:w-auto justify-end">
            <button
              onClick={() => handleRunAnalysis(true)}
              disabled={isLoading}
              className="px-3.5 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors border border-slate-700 flex items-center gap-1.5"
              title="Genera el informe matemático sin depender de la API de búsqueda web"
            >
              <Cpu className="w-3.5 h-3.5 text-emerald-400" />
              <span>Motor Local</span>
            </button>

            <button
              onClick={() => handleRunAnalysis()}
              disabled={isLoading}
              className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-semibold text-xs transition-all shadow-lg shadow-cyan-950"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Procesando Protocolo Cuantitativo...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Ejecutar Análisis Cuantitativo</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Loading state indicator */}
      {isLoading && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-8 text-center space-y-3">
          <div className="w-10 h-10 border-2 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin mx-auto" />
          <h4 className="text-sm font-semibold text-white">
            Ejecutando proceso cuantitativo estricto...
          </h4>
          <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
            Calculando margen de la casa, probabilidades justas desmargenadas, verificando datos de xG y aplicando reglas de Kelly y veredicto.
          </p>
        </div>
      )}

      {/* Output Display */}
      {analysisOutput && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-slate-800 gap-3">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-semibold text-white">
                Informe Oficial Generado por el Analista Cuantitativo
              </h3>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {onTransferToWorkbench && (
                <button
                  onClick={handleSendToWorkbench}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-950/60 hover:bg-emerald-900/60 text-xs text-emerald-300 transition-colors border border-emerald-800/80 font-medium"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Abrir en Workbench</span>
                </button>
              )}

              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition-colors border border-slate-700"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copiar Texto</span>
                  </>
                )}
              </button>

              <button
                onClick={handleDownload}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition-colors border border-slate-700"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Descargar TXT</span>
              </button>
            </div>
          </div>

          {/* Sources consulted */}
          {sources.length > 0 && (
            <div className="bg-slate-950/70 border border-slate-800/80 rounded p-3 text-xs space-y-1">
              <span className="text-slate-400 block text-[11px] font-mono">
                Fuentes cuantitativas consultadas:
              </span>
              <div className="flex flex-wrap gap-2 pt-1">
                {sources.map((src, i) => (
                  <a
                    key={i}
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-cyan-300 hover:text-white text-[11px] font-mono transition-colors"
                  >
                    <span>{src.title || 'Fuente deportiva'}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Preformatted text preserving strict structure */}
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 font-mono text-xs text-slate-200 leading-relaxed overflow-x-auto whitespace-pre-wrap">
            {analysisOutput}
          </div>

          <div className="p-3 bg-slate-950 border border-slate-800/80 rounded text-center text-xs text-slate-400 italic">
            «Análisis informativo basado en estimaciones; no garantiza resultados.»
          </div>
        </div>
      )}
    </div>
  );
};
