import React, { useState, useEffect } from 'react';
import { ShieldCheck, BookOpen, Clock, Layers, Calculator, Sparkles, AlertTriangle, Radio, Radar } from 'lucide-react';

interface HeaderProps {
  activeTab: 'radar' | 'calculator' | 'live' | 'ai-analyzer' | 'parlay' | 'cases' | 'rules';
  setActiveTab: (tab: 'radar' | 'calculator' | 'live' | 'ai-analyzer' | 'parlay' | 'cases' | 'rules') => void;
}

export const Header: React.FC<HeaderProps> = ({ activeTab, setActiveTab }) => {
  const [guayaquilTime, setGuayaquilTime] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      // Guayaquil is GMT-5 (America/Guayaquil)
      const now = new Date();
      const options: Intl.DateTimeFormatOptions = {
        timeZone: 'America/Guayaquil',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      };
      const formatted = new Intl.DateTimeFormat('es-EC', options).format(now);
      setGuayaquilTime(`${formatted} (GMT-5)`);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-mono font-bold text-lg">
            EV+
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold text-white tracking-tight">
                QuantBet EV+
              </h1>
              <span className="text-[11px] text-emerald-400 font-mono px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/60">
                1/4 Kelly · No Gambler
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Analista Cuantitativo de Apuestas Deportivas
            </p>
          </div>
        </div>

        {/* Guayaquil clock & status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-950/70 border border-slate-800 rounded px-2.5 py-1 font-mono">
            <Clock className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-500">Hora Guayaquil:</span>
            <span className="text-emerald-300 font-medium tabular-nums">{guayaquilTime || '11:26:00 (GMT-5)'}</span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 text-xs text-amber-400/90 bg-amber-950/30 border border-amber-800/40 rounded px-2.5 py-1">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>Sin valor = «NO APOSTAR»</span>
          </div>
        </div>
      </div>

      {/* Primary Navigation Tabs (Prioridad 24: RADAR -> CALCULADORA -> EN VIVO -> IA -> PARLAYS -> CASOS -> PROTOCOLO) */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <nav className="flex items-center gap-1 overflow-x-auto py-1 scrollbar-none border-t border-slate-800/60">
          <button
            onClick={() => setActiveTab('radar')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-t transition-colors relative ${
              activeTab === 'radar'
                ? 'text-cyan-400 bg-slate-800/80 border-b-2 border-cyan-400 font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
            }`}
          >
            <Radar className="w-3.5 h-3.5 text-cyan-400 animate-spin-slow" />
            <span>Radar de Partidos</span>
          </button>

          <button
            onClick={() => setActiveTab('calculator')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-t transition-colors relative ${
              activeTab === 'calculator'
                ? 'text-emerald-400 bg-slate-800/80 border-b-2 border-emerald-400 font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
            }`}
          >
            <Calculator className="w-3.5 h-3.5" />
            <span>Terminal Cuantitativo</span>
          </button>

          <button
            onClick={() => setActiveTab('live')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-t transition-colors relative ${
              activeTab === 'live'
                ? 'text-rose-400 bg-slate-800/80 border-b-2 border-rose-400 font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            <Radio className="w-3.5 h-3.5" />
            <span>En Vivo (In-Play)</span>
          </button>

          <button
            onClick={() => setActiveTab('ai-analyzer')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-t transition-colors relative ${
              activeTab === 'ai-analyzer'
                ? 'text-emerald-400 bg-slate-800/80 border-b-2 border-emerald-400 font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>Analizador Asistido (Búsqueda en Vivo)</span>
          </button>

          <button
            onClick={() => setActiveTab('parlay')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-t transition-colors relative ${
              activeTab === 'parlay'
                ? 'text-emerald-400 bg-slate-800/80 border-b-2 border-emerald-400 font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Combinadas EV+ (Max 3)</span>
          </button>

          <button
            onClick={() => setActiveTab('cases')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-t transition-colors relative ${
              activeTab === 'cases'
                ? 'text-emerald-400 bg-slate-800/80 border-b-2 border-emerald-400 font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Casos de Estudio Reales</span>
          </button>

          <button
            onClick={() => setActiveTab('rules')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-t transition-colors relative ${
              activeTab === 'rules'
                ? 'text-emerald-400 bg-slate-800/80 border-b-2 border-emerald-400 font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Reglas y Fórmulas</span>
          </button>
        </nav>
      </div>
    </header>
  );
};
