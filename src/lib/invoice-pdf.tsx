import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { BUSINESS, BANK, INVOICE_DEFAULTS } from "./business";
import type { InvoiceData } from "./invoices";

/* ─── Layout constants ──────────────────────────────────────────── */

const COLOR = BUSINESS.brand;

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 40,
    paddingHorizontal: 48,
    fontSize: 10,
    color: COLOR.text,
    fontFamily: "Helvetica",
  },

  // Header
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  wordmark: { fontSize: 28, color: COLOR.primary, fontWeight: "light", letterSpacing: 1 },
  wordmarkAccent: { color: COLOR.accent },
  websiteLine: { marginTop: 4, fontSize: 8, color: COLOR.muted, letterSpacing: 1.5, textTransform: "uppercase" },
  invoiceLabel: { fontSize: 8, letterSpacing: 1.5, textTransform: "uppercase", color: COLOR.muted, marginBottom: 4 },
  invoiceNumber: { fontSize: 14, fontFamily: "Courier", fontWeight: "bold", color: COLOR.text },

  // Divider
  divider: { height: 2, backgroundColor: COLOR.primary, marginTop: 16, marginBottom: 0 },
  dividerAccent: {
    height: 2,
    backgroundColor: COLOR.accent,
    width: "30%",
    alignSelf: "flex-end",
    marginTop: -2,
  },

  // Bill To / From
  partiesRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 28, marginBottom: 24 },
  party: { width: "48%" },
  partyLabel: { fontSize: 8, letterSpacing: 1.5, textTransform: "uppercase", color: COLOR.muted, marginBottom: 6 },
  partyName: { fontSize: 12, fontWeight: "bold", color: COLOR.text, marginBottom: 3 },
  partyText: { fontSize: 10, color: COLOR.muted, lineHeight: 1.5 },
  partyMono: { fontSize: 9, fontFamily: "Courier", color: COLOR.muted, marginTop: 4 },

  // Meta strip
  metaStrip: {
    backgroundColor: COLOR.softBg,
    borderRadius: 6,
    padding: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  metaCell: { flex: 1 },
  metaCellLast: { flex: 1, alignItems: "flex-end" },
  metaSubLabel: { fontSize: 7, letterSpacing: 1, textTransform: "uppercase", color: COLOR.muted, marginBottom: 3 },
  metaValue: { fontSize: 10, fontWeight: "bold", color: COLOR.text },
  metaValueAccent: { fontSize: 10, fontWeight: "bold", color: COLOR.accent },

  // Section label
  sectionLabel: { fontSize: 8, letterSpacing: 1.5, textTransform: "uppercase", color: COLOR.muted, marginBottom: 8 },

  // Table
  tableContainer: { borderWidth: 1, borderColor: COLOR.border, borderRadius: 6, overflow: "hidden", marginBottom: 16 },
  tableHeader: { flexDirection: "row", backgroundColor: COLOR.text },
  th: { color: "#fff", fontSize: 8, letterSpacing: 1, textTransform: "uppercase", padding: 10 },
  thUser: { width: "60%" },
  thCalls: { width: "20%", textAlign: "right" },
  thCost: { width: "20%", textAlign: "right" },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: COLOR.border },
  trAlt: { backgroundColor: COLOR.softBg },
  td: { padding: 10, fontSize: 10 },
  tdUser: { width: "60%" },
  tdCalls: { width: "20%", textAlign: "right" },
  tdCost: { width: "20%", textAlign: "right", fontFamily: "Courier" },
  tdUserName: { fontSize: 10, color: COLOR.text, fontWeight: "bold" },
  tdUserEmail: { fontSize: 8, color: COLOR.muted, fontFamily: "Courier", marginTop: 2 },
  emptyRow: { padding: 24, textAlign: "center", color: COLOR.muted, fontSize: 10 },

  // Totals
  totalsRow: { flexDirection: "row", justifyContent: "flex-end", paddingVertical: 4 },
  totalsLabel: { fontSize: 9, color: COLOR.muted, marginRight: 16, alignSelf: "center" },
  totalsValue: { fontSize: 10, color: COLOR.text, width: 100, textAlign: "right", fontFamily: "Courier" },
  totalsDivider: { borderTopWidth: 1, borderTopColor: COLOR.border, marginVertical: 6 },
  grandTotalDivider: { borderTopWidth: 2, borderTopColor: COLOR.text, marginTop: 8, marginBottom: 4 },
  grandTotalRow: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", paddingTop: 8 },
  grandTotalLabel: { fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: COLOR.text, fontWeight: "bold", marginRight: 16 },
  grandTotalValue: { fontSize: 16, color: COLOR.text, fontWeight: "bold", width: 130, textAlign: "right", fontFamily: "Courier" },

  // Payment
  paymentBox: {
    borderLeftWidth: 3,
    borderLeftColor: COLOR.accent,
    backgroundColor: COLOR.softBg,
    padding: 16,
    marginTop: 24,
  },
  paymentIntro: { fontSize: 9, color: COLOR.muted, marginBottom: 10 },
  payRow: { flexDirection: "row", paddingVertical: 2 },
  payLabel: { width: 90, fontSize: 9, color: COLOR.muted },
  payValue: { fontSize: 9, color: COLOR.text, flex: 1 },
  payValueMono: { fontSize: 9, color: COLOR.text, fontFamily: "Courier", flex: 1 },
  payRefNote: { fontSize: 8, color: COLOR.muted, marginTop: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: COLOR.border },

  // Notes
  notesBlock: { marginTop: 24 },
  notesText: { fontSize: 9, color: COLOR.muted, lineHeight: 1.5 },

  // Footer
  footer: { marginTop: 28, paddingTop: 16, borderTopWidth: 1, borderTopColor: COLOR.border },
  footerThanks: { fontSize: 10, color: COLOR.text, marginBottom: 4 },
  footerLegal: { fontSize: 8, color: COLOR.muted, lineHeight: 1.5 },
  footerContact: { fontSize: 8, color: COLOR.muted, marginTop: 12 },
  footerOuter: { textAlign: "center", marginTop: 20, fontSize: 7, color: COLOR.muted },
});

/* ─── Helpers ───────────────────────────────────────────────────── */

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const fmt = (n: number) => `$${n.toFixed(2)}`;

/* ─── PDF Document ──────────────────────────────────────────────── */

interface Props {
  data: InvoiceData;
  invoiceNumber: string;
  issueTs: number;
  dueTs: number;
}

function InvoiceDocument({ data, invoiceNumber, issueTs, dueTs }: Props) {
  return (
    <Document
      title={`Invoice ${invoiceNumber}`}
      author={BUSINESS.legalName}
      subject={`Invoice for ${data.company.name} — ${data.periodLabel}`}
      creator="convra"
      producer="convra"
    >
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.wordmark}>
              convra<Text style={styles.wordmarkAccent}>.</Text>
            </Text>
            <Text style={styles.websiteLine}>{BUSINESS.website}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.invoiceLabel}>Invoice</Text>
            <Text style={styles.invoiceNumber}>{invoiceNumber}</Text>
          </View>
        </View>

        <View style={styles.divider} />
        <View style={styles.dividerAccent} />

        {/* Bill To / From */}
        <View style={styles.partiesRow}>
          <View style={styles.party}>
            <Text style={styles.partyLabel}>Billed to</Text>
            <Text style={styles.partyName}>{data.company.name}</Text>
            <Text style={styles.partyMono}>{data.company.email}</Text>
          </View>
          <View style={[styles.party, { alignItems: "flex-end" }]}>
            <Text style={styles.partyLabel}>From</Text>
            <Text style={styles.partyName}>{BUSINESS.legalName}</Text>
            {BUSINESS.addressLines.map((line, i) => (
              <Text key={i} style={styles.partyText}>{line}</Text>
            ))}
            <Text style={styles.partyMono}>{BUSINESS.email}</Text>
            <Text style={styles.partyMono}>{BUSINESS.phone}</Text>
          </View>
        </View>

        {/* Meta strip */}
        <View style={styles.metaStrip}>
          <View style={styles.metaCell}>
            <Text style={styles.metaSubLabel}>Period</Text>
            <Text style={styles.metaValue}>{data.periodLabel}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaSubLabel}>Issued</Text>
            <Text style={styles.metaValue}>{formatDate(issueTs)}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaSubLabel}>Due</Text>
            <Text style={styles.metaValueAccent}>{formatDate(dueTs)}</Text>
          </View>
          <View style={styles.metaCellLast}>
            <Text style={styles.metaSubLabel}>Currency</Text>
            <Text style={styles.metaValue}>USD</Text>
          </View>
        </View>

        {/* Line items */}
        <Text style={styles.sectionLabel}>Usage Details</Text>
        <View style={styles.tableContainer}>
          <View style={styles.tableHeader}>
            <Text style={[styles.th, styles.thUser]}>User</Text>
            <Text style={[styles.th, styles.thCalls]}>Calls</Text>
            <Text style={[styles.th, styles.thCost]}>Cost</Text>
          </View>
          {data.lines.length === 0 ? (
            <View style={styles.tr}>
              <Text style={styles.emptyRow}>No usage recorded for this period.</Text>
            </View>
          ) : (
            data.lines.map((l, i) => (
              <View key={l.userId} style={i % 2 === 1 ? [styles.tr, styles.trAlt] : styles.tr}>
                <View style={[styles.td, styles.tdUser]}>
                  <Text style={styles.tdUserName}>{l.userName}</Text>
                  {l.userEmail && <Text style={styles.tdUserEmail}>{l.userEmail}</Text>}
                </View>
                <Text style={[styles.td, styles.tdCalls]}>{l.calls}</Text>
                <Text style={[styles.td, styles.tdCost]}>{fmt(l.costUsd)}</Text>
              </View>
            ))
          )}
        </View>

        {/* Totals */}
        <View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Total Calls</Text>
            <Text style={styles.totalsValue}>{data.totalCalls}</Text>
          </View>
          <View style={styles.totalsDivider} />
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Subtotal</Text>
            <Text style={styles.totalsValue}>{fmt(data.totalCostUsd)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Tax</Text>
            <Text style={[styles.totalsValue, { color: COLOR.muted }]}>—</Text>
          </View>
          <View style={styles.grandTotalDivider} />
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>Total Due</Text>
            <Text style={styles.grandTotalValue}>{fmt(data.totalCostUsd)} USD</Text>
          </View>
        </View>

        {/* Payment Instructions */}
        <Text style={[styles.sectionLabel, { marginTop: 28 }]}>Payment Instructions</Text>
        <View style={styles.paymentBox}>
          <Text style={styles.paymentIntro}>
            Wire transfer (USD or local equivalent) — payment terms: Net {INVOICE_DEFAULTS.netDays} days
          </Text>
          <View style={styles.payRow}>
            <Text style={styles.payLabel}>Beneficiary</Text>
            <Text style={styles.payValue}>{BANK.beneficiary}</Text>
          </View>
          <View style={styles.payRow}>
            <Text style={styles.payLabel}>Bank</Text>
            <Text style={styles.payValue}>{BANK.bank}</Text>
          </View>
          <View style={styles.payRow}>
            <Text style={styles.payLabel}>Branch</Text>
            <Text style={styles.payValue}>Dunnan Branch</Text>
          </View>
          <View style={styles.payRow}>
            <Text style={styles.payLabel}>Account No.</Text>
            <Text style={styles.payValueMono}>{BANK.account}</Text>
          </View>
          <View style={styles.payRow}>
            <Text style={styles.payLabel}>Bank Code</Text>
            <Text style={styles.payValueMono}>{BANK.bankCode}</Text>
          </View>
          <View style={styles.payRow}>
            <Text style={styles.payLabel}>SWIFT / BIC</Text>
            <Text style={styles.payValueMono}>{BANK.swift}</Text>
          </View>
          <Text style={styles.payRefNote}>
            Please include invoice number {invoiceNumber} in the wire transfer reference.
          </Text>
        </View>

        {data.company.notes ? (
          <View style={styles.notesBlock}>
            <Text style={styles.sectionLabel}>Notes</Text>
            <Text style={styles.notesText}>{data.company.notes}</Text>
          </View>
        ) : null}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerThanks}>{INVOICE_DEFAULTS.thankYou}</Text>
          <Text style={styles.footerLegal}>{INVOICE_DEFAULTS.legal}</Text>
          <Text style={styles.footerContact}>
            Questions? Reply to the email or contact {BUSINESS.email}.
          </Text>
        </View>

        <Text style={styles.footerOuter}>
          {BUSINESS.legalName} · {BUSINESS.website}
        </Text>
      </Page>
    </Document>
  );
}

/**
 * Render the InvoiceData as a PDF buffer (suitable for Resend attachment).
 * Returns a base64 string ready to attach.
 */
export async function renderInvoicePdfBase64(
  data: InvoiceData,
  invoiceNumber: string,
  issueTs: number,
  dueTs: number
): Promise<string> {
  const buffer = await renderToBuffer(
    <InvoiceDocument
      data={data}
      invoiceNumber={invoiceNumber}
      issueTs={issueTs}
      dueTs={dueTs}
    />
  );
  return buffer.toString("base64");
}
