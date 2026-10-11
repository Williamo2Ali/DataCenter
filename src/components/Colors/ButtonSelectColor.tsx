import React from 'react';

import { Tooltip } from '../Tooltip';

interface ButtonSelectColorProps {
  /** النص التوضيحي الذي يظهر بجانب مربع اللون */
  label: string;
  /** كود اللون الحالي (مثلاً #b1a2d9 أو اسم لون CSS) */
  color: string;
  /** دالة التنفيذ عند النقر على الزر */
  onClick?: () => void;
  /** هل الزر في حالة تحديد حالياً؟ */
  isSelected?: boolean;
  /** تعطيل الزر */
  disabled?: boolean;
  /** إظهار النص التوضيحي بجانب مربع اللون (افتراضي true) */
  showLabel?: boolean;
  /** عرض الحاوية الخارجية بالبكسل أو النسبة — افتراضي 50 */
  boxWidth?: number | string;
  /** ارتفاع الحاوية الخارجية بالبكسل — افتراضي 35 */
  boxHeight?: number;
  /** عرض مستطيل اللون الداخلي — افتراضي 38 */
  colorWidth?: number | string;
  /** ارتفاع مستطيل اللون الداخلي — افتراضي 22 */
  colorHeight?: number;
  /** الحشوة داخل الحاوية بالبكسل — افتراضي 5 */
  boxPadding?: number;
  /** ملء عرض الحاوية الأب (افتراضي false) */
  fullWidth?: boolean;
}

export const ButtonSelectColor: React.FC<ButtonSelectColorProps> = ({
  label,
  color,
  onClick,
  isSelected = false,
  disabled = false,
  showLabel = true,
  boxWidth = 50,
  boxHeight = 35,
  colorWidth = 38,
  colorHeight = 22,
  boxPadding = 5,
  fullWidth = false,
}) => {
  return (
    <div
      className={`items-center ${showLabel ? 'gap-3' : ''} ${fullWidth ? 'flex w-full' : 'inline-flex'}`}
    >
      {/* زر اختيار اللون (مربّع اللون فقط) */}
      <Tooltip content={label}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-pressed={isSelected}
        className={`group ${fullWidth ? 'w-full' : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        {/* الحاوية الخارجية */}
        <div
          className="flex items-center justify-center rounded-lg border"
          style={{
            width: boxWidth,
            height: boxHeight,
            padding: boxPadding,
            background: 'var(--paper)',
            borderColor: isSelected ? 'var(--green)' : 'var(--line)',
            boxShadow: isSelected ? '0 0 0 2px color-mix(in srgb, var(--green) 30%, transparent)' : 'none',
            transition: 'border-color 140ms ease, box-shadow 140ms ease',
          }}
          onMouseEnter={(e) => {
            if (!disabled && !isSelected) e.currentTarget.style.borderColor = 'var(--green)';
          }}
          onMouseLeave={(e) => {
            if (!isSelected) e.currentTarget.style.borderColor = 'var(--line)';
          }}
        >
          {/* مستطيل اللون الداخلي */}
          <div
            className="ccolor rounded-xs border"
            style={{
              width: colorWidth,
              height: colorHeight,
              backgroundColor: color,
              borderColor: 'color-mix(in srgb, var(--ink) 15%, transparent)',
            }}
          />
        </div>
      </button>
      </Tooltip>

      {/* النص التوضيحي بجانب المكوّن */}
      {showLabel && (
        <span className="text-sm font-medium text-right" style={{ color: 'var(--ink)' }}>
          {label}
        </span>
      )}
    </div>
  );
};

export default ButtonSelectColor;