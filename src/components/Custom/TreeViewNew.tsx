import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Tooltip } from "../Tooltip";

/** عقدة الشجرة */
export type TreeNode = {
  id: string | number;
  label: string;
  icon?: React.ReactNode;
  /** مستوى الهرمية: 0 للجذر، 1 للمستوى الأول ... */
  level: number;
  isRoot?: boolean;
  children?: TreeNode[];
  expanded?: boolean;
  disabled?: boolean;
};

export type TreeActionVariant = "secondary" | "outline" | "ghost" | "destructive" | "primary" | "danger";

/** زر إجراء يظهر بجانب العقدة المحددة */
export type TreeNodeAction = {
  id: string;
  label: string;
  icon?: ReactNode;
  /** محتوى مخصص بالكامل بدلاً من الأيقونة والنص */
  content?: ReactNode;
  variant?: TreeActionVariant;
  hidden?: boolean | ((node: TreeNode) => boolean);
  disabled?: boolean | ((node: TreeNode) => boolean);
  onClick?: (node: TreeNode, action: TreeNodeAction) => void;
  className?: string;
};

export type TreeViewProps = {
  data: TreeNode[];
  /** عرض خطوط الربط المنقّطة بأسلوب Windows Forms */
  showLines?: boolean;
  /** مقدار الإزاحة لكل مستوى بالبكسل */
  indent?: number;
  defaultSelectedId?: string | number;
  onClick?: (node: TreeNode) => void;
  onDoubleClick?: (node: TreeNode) => void;
  onHover?: (node: TreeNode, type: "enter" | "leave") => void;
  onToggle?: (node: TreeNode, expanded: boolean) => void;
  /** قائمة ثابتة أو دالة تعيد أزراراً مختلفة لكل عقدة */
  actions?: TreeNodeAction[] | ((node: TreeNode) => TreeNodeAction[]);
  /** إظهار أو إخفاء جميع الأزرار، ويمكن تحديده حسب العقدة */
  showActions?: boolean | ((node: TreeNode) => boolean);
  onActionClick?: (node: TreeNode, action: TreeNodeAction) => void;
  className?: string;
};

/* ألوان ثيم التطبيق */
const onAccent = "var(--paper)";
const softFill = "color-mix(in srgb, var(--green) 10%, var(--paper))";
const lineColor = "color-mix(in srgb, var(--green) 40%, var(--line))";

/** يجمع المعرّفات المفتوحة ابتداءً من الحقل expanded */
function collectExpanded(nodes: TreeNode[], acc: Set<string | number>) {
  for (const n of nodes) {
    if (n.expanded) acc.add(n.id);
    if (n.children?.length) collectExpanded(n.children, acc);
  }
  return acc;
}

function collectAllIds(nodes: TreeNode[], acc: Set<string | number>) {
  for (const n of nodes) {
    if (n.children?.length) {
      acc.add(n.id);
      collectAllIds(n.children, acc);
    }
  }
  return acc;
}

const FolderIcon = ({ open }: { open: boolean }) => (
  <svg viewBox="0 0 20 20" className="size-4 shrink-0" fill="currentColor" aria-hidden>
    {open ? (
      <path d="M2 5.5A1.5 1.5 0 0 1 3.5 4h3.4l1.5 1.6h6.1A1.5 1.5 0 0 1 16 7.1v.4H6.6a1.5 1.5 0 0 0-1.44 1.08L3.6 14H3.5A1.5 1.5 0 0 1 2 12.5v-7Zm3.1 4.6a.9.9 0 0 1 .86-.6H17a.7.7 0 0 1 .67.9l-1.2 4.1a1.2 1.2 0 0 1-1.15.86H4.4l1.7-5.26Z" />
    ) : (
      <path d="M2 5.5A1.5 1.5 0 0 1 3.5 4h3.4l1.5 1.6h6.1A1.5 1.5 0 0 1 16 7.1v5.4a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 2 12.5v-7Z" />
    )}
  </svg>
);

const LeafIcon = () => (
  <svg viewBox="0 0 20 20" className="size-4 shrink-0" fill="currentColor" aria-hidden>
    <path d="M5 2.5h6l4 4v11a.5.5 0 0 1-.5.5h-9.5A.5.5 0 0 1 4.5 17.5V3a.5.5 0 0 1 .5-.5Zm6 1.2V6.5h2.8L11 3.7Z" />
  </svg>
);

type RowProps = {
  node: TreeNode;
  /** لكل سلف: هل لديه أشقاء لاحقون (نحتاج خطاً عمودياً مستمراً) */
  ancestors: boolean[];
  isLast: boolean;
  showLines: boolean;
  indent: number;
  expandedIds: Set<string | number>;
  selectedId: string | number | null;
  hoveredId: string | number | null;
  toggle: (node: TreeNode) => void;
  select: (node: TreeNode) => void;
  onDoubleClick?: ((node: TreeNode) => void) | undefined;
  onHover?: ((node: TreeNode, type: "enter" | "leave") => void) | undefined;
  actions?: TreeViewProps["actions"];
  showActions: NonNullable<TreeViewProps["showActions"]>;
  onActionClick?: TreeViewProps["onActionClick"];
  setHoveredId: (id: string | number | null) => void;
};

function resolveFlag(value: boolean | ((node: TreeNode) => boolean) | undefined, node: TreeNode) {
  return typeof value === "function" ? value(node) : !!value;
}

function TreeRow({
  node,
  ancestors,
  isLast,
  showLines,
  indent,
  expandedIds,
  selectedId,
  hoveredId,
  toggle,
  select,
  onDoubleClick,
  onHover,
  actions,
  showActions,
  onActionClick,
  setHoveredId,
}: RowProps) {
  const hasChildren = !!node.children?.length;
  const isOpen = hasChildren && expandedIds.has(node.id);
  const isSelected = selectedId === node.id;
  const isHovered = hoveredId === node.id;
  const disabled = !!node.disabled;
  const nodeActions = typeof actions === "function" ? actions(node) : (actions ?? []);
  const visibleActions = nodeActions.filter((action) => !resolveFlag(action.hidden, node));
  const actionsVisible =
    isSelected &&
    (typeof showActions === "function" ? showActions(node) : showActions) &&
    visibleActions.length > 0;

  const style = { width: indent } as const;

  return (
    <li role="none" className="relative">
      <div
        role="treeitem"
        aria-expanded={hasChildren ? isOpen : undefined}
        aria-selected={isSelected}
        aria-disabled={disabled || undefined}
        tabIndex={0}
        onClick={() => select(node)}
        onDoubleClick={() => {
          onDoubleClick?.(node);
          if (hasChildren) toggle(node);
        }}
        onMouseEnter={() => {
          setHoveredId(node.id);
          onHover?.(node, "enter");
        }}
        onMouseLeave={() => {
          setHoveredId(null);
          onHover?.(node, "leave");
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            select(node);
          } else if (e.key === "ArrowLeft" && hasChildren && !isOpen) toggle(node);
          else if (e.key === "ArrowRight" && hasChildren && isOpen) toggle(node);
        }}
        className="flex cursor-pointer select-none items-center outline-none"
        style={{ opacity: disabled ? 0.5 : 1 }}
      >
        {/* أعمدة إرشادية للأسلاف */}
        {ancestors.map((hasMore, i) => (
          <span key={i} className="relative shrink-0 self-stretch" style={style}>
            {showLines && hasMore && (
              <span
                className="absolute inset-y-0 right-1/2 border-r border-dotted"
                style={{ borderColor: lineColor }}
              />
            )}
          </span>
        ))}

        {/* عمود الوصلة + زر الطي */}
        <span className="relative shrink-0 self-stretch" style={style}>
          {showLines && (
            <>
              <span
                className={`absolute right-1/2 border-r border-dotted ${isLast ? "top-0 h-1/2" : "inset-y-0"}`}
                style={{ borderColor: lineColor }}
              />
              <span
                className="absolute left-0 top-1/2 right-1/2 border-t border-dotted"
                style={{ borderColor: lineColor }}
              />
            </>
          )}

          {hasChildren && (
            <Tooltip content={isOpen ? "طي" : "توسيع"}>
            <button
              type="button"
              tabIndex={-1}
              aria-label={isOpen ? "طي" : "توسيع"}
              onClick={(e) => {
                e.stopPropagation();
                toggle(node);
              }}
              className="absolute right-1/2 top-1/2 grid size-[13px] -translate-y-1/2 translate-x-1/2 place-items-center rounded-xs border transition-colors"
              style={{ borderColor: "var(--green)", background: "var(--paper)", color: "var(--green)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = softFill)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--paper)")}
            >
              <span className="relative block size-[7px]">
                <span className="absolute top-1/2 right-0 left-0 h-px -translate-y-1/2 bg-current" />
                {!isOpen && (
                  <span className="absolute top-0 bottom-0 right-1/2 w-px translate-x-1/2 bg-current" />
                )}
              </span>
            </button>
            </Tooltip>
          )}
        </span>

        {/* التسمية — التحديد يلتف حول المحتوى فقط */}
        <span
          className={`my-[1px] flex min-w-0 items-center gap-1.5 rounded-xs px-1.5 py-1 text-sm transition-colors ${
            node.isRoot || node.level === 0 ? "font-semibold" : ""
          }`}
          style={{
            background: isSelected ? "var(--green)" : isHovered ? softFill : "transparent",
            color: isSelected ? onAccent : isHovered ? "var(--ink)" : "var(--ink)",
          }}
        >
          <span style={{ color: isSelected ? onAccent : "var(--green)" }}>
            {node.icon ?? (hasChildren ? <FolderIcon open={isOpen} /> : <LeafIcon />)}
          </span>
          <span className="truncate">{node.label}</span>
        </span>

        {actionsVisible && (
          <span
            role="toolbar"
            aria-label={`إجراءات ${node.label}`}
            className="ms-auto flex shrink-0 items-center gap-1 ps-2"
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {visibleActions.map((action) => {
              const actionDisabled = resolveFlag(action.disabled, node);
              const iconOnly = !!action.icon && !action.content;
              const isDanger = action.variant === "danger" || action.variant === "destructive";
              return (
                <Tooltip key={action.id} content={action.label} tone={isDanger ? "danger" : undefined}>
                  <button
                    type="button"
                    tabIndex={0}
                    disabled={actionDisabled}
                    aria-label={action.label}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (actionDisabled) return;
                      action.onClick?.(node, action);
                      onActionClick?.(node, action);
                    }}
                    onKeyDown={(event) => event.stopPropagation()}
                    className={`inline-flex items-center justify-center gap-1 rounded-md text-xs font-medium transition-colors ${
                      iconOnly ? "size-7 p-0" : "h-7 min-w-7 px-2"
                    } ${action.className ?? ""}`}
                  style={{
                    color: "var(--muted)",
                    opacity: actionDisabled ? 0.5 : 1,
                    cursor: actionDisabled ? "not-allowed" : "pointer",
                  }}
                  onMouseEnter={(e) => {
                    if (actionDisabled) return;
                    e.currentTarget.style.background = isDanger
                      ? "color-mix(in srgb, #c8443c 12%, var(--paper))"
                      : softFill;
                    e.currentTarget.style.color = isDanger ? "#c8443c" : "var(--green)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "var(--muted)";
                  }}
                >
                  {action.content ?? (
                    <>
                      {action.icon}
                      {!action.icon && <span>{action.label}</span>}
                    </>
                  )}
                  </button>
                </Tooltip>
              );
            })}
          </span>
        )}
      </div>

      {hasChildren && isOpen && (
        <ul role="group" className="m-0 list-none p-0">
          {node.children?.map((child, i, siblings) => (
            <TreeRow
              key={child.id}
              node={child}
              ancestors={[...ancestors, !isLast]}
              isLast={i === siblings.length - 1}
              showLines={showLines}
              indent={indent}
              expandedIds={expandedIds}
              selectedId={selectedId}
              hoveredId={hoveredId}
              toggle={toggle}
              select={select}
              onDoubleClick={onDoubleClick}
              onHover={onHover}
              actions={actions}
              showActions={showActions}
              onActionClick={onActionClick}
              setHoveredId={setHoveredId}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function TreeViewNew({
  data,
  showLines = true,
  indent = 22,
  defaultSelectedId = null as unknown as string | number,
  onClick,
  onDoubleClick,
  onHover,
  onToggle,
  actions,
  showActions = true,
  onActionClick,
  className = "",
}: TreeViewProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string | number>>(() =>
    collectExpanded(data, new Set()),
  );
  const [selectedId, setSelectedId] = useState<string | number | null>(defaultSelectedId ?? null);
  const [hoveredId, setHoveredId] = useState<string | number | null>(null);

  const allParentIds = useMemo(() => collectAllIds(data, new Set()), [data]);

  const toggle = useCallback(
    (node: TreeNode) => {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        const willOpen = !next.has(node.id);
        willOpen ? next.add(node.id) : next.delete(node.id);
        onToggle?.(node, willOpen);
        return next;
      });
    },
    [onToggle],
  );

  const select = useCallback(
    (node: TreeNode) => {
      setSelectedId(node.id);
      onClick?.(node);
    },
    [onClick],
  );

  const bulkBtn: React.CSSProperties = {
    borderRadius: 6,
    border: "1px solid var(--line)",
    background: "var(--paper)",
    color: "var(--ink)",
    padding: "4px 10px",
    fontSize: "0.75rem",
    fontWeight: 500,
  };

  return (
    <div dir="rtl" className={["w-full text-right", className].join(" ")}>
      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setExpandedIds(new Set(allParentIds))}
          className="transition-colors"
          style={bulkBtn}
          onMouseEnter={(e) => (e.currentTarget.style.background = softFill)}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--paper)")}
        >
          توسيع الكل
        </button>
        <button
          type="button"
          onClick={() => setExpandedIds(new Set())}
          className="transition-colors"
          style={bulkBtn}
          onMouseEnter={(e) => (e.currentTarget.style.background = softFill)}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--paper)")}
        >
          طي الكل
        </button>
      </div>

      <ul role="tree" className="m-0 list-none p-0">
        {data.map((node, i) => (
          <TreeRow
            key={node.id}
            node={node}
            ancestors={[]}
            isLast={i === data.length - 1}
            showLines={showLines}
            indent={indent}
            expandedIds={expandedIds}
            selectedId={selectedId}
            hoveredId={hoveredId}
            toggle={toggle}
            select={select}
            onDoubleClick={onDoubleClick}
            onHover={onHover}
            actions={actions}
            showActions={showActions}
            onActionClick={onActionClick}
            setHoveredId={setHoveredId}
          />
        ))}
      </ul>
    </div>
  );
}