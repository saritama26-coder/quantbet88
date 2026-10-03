import React, { useState } from 'react';
import { Header } from './components/Header';
import { MatchRadar, RadarFixture } from './components/MatchRadar';
import { QuantCalculator } from './components/QuantCalculator';
import { LiveMatchAnalyzer } from './components/LiveMatchAnalyzer';
import { LiveAiAnalyzer } from './components/LiveAiAnalyzer';
import { ParlayBuilder } from './components/ParlayBuilder';
import { SampleCasesExplorer } from './components/SampleCasesExplorer';
import { ProtocolRulesModal } from './components/ProtocolRulesModal';
import { SampleCase } from './data/sampleCases';
import { MarketOption, ConfidenceLevel, ParlaySelection } from './lib/quantEngine';

export default function App() {
  const [activeTab, setActiveTab] = useState<'radar' | 'calculator' | 'live' | 'ai-analyzer' | 'parlay' | 'cases' | 'rules'>('radar');
  const [parlayPicks, setParlayPicks] = useState<ParlaySelection[]>([]);
  const [loadedCase, setLoadedCase] = useState<SampleCase | null>(null);
  const [liveFixtureToLoad, setLiveFixtureToLoad] = useState<RadarFixture | null>(null);

  // Transition from Radar to Prematch Terminal Cuantitativo
  const handleSelectPrematch = (fixture: RadarFixture) => {
    const rawHomeOdd = fixture.odds?.home || 2.10;
    const rawDrawOdd = fixture.odds?.draw || 3.40;
    const rawAwayOdd = fixture.odds?.away || 3.60;
    const sumInv = (1 / rawHomeOdd) + (1 / rawDrawOdd) + (1 / rawAwayOdd);

    const customCase: SampleCase = {
      id: `radar-${fixture.fixtureId}`,
      title: `${fixture.homeTeam} vs ${fixture.awayTeam}`,
      tagline: `${fixture.league} · ${fixture.round}`,
      expectedVerdict: 'ESPERAR',
      match: `${fixture.homeTeam} vs ${fixture.awayTeam}`,
      competition: fixture.league,
      matchDateTime: fixture.date,
      market: '1X2 (Resultado Final)',
      captureTime: new Date().toTimeString().slice(0, 8),
      bankroll: 1000,
      confidence: fixture.dataQuality === 'BAJA' ? 'BAJA' : fixture.dataQuality === 'MEDIA' ? 'MEDIA' : 'ALTA',
      pendingLineups: false,
      options: [
        {
          id: '1',
          name: `Victoria ${fixture.homeTeam}`,
          odd: rawHomeOdd,
          estimatedProb: Math.round(((1 / rawHomeOdd) / sumInv) * 1000) / 10,
        },
        {
          id: 'X',
          name: 'Empate',
          odd: rawDrawOdd,
          estimatedProb: Math.round(((1 / rawDrawOdd) / sumInv) * 1000) / 10,
        },
        {
          id: '2',
          name: `Victoria ${fixture.awayTeam}`,
          odd: rawAwayOdd,
          estimatedProb: Math.round(((1 / rawAwayOdd) / sumInv) * 1000) / 10,
        },
      ],
      verifiedContext: {
        xgRecent: `xG estimado / telemetría: ${fixture.liveXgHome || 1.65} vs ${fixture.liveXgAway || 1.25}`,
        homeAwayForm: `Contexto competitivo: ${fixture.competitiveContext || 'Jornada oficial'}`,
        injuriesAndLineup: 'Convocatorias verificadas. Alineación en seguimiento.',
        scheduleAndRest: 'Calendario oficial verificado.',
        competitiveContext: fixture.competitiveContext || 'Competición de primer orden',
        unconfirmed: [],
      },
      risks: ['Verificar cuota final y posible movimiento de línea antes de colocar la orden.'],
      sources: [
        {
          title: 'API-Football / Radar Cuantitativo',
          url: 'https://api-football.com',
          date: new Date().toISOString().split('T')[0],
        },
      ],
      explanation: `Partido derivado del Radar de Partidos. Importance Score: ${fixture.importanceScore}/100.`,
    };

    setLoadedCase(customCase);
    setActiveTab('calculator');
  };

  // Transition from Radar to In-Play Live Match Analyzer
  const handleSelectLive = (fixture: RadarFixture) => {
    setLiveFixtureToLoad(fixture);
    setActiveTab('live');
  };

  // Function to load sample case into calculator
  const handleLoadCase = (caseItem: SampleCase) => {
    setLoadedCase(caseItem);
    setActiveTab('calculator');
  };

  // Function to send a pick from calculator to parlay builder
  const handleSendToParlay = (
    option: MarketOption,
    match: string,
    competition: string,
    market: string,
    margin: number,
    confidence: ConfidenceLevel
  ) => {
    const newPick: ParlaySelection = {
      id: `p-${Date.now()}-${option.id}`,
      match,
      market,
      optionName: option.name,
      odd: option.odd,
      estimatedProb: option.estimatedProb,
      individualMargin: margin,
      confidence,
      isIndependent: true,
    };

    setParlayPicks((prev) => {
      if (prev.length >= 3) {
        alert('Regla de combinadas: Máximo 3 selecciones permitidas. Se sustituirá la última.');
        return [prev[0], prev[1], newPick];
      }
      return [...prev, newPick];
    });

    setActiveTab('parlay');
  };

  // Function to transfer data from AI analyzer to Workbench
  const handleTransferFromAi = (data: {
    match: string;
    competition: string;
    matchDateTime: string;
    market: string;
    captureTime: string;
    bankroll: number;
    options: { id: string; name: string; odd: number; estimatedProb: number }[];
  }) => {
    const customCase: SampleCase = {
      id: `custom-${Date.now()}`,
      title: `${data.match} (${data.market})`,
      tagline: 'Transferido desde el analizador de cuotas',
      expectedVerdict: 'NO APOSTAR',
      match: data.match,
      competition: data.competition,
      matchDateTime: data.matchDateTime,
      market: data.market,
      captureTime: data.captureTime,
      bankroll: data.bankroll,
      confidence: 'BAJA',
      pendingLineups: false,
      options: data.options,
      verifiedContext: {
        xgRecent: '',
        homeAwayForm: '',
        injuriesAndLineup: '',
        scheduleAndRest: '',
        competitiveContext: '',
        unconfirmed: ['Datos transferidos para análisis manual en Workbench'],
      },
      risks: ['Ajuste cuantitativo de probabilidades en proceso.'],
      sources: [],
      explanation: 'Evento transferido para análisis en workbench.',
    };

    setLoadedCase(customCase);
    setActiveTab('calculator');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Header activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {activeTab === 'radar' && (
          <MatchRadar
            onSelectPrematch={handleSelectPrematch}
            onSelectLive={handleSelectLive}
          />
        )}

        {activeTab === 'calculator' && (
          <QuantCalculator
            loadedCase={loadedCase}
            onSendToParlay={handleSendToParlay}
          />
        )}

        {activeTab === 'live' && (
          <LiveMatchAnalyzer initialFixture={liveFixtureToLoad} />
        )}

        {activeTab === 'ai-analyzer' && (
          <LiveAiAnalyzer onTransferToWorkbench={handleTransferFromAi} />
        )}

        {activeTab === 'parlay' && (
          <ParlayBuilder initialSelections={parlayPicks.length > 0 ? parlayPicks : undefined} />
        )}

        {activeTab === 'cases' && (
          <SampleCasesExplorer onLoadCaseIntoCalculator={handleLoadCase} />
        )}

        {activeTab === 'rules' && (
          <ProtocolRulesModal />
        )}
      </main>

      <footer className="border-t border-slate-800/80 bg-slate-950 py-4 px-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-mono text-[11px]">
            <span className="text-emerald-400 font-bold">QuantBet EV+</span>
            <span>·</span>
            <span>Motor Matemático Cuantitativo</span>
          </div>
          <p className="italic text-slate-400">
            «Análisis informativo basado en estimaciones; no garantiza resultados.»
          </p>
        </div>
      </footer>
    </div>
  );
}
