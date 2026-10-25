export interface ExportExpense {
  capturedAt: number;
  amountPence: number;
  description: string;
  serial?: string;
  source?: 'camera' | 'upload' | 'manual';
  photo: Blob | null;
}

const WIDTH = 1240;
const HEIGHT = 1754;
const LEFT = 92;
const RIGHT = WIDTH - LEFT;
const INK = '#213027';
const MUTED = '#66766a';
const GREEN = '#536d4e';

function money(pence: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);
}

function date(value: number): string {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(value);
}

function page(title: string, subtitle: string): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('PDF export needs canvas support.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.fillStyle = GREEN;
  context.fillRect(LEFT, 66, 13, 80);
  context.font = 'bold 34px sans-serif';
  context.fillStyle = INK;
  context.fillText('RECEIPTLY', LEFT + 32, 101);
  context.font = '26px sans-serif';
  context.fillStyle = MUTED;
  context.fillText(title, LEFT + 32, 138);
  context.fillStyle = '#d9e1d8';
  context.fillRect(LEFT, 171, RIGHT - LEFT, 2);
  context.font = '21px sans-serif';
  context.fillStyle = MUTED;
  context.fillText(subtitle, LEFT, HEIGHT - 65);
  return { canvas, context };
}

function wrap(context: CanvasRenderingContext2D, value: string, maxWidth: number): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const original of words) {
    let word = original;
    while (context.measureText(word).width > maxWidth) {
      let split = word.length - 1;
      while (split > 1 && context.measureText(word.slice(0, split)).width > maxWidth) split--;
      if (line) { lines.push(line); line = ''; }
      lines.push(word.slice(0, split));
      word = word.slice(split);
    }
    const next = line ? `${line} ${word}` : word;
    if (line && context.measureText(next).width > maxWidth) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function jpeg(canvas: HTMLCanvasElement): Uint8Array {
  const base64 = canvas.toDataURL('image/jpeg', 0.88).split(',')[1];
  if (!base64) throw new Error('Could not render a PDF page.');
  const binary = atob(base64);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

export function pdfFromJpegPages(images: Uint8Array[]): Blob {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [0];
  let length = 0;
  const append = (bytes: Uint8Array): void => { chunks.push(bytes); length += bytes.length; };
  const write = (value: string): void => append(encoder.encode(value));
  const object = (id: number, header: string, data?: Uint8Array): void => {
    offsets[id] = length;
    write(`${id} 0 obj\n${header}`);
    if (data) { write('\nstream\n'); append(data); write('\nendstream'); }
    write('\nendobj\n');
  };
  write('%PDF-1.4\n%Receiptly\n');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  const kids = images.map((_, index) => `${5 + index * 3} 0 R`).join(' ');
  object(2, `<< /Type /Pages /Kids [${kids}] /Count ${images.length} >>`);
  images.forEach((image, index) => {
    const imageId = 3 + index * 3;
    const contentId = imageId + 1;
    const pageId = imageId + 2;
    object(imageId, `<< /Type /XObject /Subtype /Image /Width ${WIDTH} /Height ${HEIGHT} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>`, image);
    const content = encoder.encode('q 595 0 0 842 0 0 cm /Im0 Do Q\n');
    object(contentId, `<< /Length ${content.length} >>`, content);
    object(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`);
  });
  const xref = length;
  write(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
  for (let id = 1; id < offsets.length; id++) write(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  write(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(chunks as BlobPart[], { type: 'application/pdf' });
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read a receipt image.')); };
    image.src = url;
  });
}

export async function createClaimPdf(claimName: string, expenses: ExportExpense[]): Promise<Blob> {
  const images: Uint8Array[] = [];
  let sheet = page('CLAIM SUMMARY', `Created ${date(Date.now())}  •  © Jonny D 2026`);
  let y = 250;
  const nextPage = (): void => { images.push(jpeg(sheet.canvas)); sheet = page('CLAIM SUMMARY (CONTINUED)', claimName); y = 250; };
  sheet.context.fillStyle = INK;
  sheet.context.font = 'bold 48px sans-serif';
  for (const line of wrap(sheet.context, claimName, RIGHT - LEFT)) { sheet.context.fillText(line, LEFT, y); y += 58; }
  y += 45;
  sheet.context.fillStyle = GREEN;
  sheet.context.font = 'bold 29px sans-serif';
  sheet.context.fillText('TOTAL TO CLAIM', LEFT, y);
  sheet.context.font = 'bold 68px sans-serif';
  sheet.context.fillText(money(expenses.reduce((sum, expense) => sum + expense.amountPence, 0)), LEFT, y + 75);
  y += 150;
  sheet.context.fillStyle = MUTED;
  sheet.context.font = '24px sans-serif';
  sheet.context.fillText(`${expenses.length} ${expenses.length === 1 ? 'expense' : 'expenses'}`, LEFT, y);
  y += 80;
  for (const [index, expense] of expenses.entries()) {
    const context = sheet.context;
    context.font = 'bold 30px sans-serif';
    const title = expense.description || expense.serial || `Expense ${index + 1}`;
    const titleLines = wrap(context, title, RIGHT - LEFT - 220);
    context.font = '22px sans-serif';
    const referenceLines = expense.serial ? wrap(context, `Reference: ${expense.serial}`, RIGHT - LEFT) : [];
    const height = Math.max(145, titleLines.length * 38 + 55 + referenceLines.length * 31);
    if (y + height > HEIGHT - 150) nextPage();
    const current = sheet.context;
    current.fillStyle = '#e6ebe4';
    current.fillRect(LEFT, y - 25, RIGHT - LEFT, 2);
    current.fillStyle = INK;
    current.font = 'bold 30px sans-serif';
    titleLines.forEach((line, lineIndex) => current.fillText(line, LEFT, y + lineIndex * 38));
    current.textAlign = 'right';
    current.fillStyle = GREEN;
    current.fillText(money(expense.amountPence), RIGHT, y);
    current.textAlign = 'left';
    let detailY = y + titleLines.length * 38 + 6;
    current.font = '22px sans-serif';
    current.fillStyle = MUTED;
    const kind = !expense.photo ? 'No receipt' : expense.photo.type === 'application/pdf' ? 'Digital PDF (not embedded)' : 'Receipt photo in appendix';
    current.fillText(`${date(expense.capturedAt)}  •  ${kind}`, LEFT, detailY);
    for (const line of referenceLines) { detailY += 31; current.fillText(line, LEFT, detailY); }
    y += height;
  }
  images.push(jpeg(sheet.canvas));

  for (const [index, expense] of expenses.entries()) {
    if (!expense.photo?.type.startsWith('image/')) continue;
    const receiptImage = await loadImage(expense.photo);
    const appendix = page('RECEIPT PHOTO', `${claimName}  •  Expense ${index + 1}`);
    const context = appendix.context;
    context.fillStyle = INK;
    context.font = 'bold 32px sans-serif';
    context.fillText(`Expense ${index + 1} — ${money(expense.amountPence)}`, LEFT, 225);
    context.font = '22px sans-serif';
    context.fillStyle = MUTED;
    context.fillText(date(expense.capturedAt), LEFT, 265);
    const maxWidth = RIGHT - LEFT;
    const maxHeight = HEIGHT - 405;
    const scale = Math.min(maxWidth / receiptImage.naturalWidth, maxHeight / receiptImage.naturalHeight);
    const width = receiptImage.naturalWidth * scale;
    const height = receiptImage.naturalHeight * scale;
    context.drawImage(receiptImage, LEFT + (maxWidth - width) / 2, 310, width, height);
    images.push(jpeg(appendix.canvas));
  }
  return pdfFromJpegPages(images);
}


