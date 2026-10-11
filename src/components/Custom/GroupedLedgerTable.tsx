import { Fragment, useMemo, useState } from "react";
import { ChevronDown, Eye, FileText, X } from "lucide-react";
import { Tooltip } from "../Tooltip";

// جدول دفتر الحسابات — نسخة قائمة بذاتها: تستقبل الصفوف جاهزة من أي مصدر
// (دفتر اليومية، قيود يدوية، تصدير CSV…) وترسمها مجمّعة حسب السند.
// أصناف الجدول مبنية على متغيّرات ثيم التطبيق، بلا أي اعتماد خارجي.

export type RowContent = {
  id: string;
  type: "rowcontent";
  groupId: string;
  voucherNumber: string;
  date: string;
  description: string;
  account: string;
  debit?: number;
  credit?: number;
};

export type RowFinal = {
  id: string;
  type: "rowfinal";
  groupId: string;
  voucherNumber: string;
  label: string;
  debit: number;
  credit: number;
};

export type RowSeparator = {
  id: string;
  type: "rowseparator";
  groupId: string;
  voucherNumber: string;
  label: string;
  /** البيان العام للسند (نص كامل — يُقصّ عند العرض على 50 محرف مع زر معاينة) */
  description?: string;
  meta?: string;
};

export type LedgerRow = RowContent | RowFinal | RowSeparator;

type GroupedLedgerTableProps = {
  rows: LedgerRow[];
  /** رمز العملة المستخدم في تنسيق المبالغ (افتراضي: SAR) */
  currency?: string;
  onVoucherClick?: (voucherNumber: string, row: LedgerRow) => void;
  initiallyCollapsed?: string[];
};

const onAccent = "var(--paper)";
const softFill = "color-mix(in srgb, var(--green) 8%, var(--paper))";
const headFill = "color-mix(in srgb, var(--muted) 7%, var(--paper))";
const lineSoft = "color-mix(in srgb, var(--line) 55%, transparent)";

/** تنسيق المبلغ: رقمان عشريان + رمز العملة */
function formatCurrency(value: number, currency: string): string {
  const n = Number.isFinite(value) ? value : 0;
  return `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

const formatAmount = (value: number | undefined, currency: string) =>
  value == null ? "—" : formatCurrency(Math.abs(value), currency);

/** حدّ عرض البيان في صف الفاصل قبل القصّ */
const DESCRIPTION_PREVIEW_LIMIT = 50;

/** يقصّ البيان الطويل إلى 50 محرف متبوعة بـ "..."، ويُبلّغ إن جرى القصّ (لإظهار زر المعاينة) */
function truncateDescription(text: string): { text: string; truncated: boolean } {
  if (text.length <= DESCRIPTION_PREVIEW_LIMIT) return { text, truncated: false };
  return { text: `${text.slice(0, DESCRIPTION_PREVIEW_LIMIT)}...`, truncated: true };
}

export function GroupedLedgerTable({
  rows,
  currency = "SAR",
  onVoucherClick,
  initiallyCollapsed = [],
}: GroupedLedgerTableProps) {
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set(initiallyCollapsed));
  // نص البيان المعروض في نافذة المعاينة (null = النافذة مغلقة)
  const [previewText, setPreviewText] = useState<string | null>(null);

  const rowCounts = useMemo(() => {
    const counts = new Map<string, number>();
    rows.forEach((row) => {
      if (row.type === "rowcontent") {
        counts.set(row.groupId, (counts.get(row.groupId) ?? 0) + 1);
      }
    });
    return counts;
  }, [rows]);

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const headCell: React.CSSProperties = {
    borderInlineStart: "1px solid var(--line)",
    textAlign: "center",
    fontWeight: 700,
    color: "var(--muted)",
  };
  const bodyCell: React.CSSProperties = {
    borderInlineStart: "1px solid var(--line)",
    textAlign: "center",
    padding: "8px 16px",
  };
  /** خلايا المبالغ لا تلتفّ حتى لا ينكسر الرقم عند إضافة رمز العملة */
  const amountCell: React.CSSProperties = { ...bodyCell, whiteSpace: "nowrap" };

  return (
    <div
      className="overflow-hidden rounded-lg"
      style={{ background: "var(--paper)", border: "1px solid var(--line)" }}
    >
      <div className="relative w-full overflow-auto">
        <table className="w-full min-w-[900px] text-right text-sm">
          <thead style={{ background: headFill }}>
            <tr style={{ borderBottom: "1px solid var(--line)" }}>
              <th style={{ ...headCell, height: 48, width: "11%" }}>التاريخ</th>
              <th style={{ ...headCell, width: "34%" }}>البيان</th>
              <th style={{ ...headCell, width: "28%" }}>الحساب</th>
              <th style={{ ...headCell, width: "14%" }}>مدين</th>
              <th style={{ ...headCell, width: "14%", borderInlineStart: "none" }}>دائن</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => {
              const collapsed = collapsedGroups.has(row.groupId);

              if (row.type === "rowseparator") {
                const count = rowCounts.get(row.groupId) ?? 0;
                const countLabel =
                  count === 0
                    ? "لا أسطر"
                    : count === 1
                      ? "سطر واحد"
                      : count === 2
                        ? "سطران"
                        : count <= 10
                          ? `${count} أسطر`
                          : `${count} سطر`;
                const description = row.description ?? "";
                const { text: descriptionText, truncated } = truncateDescription(description);
                return (
                  <tr
                    key={row.id}
                    style={{
                      borderBlock: "1px solid " + lineSoft,
                      background: softFill,
                      color: "var(--ink)",
                    }}
                  >
                    <td colSpan={5} style={{ padding: 0 }}>
                      <div className="flex items-stretch">
                        <div
                          role="button"
                          tabIndex={0}
                          className="flex h-11 flex-1 cursor-pointer items-center justify-start gap-2 px-4 text-sm font-medium"
                          onClick={() => toggleGroup(row.groupId)}
                          onKeyDown={(event) => {
                            if (event.target !== event.currentTarget) return;
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              toggleGroup(row.groupId);
                            }
                          }}
                          aria-expanded={!collapsed}
                          aria-controls={`ledger-group-${row.groupId}`}
                        >
                          <ChevronDown
                            aria-hidden="true"
                            className={`shrink-0 transition-transform duration-200 ${
                              !collapsed ? "rotate-180" : ""
                            }`}
                            style={{ color: "var(--muted)" }}
                          />
                          <span className="shrink-0 font-bold">{row.label}</span>
                          {description && (
                            <span className="min-w-0 truncate font-bold">{` — ${descriptionText}`}</span>
                          )}
                          {truncated && (
                            <Tooltip content="معاينة البيان">
                              <button
                                type="button"
                                className="inline-flex shrink-0 items-center justify-center rounded-md p-1 transition-colors"
                                style={{ color: "var(--muted)" }}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setPreviewText(description);
                                }}
                                aria-label="معاينة البيان الكامل"
                                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--green)")}
                                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--muted)")}
                              >
                                <Eye className="size-4" aria-hidden="true" />
                              </button>
                            </Tooltip>
                          )}
                          {row.meta && (
                            <span className="shrink-0 text-xs" style={{ color: "var(--muted)" }}>
                              {row.meta}
                            </span>
                          )}
                          <span
                            className="mr-auto rounded-md border px-2 py-0.5 text-xs"
                            style={{
                              borderColor: "var(--line)",
                              background: "var(--paper)",
                              color: "var(--muted)",
                            }}
                          >
                            {countLabel}
                          </span>
                        </div>
                        {/* زر رقم السند */}
                        {onVoucherClick && (
                          <button
                            type="button"
                            className="inline-flex h-11 items-center justify-center gap-2 px-4 text-sm font-medium tabular-nums underline-offset-4 transition-colors"
                            style={{ color: "var(--green)" }}
                            onClick={() => onVoucherClick(row.voucherNumber, row)}
                            aria-label={`فتح السند رقم ${row.voucherNumber}`}
                            onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                            onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
                          >
                            <FileText aria-hidden="true" />
                            <span dir="ltr">{row.voucherNumber}</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              }

              if (row.type === "rowcontent") {
                if (collapsed) return null;
                return (
                  <tr key={row.id} id={`ledger-group-${row.groupId}`} style={{ borderBottom: "1px solid var(--line)" }}>
                    <td className="tabular-nums whitespace-nowrap" style={{ ...bodyCell, color: "var(--muted)" }}>
                      {row.date}
                    </td>
                    <td style={{ ...bodyCell, fontWeight: 500, color: "var(--ink)" }}>{row.description}</td>
                    <td style={{ ...bodyCell, color: "var(--muted)" }}>{row.account}</td>
                    <td className="tabular-nums" style={{ ...amountCell, fontWeight: 500, color: "var(--ink)" }}>
                      {formatAmount(row.debit, currency)}
                    </td>
                    <td className="tabular-nums" style={{ ...amountCell, borderInlineStart: "none", fontWeight: 500 }}>
                      {formatAmount(row.credit, currency)}
                    </td>
                  </tr>
                );
              }

              if (collapsed) return null;

              return (
                <Fragment key={row.id}>
                  <tr style={{ borderBlock: `1px solid ${lineSoft}`, background: headFill }}>
                    <td style={{ padding: "8px 16px" }} />
                    <td colSpan={2} style={{ ...bodyCell, fontWeight: 800, color: "var(--ink)" }}>
                      {row.label}
                    </td>
                    <td
                      className="tabular-nums"
                      style={{ ...amountCell, textAlign: "left", fontWeight: 800, color: "var(--ink)" }}
                    >
                      {formatAmount(row.debit, currency)}
                    </td>
                    <td
                      className="tabular-nums"
                      style={{ ...amountCell, borderInlineStart: "none", textAlign: "left", fontWeight: 800 }}
                    >
                      {formatAmount(row.credit, currency)}
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* معاينة البيان الكامل — للقراءة فقط، تُفتح من أيقونة العين في صف الفاصل */}
      {previewText !== null && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
          style={{ background: "rgba(20,30,28,.4)" }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPreviewText(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-lg overflow-hidden rounded-lg"
            style={{
              background: "var(--paper)",
              border: "1px solid var(--line)",
              color: "var(--ink)",
              boxShadow: "0 20px 48px rgba(20,32,28,.24)",
            }}
          >
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: "1px solid var(--line)" }}
            >
              <h2 className="text-base font-bold">معاينة البيان</h2>
              <Tooltip content="إغلاق">
              <button
                type="button"
                onClick={() => setPreviewText(null)}
                aria-label="إغلاق"
                className="grid h-7 w-7 place-items-center rounded-md transition-colors"
                style={{ color: "var(--muted)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = softFill)}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <X className="h-4 w-4" />
              </button>
              </Tooltip>
            </div>
            <p className="px-4 py-4 text-sm leading-relaxed" style={{ color: "var(--ink)" }}>
              {previewText}
            </p>
            <div className="flex justify-end px-4 py-3" style={{ borderTop: "1px solid var(--line)" }}>
              <button
                type="button"
                onClick={() => setPreviewText(null)}
                className="min-h-9 rounded-md px-4 text-sm font-bold"
                style={{ background: "var(--green)", color: onAccent }}
              >
                تم
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GroupedLedgerTable;