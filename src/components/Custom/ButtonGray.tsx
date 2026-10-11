import type { ButtonHTMLAttributes } from 'react';
import styles from './ButtonGray.module.css';

/** دمج أصناف CSS بلا اعتماديات خارجية. */
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/**
 * زر بأنماط CSS Module معزولة، مبنية على متغيرات ثيم التطبيق
 * (--paper/--line/--ink/--green/--orange) فيتبع الوضع الفاتح والداكن.
 * الأنواع: normal (عادي) / confirm (موافق) / close (إغلاق) / save (حفظ) / discard (تجاهل).
 */
export default function ButtonGray({
  className,
  variant = 'normal',
  size = 'default',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'normal' | 'confirm' | 'close' | 'save' | 'discard';
  size?: 'default' | 'icon';
}) {
  const s = styles as Record<string, string>;
  return (
    <button
      className={cx(s.base, variant !== 'normal' && s[variant], size === 'icon' && s.icon, className)}
      {...props}
    />
  );
}