import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export type EventTicketPdfDetails = {
  attendeeName: string;
  attendeeEmail: string;
  eventTitle: string;
  eventDate: string;
  eventLocation: string;
  ticketType: string;
  ticketSelections?: { ticketType: string; quantity: number; lineTotalKsh: number }[] | null;
  amountKsh?: number | null;
  childName?: string | null;
  childAge?: number | null;
  childDetails?: { name: string; age: number }[];
  ticketCode: string;
  poster?: {
    contentType: 'image/png' | 'image/jpeg';
    bytes: Uint8Array;
  };
};

const green = rgb(58 / 255, 107 / 255, 74 / 255);
const greenDark = rgb(42 / 255, 78 / 255, 54 / 255);
const blue = rgb(58 / 255, 156 / 255, 184 / 255);
const sand = rgb(212 / 255, 165 / 255, 116 / 255);
const sandLight = rgb(232 / 255, 196 / 255, 154 / 255);
const ivory = rgb(247 / 255, 243 / 255, 238 / 255);
const ink = rgb(26 / 255, 26 / 255, 26 / 255);
const muted = rgb(74 / 255, 74 / 255, 74 / 255);
const border = rgb(58 / 255, 107 / 255, 74 / 255);

export async function createEventTicketPdf(details: EventTicketPdfDetails, qrCode: Buffer): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.setTitle(`Event ticket - ${details.eventTitle}`);
  document.setSubject(`Ticket ${details.ticketCode}`);
  document.setAuthor('NEYD Events');

  const page = document.addPage([595, 842]);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const qrImage = await document.embedPng(qrCode);
  const posterImage = details.poster
    ? details.poster.contentType === 'image/png'
      ? await document.embedPng(details.poster.bytes)
      : await document.embedJpg(details.poster.bytes)
    : undefined;
  const pageWidth = page.getWidth();
  const safe = (value: string) => toPdfText(value);

  page.drawRectangle({
    x: 0,
    y: 0,
    width: pageWidth,
    height: page.getHeight(),
    color: ivory,
  });
  page.drawRectangle({
    x: 0,
    y: 718,
    width: pageWidth,
    height: 124,
    color: greenDark,
  });
  if (posterImage) {
    const posterSize = posterImage.scaleToFit(132, 96);
    page.drawImage(posterImage, {
      x: 547 - posterSize.width,
      y: 732 + (96 - posterSize.height) / 2,
      width: posterSize.width,
      height: posterSize.height,
    });
  }
  page.drawText('NEYD EVENTS', {
    x: 48,
    y: 800,
    size: 11,
    font: bold,
    color: sand,
  });
  page.drawText('YOUR EVENT TICKET', {
    x: 48,
    y: 762,
    size: 25,
    font: bold,
    color: ivory,
  });
  page.drawText('PAYMENT CONFIRMED', {
    x: 48,
    y: 738,
    size: 9,
    font: bold,
    color: sandLight,
  });

  const titleLines = wrapText(safe(details.eventTitle), bold, 21, 499);
  let y = 674;
  for (const line of titleLines.slice(0, 3)) {
    page.drawText(line, { x: 48, y, size: 21, font: bold, color: greenDark });
    y -= 27;
  }
  y -= 18;

  const fields: Array<[string, string]> = [
    ['ATTENDEE', details.attendeeName],
    ['EMAIL', details.attendeeEmail],
    ['DATE', details.eventDate],
    ['LOCATION', details.eventLocation],
    ['TICKET TYPE', details.ticketType],
    ...(details.ticketSelections?.length
      ? [['TICKETS', details.ticketSelections.map((selection) =>
          `${selection.ticketType} x ${selection.quantity} - KES ${selection.lineTotalKsh.toLocaleString()}`,
        ).join('; ')] as [string, string]]
      : []),
    ...(details.amountKsh !== null && details.amountKsh !== undefined
      ? [['TOTAL PAID (KES)', details.amountKsh.toLocaleString()] as [string, string]]
      : []),
    ...(details.childDetails?.length
      ? [['CHILDREN', details.childDetails.map((child) => `${child.name} (age ${child.age})`).join('; ')] as [string, string]]
      : details.childName
        ? [['CHILD', `${details.childName}${details.childAge !== null && details.childAge !== undefined ? ` (age ${details.childAge})` : ''}`] as [string, string]]
      : []),
  ];
  for (const [label, rawValue] of fields) {
    page.drawText(label, {
      x: 48,
      y,
      size: 8,
      font: bold,
      color: green,
    });
    y -= 18;
    const lines = wrapText(safe(rawValue), regular, 12, 255);
    for (const line of lines.slice(0, 2)) {
      page.drawText(line, { x: 48, y, size: 12, font: regular, color: ink });
      y -= 16;
    }
    y -= 13;
  }

  page.drawRectangle({
    x: 352,
    y: 327,
    width: 195,
    height: 195,
    color: rgb(1, 1, 1),
    borderColor: border,
    borderWidth: 1,
  });
  page.drawImage(qrImage, {
    x: 365,
    y: 340,
    width: 169,
    height: 169,
  });
  page.drawText('SCAN AT CHECK-IN', {
    x: 385,
    y: 309,
    size: 8,
    font: bold,
    color: blue,
  });

  page.drawLine({
    start: { x: 48, y: 130 },
    end: { x: 547, y: 130 },
    thickness: 1,
    color: border,
  });
  page.drawText('TICKET CODE', {
    x: 48,
    y: 105,
    size: 8,
    font: bold,
    color: blue,
  });
  page.drawText(safe(details.ticketCode), {
    x: 48,
    y: 82,
    size: 11,
    font: bold,
    color: greenDark,
  });
  page.drawText('Keep this ticket private and have the QR code ready at the event entrance.', {
    x: 48,
    y: 48,
    size: 9,
    font: regular,
    color: muted,
    maxWidth: 499,
  });

  return document.save();
}

function wrapText(text: string, font: Awaited<ReturnType<PDFDocument['embedFont']>>, fontSize: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(candidate, fontSize) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function toPdfText(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^\x20-\x7E]/g, '?');
}
