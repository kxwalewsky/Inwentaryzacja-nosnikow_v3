import jsPDF from 'jspdf';
import type { Carrier, Photo, StoreModel } from './api';

export type PdfExportOptions = {
  fileName: string;
  mode: 'all' | 'model';
  model?: StoreModel | null;
};

function split(doc: jsPDF, text: string, width: number) { return doc.splitTextToSize(text || '-', width); }
function safeName(name: string) { return (name || 'inwentaryzacja-nosnikow').replace(/[\\/:*?"<>|]+/g, '-').replace(/\.pdf$/i, '') || 'inwentaryzacja-nosnikow'; }
function addTextPair(doc: jsPDF, label: string, value: string, x: number, y: number, width = 82) {
  doc.setFont('helvetica', 'bold');
  doc.text(`${label}:`, x, y);
  doc.setFont('helvetica', 'normal');
  doc.text(split(doc, value || '-', width), x + 37, y);
}
function addFittedImage(doc: jsPDF, dataUrl: string, x: number, y: number, maxW: number, maxH: number) {
  try {
    const props = doc.getImageProperties(dataUrl);
    const ratio = Math.min(maxW / props.width, maxH / props.height);
    const w = props.width * ratio;
    const h = props.height * ratio;
    const dx = x + (maxW - w) / 2;
    const dy = y + (maxH - h) / 2;
    doc.addImage(dataUrl, props.fileType as any, dx, dy, w, h, undefined, 'FAST');
  } catch {
    try { doc.addImage(dataUrl, 'JPEG', x, y, maxW, maxH, undefined, 'FAST'); } catch {}
  }
}

export function exportCarriersPdf(carriers: Carrier[], photosByCarrier: Record<number, Photo[]>, options: PdfExportOptions) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const generated = new Date().toLocaleString('pl-PL');

  // Uwaga: po podłączeniu własnego pliku TTF można tutaj użyć addFileToVFS/addFont.
  // Cały tekst jest generowany przez jsPDF z polskimi znakami w danych wejściowych.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.text('Inwentaryzacja nośników', 20, 38);
  doc.setFontSize(15);
  if (options.mode === 'model' && options.model) {
    doc.text(options.model.name, 20, 50);
    if (options.model.image_data_url) addFittedImage(doc, options.model.image_data_url, 20, 62, 165, 95);
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  const infoY = options.mode === 'model' && options.model?.image_data_url ? 172 : 64;
  doc.text(`Eksportowane nośniki: ${carriers.length}`, 20, infoY);
  doc.text(`Data wygenerowania: ${generated}`, 20, infoY + 8);

  doc.addPage();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Spis treści', 20, 25);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  carriers.forEach((c, idx) => doc.text(`${idx + 1}. ${c.own_name} (${c.public_id})`, 24, 38 + idx * 7));

  carriers.forEach((c, index) => {
    doc.addPage();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(c.own_name, 15, 18);
    doc.setFontSize(10);
    addTextPair(doc, 'ID', c.public_id, 15, 26);
    addTextPair(doc, 'Model', c.model_links.map(m => m.store_model_name).join(', ') || c.store_model_name, 15, 32);
    addTextPair(doc, 'Kategoria', c.model_links.map(m => m.category_name).join(', ') || c.category_name, 15, 38);

    doc.setDrawColor(210);
    doc.line(15, 43, 195, 43);

    addTextPair(doc, 'Nazwa magazynowa', c.warehouse_name || '-', 15, 53);
    addTextPair(doc, 'Wymiary', `${c.width} × ${c.height} × ${c.depth} ${c.unit}`, 15, 63);
    addTextPair(doc, 'Tagi', c.tags.map(t => t.name).join(', ') || '-', 15, 73);
    doc.setFont('helvetica', 'bold');
    doc.text('Opis:', 15, 86);
    doc.setFont('helvetica', 'normal');
    doc.text(split(doc, c.description, 82), 15, 93);

    const photos = (photosByCarrier[c.id] || []).slice(0, 3);
    doc.setFont('helvetica', 'bold');
    doc.text('Zdjęcia przypisane po tagach', 110, 53);
    doc.setFont('helvetica', 'normal');
    photos.forEach((p, i) => {
      const y = 60 + i * 72;
      const boxW = 82.5;
      const boxH = 55;
      doc.rect(110, y, boxW, boxH);
      if (p.data_url) addFittedImage(doc, p.data_url, 110, y, boxW, boxH);
      doc.setFontSize(8);
      doc.text(split(doc, p.description || p.file_name, boxW), 110, y + 60);
      doc.setFontSize(10);
    });
    if (photos.length === 0) doc.text('Brak zdjęć z pasującymi tagami.', 110, 62);

    doc.setFontSize(8);
    doc.text(`Strona ${index + 3} · ${generated}`, 15, 287);
  });

  doc.save(`${safeName(options.fileName)}.pdf`);
}
