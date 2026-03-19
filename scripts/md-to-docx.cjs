const fs = require('fs');
const path = require('path');
const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');

const mdPath = path.join(__dirname, '..', 'docs', 'CONFIGURAR_DOMINIO_E_HTTPS_N8N.md');
const outPath = path.join(__dirname, '..', 'docs', 'CONFIGURAR_DOMINIO_E_HTTPS_N8N.docx');

const md = fs.readFileSync(mdPath, 'utf8');
const lines = md.split(/\r?\n/);

const children = [];
let i = 0;

function flushCodeBlock(code) {
  if (!code.trim()) return;
  children.push(
    new Paragraph({
      children: [new TextRun({ text: code, font: 'Consolas', size: 22 })],
      spacing: { after: 200 }
    })
  );
}

while (i < lines.length) {
  const line = lines[i];
  const trimmed = line.trim();

  if (trimmed.startsWith('# ')) {
    children.push(new Paragraph({ text: trimmed.slice(2), heading: HeadingLevel.TITLE, spacing: { after: 400 } }));
    i++;
    continue;
  }
  if (trimmed.startsWith('## ')) {
    children.push(new Paragraph({ text: trimmed.slice(3), heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 200 } }));
    i++;
    continue;
  }
  if (trimmed.startsWith('### ')) {
    children.push(new Paragraph({ text: trimmed.slice(4), heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 } }));
    i++;
    continue;
  }
  if (trimmed === '---') {
    i++;
    continue;
  }
  if (trimmed.startsWith('```')) {
    const codeLines = [];
    i++;
    while (i < lines.length && !lines[i].trim().startsWith('```')) {
      codeLines.push(lines[i]);
      i++;
    }
    if (i < lines.length) i++;
    flushCodeBlock(codeLines.join('\n'));
    continue;
  }
  if (trimmed.startsWith('- ') || /^\d+\.\s/.test(trimmed)) {
    children.push(new Paragraph({
      children: [new TextRun({ text: trimmed, bullet: { level: 0 } })],
      spacing: { after: 80 }
    }));
    i++;
    continue;
  }
  if (trimmed.startsWith('|')) {
    const tableLines = [];
    while (i < lines.length && lines[i].trim().startsWith('|')) {
      tableLines.push(lines[i]);
      i++;
    }
    const rowTexts = tableLines
      .filter(l => !/^[\s|\-]+$/.test(l.trim()))
      .map(l => l.split('|').slice(1, -1).map(c => c.trim()).join(' | '));
    rowTexts.forEach(row => {
      children.push(new Paragraph({ text: row, spacing: { after: 80 } }));
    });
    children.push(new Paragraph({ text: '', spacing: { after: 200 } }));
    continue;
  }
  if (trimmed) {
    const text = trimmed
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/`(.+?)`/g, '$1');
    children.push(new Paragraph({ text, spacing: { after: 120 } }));
  } else {
    children.push(new Paragraph({ text: '', spacing: { after: 80 } }));
  }
  i++;
}

const doc = new Document({
  sections: [{ properties: {}, children }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync(outPath, buffer);
  console.log('Arquivo salvo:', outPath);
});
