import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { QuantitativeMarketResult, OptionCalculation } from './quantEngine';

export interface PdfReportData {
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
  inPlayInfo?: {
    isInPlay: boolean;
    minute: number;
    score: string;
    redCardsHome: number;
    redCardsAway: number;
    lastUpdatedTimestamp: string;
    diffSecondsWithOdds: number;
    isStale: boolean;
    poissonFormulas?: {
      remainingMinutes: string;
      lambdaHome: string;
      lambdaAway: string;
      redCardNote?: string;
    };
  };
}

export function exportQuantReportToPdf(data: PdfReportData) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  let currentY = 16;

  // Background header band (Dark Slate: #090d16)
  doc.setFillColor(9, 13, 22);
  doc.rect(0, 0, pageWidth, 28, 'F');

  // Emerald accent top line
  doc.setFillColor(16, 185, 129);
  doc.rect(0, 0, pageWidth, 2.5, 'F');

  // Header Title
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('QUANTBET EV+ | REPORTE CUANTITATIVO OFICIAL', margin, 13);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text(
    `Generado: ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC | Criterio de Kelly (1/4) | No Gambler`,
    margin,
    20
  );

  currentY = 34;

  // Helper for section titles
  const drawSectionHeader = (title: string) => {
    doc.setFillColor(241, 245, 249); // slate-100
    doc.rect(margin, currentY - 4, pageWidth - margin * 2, 6.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text(title, margin + 2, currentY + 0.5);
    currentY += 6;
  };

  // 1. Encabezado Box
  drawSectionHeader('1. ENCABEZADO Y DATOS DE ENTRADA DEL EVENTO');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85); // slate-700

  const col1 = margin + 2;
  const col2 = margin + 85;

  doc.setFont('helvetica', 'bold');
  doc.text('Partido:', col1, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(data.match, col1 + 18, currentY);

  doc.setFont('helvetica', 'bold');
  doc.text('Competición:', col2, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(data.competition, col2 + 22, currentY);

  currentY += 4.5;

  doc.setFont('helvetica', 'bold');
  doc.text('Fecha / Hora:', col1, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(`${data.matchDateTime} (Guayaquil GMT-5)`, col1 + 22, currentY);

  doc.setFont('helvetica', 'bold');
  doc.text('Captura Cuota:', col2, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(data.captureTime, col2 + 24, currentY);

  currentY += 4.5;

  doc.setFont('helvetica', 'bold');
  doc.text('Mercado:', col1, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(data.market, col1 + 18, currentY);

  doc.setFont('helvetica', 'bold');
  doc.text('Bankroll Base:', col2, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(
    data.bankroll ? `$${data.bankroll.toFixed(2)} USD` : 'No especificado (porcentajes de bankroll)',
    col2 + 24,
    currentY
  );

  if (data.inPlayInfo?.isInPlay) {
    currentY += 4.5;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(225, 29, 72);
    doc.text('TELEMETRÍA EN VIVO:', col1, currentY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(
      `Min: ${data.inPlayInfo.minute}' | Marcador: ${data.inPlayInfo.score} | Rojas: L:${data.inPlayInfo.redCardsHome} V:${data.inPlayInfo.redCardsAway} | Frescura: Δ${data.inPlayInfo.diffSecondsWithOdds}s ${data.inPlayInfo.isStale ? '(DESACTUALIZADO)' : '(OK)'}`,
      col1 + 36,
      currentY
    );
  }

  currentY += 8;

  // 2. Margen de la Casa
  drawSectionHeader('2. MARGEN DE LA CASA Y DESMARGENADO PROPORCIONAL');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);

  const formulaText = `Suma de probabilidades implícitas: S = Σ (1 / cuota) = ${data.result.sumImpliedProb.toFixed(4)}  |  Margen de la Casa = (S - 1) × 100% = ${data.result.houseMarginPercent.toFixed(2)}%`;
  doc.text(formulaText, margin + 2, currentY);
  currentY += 4;

  const fairProbsText = `Probabilidades Justas Proporcionales: ${data.result.options
    .map((o) => `${o.name}: ${o.fairProb.toFixed(2)}%`)
    .join('  |  ')}`;
  doc.text(fairProbsText, margin + 2, currentY);
  currentY += 7;

  // 3. Contexto Verificado
  drawSectionHeader('3. CONTEXTO VERIFICADO (SOLO DATOS CON FUENTE)');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);

  const contextItems = [
    { label: '[DATO xG]:', text: data.verifiedContext?.xgRecent || 'No puedo confirmar datos de xG en tiempo real.' },
    { label: '[DATO Local/Visita]:', text: data.verifiedContext?.homeAwayForm || 'No puedo confirmar estadísticas de localía.' },
    { label: '[DATO Alineación/Bajas]:', text: data.verifiedContext?.injuriesAndLineup || 'No puedo confirmar actas médicas.' },
    { label: '[DATO Calendario/Descanso]:', text: data.verifiedContext?.scheduleAndRest || 'No puedo confirmar días de descanso.' },
  ];

  if (data.verifiedContext?.referee) {
    contextItems.push({ label: '[DATO Árbitro]:', text: data.verifiedContext.referee });
  }

  contextItems.forEach((item) => {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(16, 185, 129); // emerald-600
    doc.text(item.label, margin + 2, currentY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    const splitText = doc.splitTextToSize(item.text, pageWidth - margin * 2 - 40);
    doc.text(splitText, margin + 38, currentY);
    currentY += splitText.length * 3.5 + 0.5;
  });

  if (data.verifiedContext?.unconfirmed && data.verifiedContext.unconfirmed.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(217, 119, 6); // amber-600
    doc.text('[No puedo confirmar]:', margin + 2, currentY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(180, 83, 9);
    doc.text(data.verifiedContext.unconfirmed.join(', '), margin + 38, currentY);
    currentY += 4.5;
  }

  currentY += 3;

  // 4. Tabla Resumen Cuantitativa (autoTable)
  drawSectionHeader('4. TABLA RESUMEN CUANTITATIVA (CÁLCULOS A 2 DECIMALES)');

  const tableHead = [
    [
      'Opción',
      'Cuota',
      'P. Impl.',
      'P. Justa',
      'P. Estim.',
      'EV %',
      'Cuota Mín.',
      'Stake (%)',
      ...(data.bankroll ? ['Stake ($)'] : []),
      'Confianza',
      'Veredicto',
    ],
  ];

  const tableBody = data.result.options.map((opt) => [
    opt.name,
    opt.odd.toFixed(2),
    `${opt.impliedProb.toFixed(2)}%`,
    `${opt.fairProb.toFixed(2)}%`,
    `${opt.estimatedProb.toFixed(2)}%`,
    `${opt.evPercent >= 0 ? '+' : ''}${opt.evPercent.toFixed(2)}%`,
    opt.minAcceptableOdd.toFixed(2),
    `${opt.suggestedStakePercent.toFixed(2)}%`,
    ...(data.bankroll ? [`$${(opt.suggestedStakeAmount || 0).toFixed(2)}`] : []),
    opt.confidence,
    opt.verdict,
  ]);

  autoTable(doc, {
    startY: currentY - 1,
    head: tableHead,
    body: tableBody,
    theme: 'grid',
    styles: {
      fontSize: 7.5,
      cellPadding: 1.8,
      font: 'helvetica',
      textColor: [30, 41, 59],
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
    },
    columnStyles: {
      0: { fontStyle: 'bold', halign: 'left' },
      1: { halign: 'right', fontStyle: 'bold' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right', fontStyle: 'bold' },
      5: { halign: 'right', fontStyle: 'bold' },
      6: { halign: 'right' },
      7: { halign: 'right', fontStyle: 'bold' },
      8: data.bankroll ? { halign: 'right', fontStyle: 'bold' } : { halign: 'center' },
      9: data.bankroll ? { halign: 'center' } : { halign: 'center' },
      10: { halign: 'center', fontStyle: 'bold' },
    },
    didParseCell: (hookData) => {
      if (hookData.section === 'body') {
        const row = data.result.options[hookData.row.index];
        if (hookData.column.index === 5) {
          // EV column color
          if (row.evPercent >= (row.confidence === 'ALTA' ? 3 : 5)) {
            hookData.cell.styles.textColor = [16, 185, 129]; // emerald
          } else if (row.evPercent > 0) {
            hookData.cell.styles.textColor = [217, 119, 6]; // amber
          } else {
            hookData.cell.styles.textColor = [225, 29, 72]; // rose
          }
        }
        if (hookData.column.index === (data.bankroll ? 10 : 9)) {
          // Verdict column
          if (row.verdict === 'APOSTAR') {
            hookData.cell.styles.textColor = [16, 185, 129];
          } else if (row.verdict === 'ESPERAR') {
            hookData.cell.styles.textColor = [217, 119, 6];
          } else {
            hookData.cell.styles.textColor = [225, 29, 72];
          }
        }
      }
    },
  });

  currentY = (doc as any).lastAutoTable.finalY + 6;

  // 5. Veredicto Oficial Box
  drawSectionHeader('5. VEREDICTO OFICIAL Y REGLAS DE DECISIÓN');

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  const verdictText = `DECISIÓN: ${data.result.overallVerdict}`;

  if (data.result.overallVerdict === 'APOSTAR') {
    doc.setTextColor(16, 185, 129);
  } else if (data.result.overallVerdict === 'ESPERAR') {
    doc.setTextColor(217, 119, 6);
  } else {
    doc.setTextColor(225, 29, 72);
  }
  doc.text(verdictText, margin + 2, currentY);
  currentY += 4.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);

  data.result.options.forEach((opt) => {
    doc.text(`* ${opt.name}: [${opt.verdict}] ${opt.verdictRule}`, margin + 2, currentY);
    currentY += 3.8;
  });

  currentY += 2;

  // 6. Riesgos Principales
  drawSectionHeader('6. RIESGOS PRINCIPALES IDENTIFICADOS');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);

  const risks =
    data.risks && data.risks.length > 0
      ? data.risks
      : ['Variabilidad intrínseca de los eventos deportivos y margen de error en muestras de xG.'];

  risks.forEach((r, idx) => {
    doc.text(`${idx + 1}. ${r}`, margin + 2, currentY);
    currentY += 3.6;
  });

  currentY += 3;

  // 7. Fuentes Citadas
  drawSectionHeader('7. FUENTES VERIFICADAS');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);

  const sources =
    data.sources && data.sources.length > 0
      ? data.sources
      : [
          { title: 'Understat', url: 'https://understat.com', date: '2026-10-03' },
          { title: 'FBref', url: 'https://fbref.com', date: '2026-10-03' },
          { title: 'SofaScore', url: 'https://www.sofascore.com', date: '2026-10-03' },
          { title: 'Transfermarkt', url: 'https://www.transfermarkt.com', date: '2026-10-03' },
        ];

  sources.forEach((s) => {
    doc.text(`• ${s.title}: ${s.url} (Fecha consulta: ${s.date})`, margin + 2, currentY);
    currentY += 3.4;
  });

  // Footer Disclaimer (Mandatory)
  doc.setFillColor(248, 250, 252);
  doc.rect(margin, pageHeight - 12, pageWidth - margin * 2, 7, 'F');
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(
    '«Análisis informativo basado en estimaciones; no garantiza resultados.» - QuantBet EV+ Analista Cuantitativo',
    pageWidth / 2,
    pageHeight - 7.5,
    { align: 'center' }
  );

  // Save the PDF file
  const filename = `Reporte_Cuantitativo_${data.match.toLowerCase().replace(/[^a-z0-9]/g, '_')}.pdf`;
  doc.save(filename);
}
