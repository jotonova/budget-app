import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { format } from 'date-fns'
import type { Expense, LedgerData } from './types'
import { formatCurrency } from './utils'

// Victorian color palette as RGB arrays
const NAVY   = [26,  41,  66]  as [number,number,number]
const PARCH  = [244, 237, 224] as [number,number,number]
const GOLD   = [201, 184, 138] as [number,number,number]
const WHITE  = [255, 255, 255] as [number,number,number]
const CREAM  = [250, 246, 238] as [number,number,number]
const INK    = [44,  44,  44]  as [number,number,number]

const TOTAL_PAGES_EXP = '{total_pages_count_string}'

interface ExportOptions {
  expenses: Expense[]
  data: LedgerData
  month: string   // YYYY-MM
  catLabel: (catId: string) => string
}

export function buildLedgerPdf({ expenses, data, month, catLabel }: ExportOptions): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 36
  const innerW = pageW - margin * 2

  const totalIncome = data.income.sources.reduce((s, src) => s + src.monthly, 0)
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0)
  const net = totalIncome - totalExpenses
  const [year, mon] = month.split('-').map(Number)
  const periodLabel = format(new Date(year!, mon! - 1, 1), 'MMMM yyyy')
  const generatedDate = format(new Date(), 'MMMM d, yyyy')

  console.log(`[PDF Export] Building PDF for ${periodLabel} — ${expenses.length} expense(s), total ${formatCurrency(totalExpenses)}`)

  // ── Helper: draw page frame & footer ─────────────────────────────────────────
  function drawFrame(pageNum: number) {
    // Cream background (must be drawn first so content renders on top)
    doc.setFillColor(...CREAM)
    doc.rect(0, 0, pageW, pageH, 'F')

    // Gold border inset ~0.5 inch
    doc.setDrawColor(...GOLD)
    doc.setLineWidth(1)
    doc.rect(margin - 4, margin - 4, innerW + 8, pageH - margin * 2 + 8)
    doc.setLineWidth(0.4)
    doc.rect(margin, margin, innerW, pageH - margin * 2)

    // Footer (total pages filled in by putTotalPages at end)
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8)
    doc.setTextColor(...INK)
    const footerY = pageH - margin + 10
    doc.text(`Page ${pageNum} of ${TOTAL_PAGES_EXP}  ·  Generated ${generatedDate}`, pageW / 2, footerY, { align: 'center' })

    // Ornamental flourish (simple dash pattern)
    doc.setDrawColor(...GOLD)
    doc.setLineWidth(0.4)
    const fw = 40
    doc.line(pageW / 2 - fw, footerY - 6, pageW / 2 + fw, footerY - 6)
  }

  // Draw page 1 frame BEFORE any content so content renders on top of the background
  drawFrame(1)

  let y = margin + 16

  // ── Title section ─────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(26)
  doc.setTextColor(...NAVY)
  doc.text(data.settings.appTitle?.trim() || 'My Budget', pageW / 2, y, { align: 'center' })
  y += 28

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(...NAVY)
  doc.text('Monthly Statement', pageW / 2, y, { align: 'center' })
  y += 16

  doc.setFontSize(9)
  doc.setTextColor(...INK)
  doc.text(`Est. 2026  ·  For the period of ${periodLabel.toUpperCase()}`, pageW / 2, y, { align: 'center' })
  y += 14

  // Double rule
  doc.setDrawColor(...NAVY)
  doc.setLineWidth(1.2)
  doc.line(margin + 20, y, pageW - margin - 20, y)
  doc.setLineWidth(0.4)
  doc.line(margin + 20, y + 3, pageW - margin - 20, y + 3)
  y += 18

  // ── Summary box ───────────────────────────────────────────────────────────────
  const boxH = 68
  doc.setDrawColor(...NAVY)
  doc.setFillColor(...PARCH)
  doc.setLineWidth(0.6)
  doc.rect(margin + 20, y, innerW - 40, boxH, 'FD')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...NAVY)
  doc.text('SUMMARY', margin + 28, y + 12)

  const col1 = margin + 28
  const col2 = pageW / 2
  const rows: [string, string, string, string][] = [
    ['Total expenses:', formatCurrency(totalExpenses), 'Number of entries:', String(expenses.length)],
    ['Income for period:', formatCurrency(totalIncome), 'Net:', formatCurrency(net)],
  ]
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  rows.forEach((row, ri) => {
    const ry = y + 24 + ri * 16
    doc.setFont('helvetica', 'normal'); doc.text(row[0], col1, ry)
    doc.setFont('helvetica', 'bold');   doc.text(row[1], col1 + 100, ry)
    doc.setFont('helvetica', 'normal'); doc.text(row[2], col2, ry)
    doc.setFont('helvetica', 'bold');   doc.text(row[3], col2 + 90, ry)
  })
  y += boxH + 16

  // ── Expense table ─────────────────────────────────────────────────────────────
  const rows2 = expenses.map(e => [
    e.date,
    catLabel(e.categoryId),
    e.description || '—',
    formatCurrency(e.amount),
  ])

  autoTable(doc, {
    startY: y,
    head: [['Date', 'Category', 'Description', 'Amount']],
    body: rows2,
    foot: [['', '', 'Total', formatCurrency(totalExpenses)]],
    margin: { left: margin + 8, right: margin + 8 },
    tableWidth: innerW - 16,
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: 5,
      textColor: INK,
      fillColor: CREAM,
    },
    headStyles: {
      fillColor: NAVY,
      textColor: PARCH,
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'left',
    },
    footStyles: {
      fillColor: PARCH,
      textColor: NAVY,
      fontStyle: 'bold',
      halign: 'left',
    },
    alternateRowStyles: { fillColor: WHITE },
    columnStyles: {
      0: { cellWidth: 62 },
      3: { halign: 'right', cellWidth: 68 },
    },
    didDrawPage: (hookData) => {
      // autoTable fires didDrawPage for pages it creates (page 2+)
      if (hookData.pageNumber > 1) drawFrame(hookData.pageNumber)
    },
  })

  // Replace page count placeholder with actual total
  doc.putTotalPages(TOTAL_PAGES_EXP)

  return doc
}
