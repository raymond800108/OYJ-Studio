"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Building2,
  Plus,
  Edit2,
  Trash2,
  Mail,
  Eye,
  Send,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Users,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { TKey } from "@/lib/i18n";

/* ─── Types ─────────────────────────────────────────────────────── */

interface Company {
  id: string;
  name: string;
  email: string;
  notes?: string;
  createdAt: number;
}

interface AdminUser {
  id: string;
  name: string;
  email: string | null;
  avatar: string | null;
  plan: string;
  credits: number;
  companyId?: string | null;
}

interface InvoiceLine {
  userId: string;
  userEmail: string | null;
  userName: string;
  calls: number;
  costUsd: number;
}

interface InvoiceData {
  company: Company;
  periodLabel: string;
  periodStart: number;
  periodEnd: number;
  lines: InvoiceLine[];
  totalCalls: number;
  totalCostUsd: number;
}

/* ─── Helpers ───────────────────────────────────────────────────── */

function formatCost(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

/* ─── Component ─────────────────────────────────────────────────── */

export default function AdminInvoiceHub() {
  const { lang, t } = useI18n();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Company form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formNotes, setFormNotes] = useState("");

  // Invoice preview state
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  /* ─── Fetchers ──────────────────────────────────────────────── */

  const fetchCompanies = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/companies");
      const data = await res.json();
      if (Array.isArray(data.companies)) setCompanies(data.companies);
    } catch {}
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      if (Array.isArray(data.users)) setUsers(data.users);
    } catch {}
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchCompanies(), fetchUsers()]).finally(() => setLoading(false));
  }, [fetchCompanies, fetchUsers]);

  /* ─── Company CRUD ──────────────────────────────────────────── */

  function openCreate() {
    setEditingId(null);
    setFormName("");
    setFormEmail("");
    setFormNotes("");
    setShowForm(true);
  }

  function openEdit(c: Company) {
    setEditingId(c.id);
    setFormName(c.name);
    setFormEmail(c.email);
    setFormNotes(c.notes || "");
    setShowForm(true);
  }

  async function saveCompany() {
    if (!formName.trim() || !formEmail.trim()) return;
    const body = { id: editingId, name: formName, email: formEmail, notes: formNotes };
    const method = editingId ? "PATCH" : "POST";
    await fetch("/api/admin/companies", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setShowForm(false);
    fetchCompanies();
  }

  async function deleteCompanyRow(id: string) {
    if (!confirm(t("invoice.deleteConfirm" as TKey))) return;
    await fetch(`/api/admin/companies?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    // Unassign users from deleted company client-side
    setUsers((prev) => prev.map((u) => (u.companyId === id ? { ...u, companyId: null } : u)));
    fetchCompanies();
  }

  /* ─── User assignment ───────────────────────────────────────── */

  async function assignUser(userId: string, companyId: string | null) {
    // optimistic
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, companyId } : u)));
    await fetch(`/api/admin/users/${encodeURIComponent(userId)}/company`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId }),
    });
  }

  /* ─── Invoice preview + send ────────────────────────────────── */

  const fetchPreview = useCallback(async () => {
    if (!selectedCompanyId) {
      setInvoice(null);
      return;
    }
    setPreviewLoading(true);
    try {
      const res = await fetch(
        `/api/admin/invoices/preview?companyId=${encodeURIComponent(selectedCompanyId)}&year=${period.year}&month=${period.month}`
      );
      const data = await res.json();
      if (data.invoice) setInvoice(data.invoice);
      else setInvoice(null);
    } catch {
      setInvoice(null);
    } finally {
      setPreviewLoading(false);
    }
  }, [selectedCompanyId, period]);

  useEffect(() => {
    fetchPreview();
  }, [fetchPreview]);

  async function sendInvoice() {
    if (!invoice) return;
    if (!confirm(t("invoice.sendConfirm" as TKey, { email: invoice.company.email }))) return;
    setSending(true);
    setToast(null);
    try {
      const res = await fetch("/api/admin/invoices/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: invoice.company.id,
          year: period.year,
          month: period.month,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setToast({
          kind: "ok",
          msg: t("invoice.sentOk" as TKey, { email: data.sentTo }),
        });
      } else {
        setToast({
          kind: "err",
          msg: t("invoice.sentFail" as TKey, { error: data.error || "unknown" }),
        });
      }
    } catch (err) {
      setToast({
        kind: "err",
        msg: t("invoice.sentFail" as TKey, { error: err instanceof Error ? err.message : "unknown" }),
      });
    } finally {
      setSending(false);
    }
  }

  /* ─── Period helpers ────────────────────────────────────────── */

  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);
  const thisYear = new Date().getFullYear();
  const yearOptions = [thisYear - 1, thisYear, thisYear + 1];

  /* ─── Render ────────────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-5 h-5 animate-spin text-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Toast ── */}
      {toast && (
        <div
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] border ${
            toast.kind === "ok"
              ? "bg-green-50 border-green-200 text-green-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          {toast.kind === "ok" ? (
            <CheckCircle className="w-3.5 h-3.5" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5" />
          )}
          <span className="flex-1">{toast.msg}</span>
          <button onClick={() => setToast(null)} className="text-xs opacity-60 hover:opacity-100">
            ✕
          </button>
        </div>
      )}

      {/* ── Companies section ── */}
      <div className="p-4 rounded-2xl bg-card border border-border">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold flex items-center gap-2">
            <Building2 className="w-3.5 h-3.5 text-muted" />
            {t("invoice.companies" as TKey)}
          </h3>
          <button
            onClick={openCreate}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] bg-foreground text-background hover:opacity-90 transition-opacity"
          >
            <Plus className="w-3 h-3" />
            {t("invoice.newCompany" as TKey)}
          </button>
        </div>

        {showForm && (
          <div className="p-3 mb-3 rounded-xl bg-card-hover border border-border space-y-2">
            <input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder={t("invoice.companyName" as TKey)}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-xs outline-none focus:border-foreground/30"
            />
            <input
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value)}
              placeholder={t("invoice.billingEmail" as TKey)}
              type="email"
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-xs outline-none focus:border-foreground/30"
            />
            <textarea
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              placeholder={t("invoice.notes" as TKey)}
              rows={2}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-xs outline-none focus:border-foreground/30 resize-none"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setShowForm(false)}
                className="px-3 py-1.5 rounded-full text-[11px] text-muted hover:text-foreground"
              >
                {t("invoice.cancel" as TKey)}
              </button>
              <button
                onClick={saveCompany}
                className="px-3 py-1.5 rounded-full text-[11px] bg-foreground text-background hover:opacity-90"
              >
                {t("invoice.save" as TKey)}
              </button>
            </div>
          </div>
        )}

        {companies.length === 0 ? (
          <p className="text-xs text-muted text-center py-6">
            {t("invoice.noCompanies" as TKey)}
          </p>
        ) : (
          <div className="space-y-1.5">
            {companies.map((c) => {
              const userCount = users.filter((u) => u.companyId === c.id).length;
              return (
                <div
                  key={c.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-xl border border-border bg-background"
                >
                  <Building2 className="w-3.5 h-3.5 text-muted flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{c.name}</p>
                    <p className="text-[10px] text-muted truncate font-mono">{c.email}</p>
                  </div>
                  <span className="text-[10px] text-muted flex items-center gap-1 flex-shrink-0">
                    <Users className="w-3 h-3" />
                    {userCount}
                  </span>
                  <button
                    onClick={() => openEdit(c)}
                    className="p-1.5 rounded-full text-muted hover:text-foreground hover:bg-card-hover transition-colors"
                    title={t("invoice.edit" as TKey)}
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => deleteCompanyRow(c.id)}
                    className="p-1.5 rounded-full text-muted hover:text-red-500 hover:bg-red-50 transition-colors"
                    title={t("invoice.delete" as TKey)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── User assignments ── */}
      <div className="p-4 rounded-2xl bg-card border border-border">
        <h3 className="text-xs font-semibold mb-3 flex items-center gap-2">
          <Users className="w-3.5 h-3.5 text-muted" />
          {t("invoice.userAssignments" as TKey)}
        </h3>
        {users.length === 0 ? (
          <p className="text-xs text-muted text-center py-4">—</p>
        ) : (
          <div className="space-y-1.5">
            {users.map((u) => (
              <div
                key={u.id}
                className="flex items-center gap-3 px-3 py-2 rounded-xl border border-border bg-background"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{u.name}</p>
                  <p className="text-[10px] text-muted truncate font-mono">{u.email}</p>
                </div>
                <select
                  value={u.companyId || ""}
                  onChange={(e) => assignUser(u.id, e.target.value || null)}
                  className="text-[11px] bg-card border border-border rounded-full px-2 py-1 outline-none cursor-pointer"
                >
                  <option value="">{t("invoice.unassigned" as TKey)}</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Invoice preview & send ── */}
      <div className="p-4 rounded-2xl bg-card border border-border">
        <h3 className="text-xs font-semibold mb-3 flex items-center gap-2">
          <Mail className="w-3.5 h-3.5 text-muted" />
          {t("invoice.hub" as TKey)}
        </h3>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <select
            value={selectedCompanyId}
            onChange={(e) => setSelectedCompanyId(e.target.value)}
            className="text-[11px] bg-background border border-border rounded-full px-3 py-1.5 outline-none cursor-pointer"
          >
            <option value="">{t("invoice.selectCompany" as TKey)}</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={period.year}
            onChange={(e) => setPeriod((p) => ({ ...p, year: Number(e.target.value) }))}
            className="text-[11px] bg-background border border-border rounded-full px-3 py-1.5 outline-none cursor-pointer"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <select
            value={period.month}
            onChange={(e) => setPeriod((p) => ({ ...p, month: Number(e.target.value) }))}
            className="text-[11px] bg-background border border-border rounded-full px-3 py-1.5 outline-none cursor-pointer"
          >
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {new Date(2000, m - 1, 1).toLocaleDateString(lang === "zh" ? "zh-TW" : "en-US", { month: "long" })}
              </option>
            ))}
          </select>

          {selectedCompanyId && (
            <a
              href={`/api/admin/invoices/preview?companyId=${encodeURIComponent(selectedCompanyId)}&year=${period.year}&month=${period.month}&format=html`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] text-muted hover:text-foreground border border-border hover:border-foreground/20 transition-colors"
            >
              <Eye className="w-3 h-3" />
              {t("invoice.preview" as TKey)}
            </a>
          )}

          {invoice && (
            <button
              onClick={sendInvoice}
              disabled={sending}
              className="ml-auto flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] bg-foreground text-background hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {sending ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Send className="w-3 h-3" />
              )}
              {sending ? t("invoice.sending" as TKey) : t("invoice.sendInvoice" as TKey)}
            </button>
          )}
        </div>

        {previewLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-4 h-4 animate-spin text-muted" />
          </div>
        ) : invoice ? (
          <div className="rounded-xl border border-border bg-background overflow-hidden">
            <div className="px-4 py-3 bg-card-hover border-b border-border flex items-center justify-between">
              <div>
                <p className="text-xs font-medium">{invoice.company.name}</p>
                <p className="text-[10px] text-muted font-mono">{invoice.company.email}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-muted">{t("invoice.period" as TKey)}</p>
                <p className="text-xs font-medium">{invoice.periodLabel}</p>
              </div>
            </div>
            {invoice.lines.length === 0 ? (
              <p className="px-4 py-6 text-xs text-muted text-center">
                {t("invoice.noUsers" as TKey)}
              </p>
            ) : (
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-2 text-left font-medium text-muted">User</th>
                    <th className="px-4 py-2 text-right font-medium text-muted">Calls</th>
                    <th className="px-4 py-2 text-right font-medium text-muted">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.lines.map((l) => (
                    <tr key={l.userId} className="border-b border-border/50 last:border-0">
                      <td className="px-4 py-2">
                        <div>{l.userName}</div>
                        <div className="text-[10px] text-muted font-mono">{l.userEmail}</div>
                      </td>
                      <td className="px-4 py-2 text-right font-mono">{l.calls}</td>
                      <td className="px-4 py-2 text-right font-mono">{formatCost(l.costUsd)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-card-hover">
                    <td className="px-4 py-2 font-semibold">{t("invoice.total" as TKey)}</td>
                    <td className="px-4 py-2 text-right font-mono font-semibold">
                      {invoice.totalCalls}
                    </td>
                    <td className="px-4 py-2 text-right font-mono font-semibold">
                      {formatCost(invoice.totalCostUsd)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted text-center py-6">
            {t("invoice.selectCompany" as TKey)}
          </p>
        )}

        <p className="text-[10px] text-muted/60 mt-3">
          {t("invoice.resendNotConfigured" as TKey)}
        </p>
      </div>
    </div>
  );
}
