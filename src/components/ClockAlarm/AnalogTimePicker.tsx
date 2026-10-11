import React, { useState, useRef, useEffect } from 'react';

export type TimeDisplayMode = 'am-pm' | 'local-periods';

export type LocalPeriod = 'morning' | 'midday' | 'afternoon' | 'evening';

export const LOCAL_PERIOD_ORDER: LocalPeriod[] = [
  'morning',
  'midday',
  'afternoon',
  'evening',
];

export function getLocalPeriod(
  hours: number,
  period: 'AM' | 'PM'
): LocalPeriod {
  if (period === 'AM') return 'morning';
  if (hours >= 12 && hours <= 2) return 'midday';
  if (hours >= 3 && hours <= 5) return 'afternoon';
  return 'evening';
}

export const LOCAL_PERIOD_LABELS: Record<LocalPeriod, string> = {
  morning: 'صباحاً',
  midday: 'ظهراً',
  afternoon: 'عصراً',
  evening: 'مساءً',
};

interface AnalogTimePickerProps {
  onTimeSelect: (time: { hours: number; minutes: number; period: 'AM' | 'PM' }) => void;
  timeDisplayMode?: TimeDisplayMode;
  autoDetectPeriod?: boolean;
}

export default function AnalogTimePicker({
  onTimeSelect,
  timeDisplayMode = 'am-pm',
  autoDetectPeriod = true,
}: AnalogTimePickerProps) {
  const [mode, setMode] = useState<'hours' | 'minutes'>('hours');
  const [hours, setHours] = useState<number>(12);
  const [minutes, setMinutes] = useState<number>(0);
  const [period, setPeriod] = useState<'AM' | 'PM'>('AM');
  const [localPeriod, setLocalPeriod] = useState<LocalPeriod>(() =>
    getLocalPeriod(12, 'AM')
  );
  const clockRef = useRef<HTMLDivElement>(null);
  const rotationRef = useRef<number>(0);

  // حساب زاوية دوران العقرب بناءً على الوضع الحالي
  const getRotationAngle = () => {
    let targetAngle: number;
    if (mode === 'hours') {
      targetAngle = (hours % 12) * 30;
    } else {
      targetAngle = (minutes / 5) * 30;
    }

    const current = rotationRef.current % 360;
    const diff = targetAngle - current;

    if (Math.abs(diff) < 180) {
      rotationRef.current = current + diff;
    } else if (diff > 0) {
      rotationRef.current = current - (360 - diff);
    } else {
      rotationRef.current = current + (360 + diff);
    }

    return rotationRef.current;
  };

  // حساب القيمة المختارة من إحداثيات النقر
  const getSelectedValue = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!clockRef.current) return null;
    const rect = clockRef.current.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const x = e.clientX - rect.left - centerX;
    const y = e.clientY - rect.top - centerY;

    let radians = Math.atan2(y, x);
    let degrees = radians * (180 / Math.PI) + 90;
    if (degrees < 0) degrees += 360;

    if (mode === 'hours') {
      let selectedH = Math.round(degrees / 30);
      if (selectedH === 0) selectedH = 12;
      return selectedH;
    } else {
      // حساب الدقائق بناءً على القرب من الـ 12 موضع (مضروبة في 5)
      let selectedIndex = Math.round(degrees / 30);
      if (selectedIndex === 12 || selectedIndex === 0) selectedIndex = 0;
      let selectedM = selectedIndex * 5;
      if (selectedM === 60) selectedM = 0;
      return selectedM;
    }
  };

  // النقرة الواحدة: تحديد الساعة، وعند إعادة النقر على نفس الساعة يتم الانتقال إلى الدقائق
  const handleClockClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const value = getSelectedValue(e);
    if (value === null) return;

    if (mode === 'hours') {
      if (value === hours) {
        onTimeSelect({ hours: value, minutes, period });
        setMode('minutes');
      } else {
        setHours(value);
        if (autoDetectPeriod) {
          setLocalPeriod(getLocalPeriod(value, period));
        }
      }
    } else {
      setMinutes(value);
      onTimeSelect({ hours, minutes: value, period });
    }
  };

  const handleLocalPeriodSelect = (p: LocalPeriod) => {
    setLocalPeriod(p);
    const ampm: 'AM' | 'PM' = p === 'morning' ? 'AM' : 'PM';
    setPeriod(ampm);
    onTimeSelect({ hours, minutes, period: ampm });
  };

  useEffect(() => {
    if (mode === 'hours') {
      rotationRef.current = (hours % 12) * 30;
    } else {
      rotationRef.current = (minutes / 5) * 30;
    }
  }, [mode]);

  const accent = 'var(--green)';
  const onAccent = 'var(--paper)';
  const dialFace = 'color-mix(in srgb, var(--green) 6%, var(--paper))';

  return (
    <div
      className="flex flex-col items-center mx-auto select-none"
    >
      {/* شاشة العرض العلوية */}
      <div dir="ltr" className="flex items-center justify-between w-full mb-6 px-4">
        <div dir="ltr" className="flex items-center gap-1 text-5xl font-bold" style={{ color: accent }}>
          {/* عرض الساعات أولاً */}
          <span
            role="button"
            tabIndex={0}
            onClick={() => setMode('hours')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setMode('hours'); } }}
            className="cursor-pointer px-1 pb-1 transition-colors"
            style={mode === 'hours'
              ? { color: accent, borderBottom: `4px solid ${accent}` }
              : { color: 'var(--muted)' }}
          >
            {String(hours).padStart(2, '0')}
          </span>
          <span>:</span>
          {/* عرض الدقائق ثانياً */}
          <span
            role="button"
            tabIndex={0}
            onClick={() => setMode('minutes')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setMode('minutes'); } }}
            className="cursor-pointer px-1 pb-1 transition-colors"
            style={mode === 'minutes'
              ? { color: accent, borderBottom: `4px solid ${accent}` }
              : { color: 'var(--muted)' }}
          >
            {String(minutes).padStart(2, '0')}
          </span>
          <span>:</span>
          {/* الثواني دائماً 00 */}
          <span className="pb-1 text-3xl" style={{ color: 'var(--muted)' }}>00</span>
        </div>

        {/* زر التبديل صباحاً / مساءً أو الفترات المحلية */}
        {timeDisplayMode === 'local-periods' ? (
          <div className="flex flex-col overflow-hidden rounded-lg border text-xs font-semibold"
            style={{ borderColor: 'var(--line)' }}>
            {LOCAL_PERIOD_ORDER.map((key) => {
              const active = localPeriod === key;
              return (
                <button
                  key={key}
                  onClick={() => handleLocalPeriodSelect(key)}
                  className="px-2 py-1"
                  style={active
                    ? { background: accent, color: onAccent }
                    : { background: 'color-mix(in srgb, var(--muted) 12%, var(--paper))', color: 'var(--muted)' }}
                >
                  {LOCAL_PERIOD_LABELS[key]}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col overflow-hidden rounded-lg border text-xs font-semibold"
            style={{ borderColor: 'var(--line)' }}>
            <button
              onClick={() => { setPeriod('AM'); onTimeSelect({ hours, minutes, period: 'AM' }); }}
              className="px-2 py-1"
              style={period === 'AM'
                ? { background: accent, color: onAccent }
                : { background: 'color-mix(in srgb, var(--muted) 12%, var(--paper))', color: 'var(--muted)' }}
            >
              صباحا
            </button>
            <button
              onClick={() => { setPeriod('PM'); onTimeSelect({ hours, minutes, period: 'PM' }); }}
              className="px-2 py-1"
              style={period === 'PM'
                ? { background: accent, color: onAccent }
                : { background: 'color-mix(in srgb, var(--muted) 12%, var(--paper))', color: 'var(--muted)' }}
            >
              مساءا
            </button>
          </div>
        )}
      </div>

      <p className="mb-1 text-sm font-semibold" style={{ color: accent }}>
        {mode === 'hours' ? 'اختر الساعة' : 'اختر الدقائق'}
      </p>
      <p className="mb-4 text-xs" style={{ color: 'var(--muted)' }}>
        {mode === 'hours' ? 'انقر لاختيار الساعة' : 'انقر لاختيار الدقائق'}
      </p>

      {/* لوحة الساعة التناظرية */}
      <div
        ref={clockRef}
        onClick={handleClockClick}
        className="relative flex h-64 w-64 cursor-pointer items-center justify-center rounded-full"
        style={{ background: dialFace, border: `4px solid ${'var(--line)'}` }}
      >
        {/* عقرب الساعة المتحرك */}
        <div
          className="absolute left-1/2 top-1/2 w-1 origin-bottom transition-transform duration-300 ease-out"
          style={{
            height: '35%',
            background: accent,
            transform: `translate(-50%, -100%) rotate(${getRotationAngle()}deg)`
          }}
        >
          <div className="absolute -left-1.5 -top-2 h-4 w-4 rounded-full" style={{ background: accent }}></div>
        </div>

        {/* نقطة المنتصف */}
        <div className="z-10 h-3 w-3 rounded-full" style={{ background: 'var(--ink)' }}></div>

        {/* عرض أرقام الساعات (1 إلى 12) */}
        {mode === 'hours' && [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((num) => {
          const angle = (num * 30 - 90) * (Math.PI / 180);
          const radius = 85;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;
          return (
            <span
              key={num}
              className="absolute flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold"
              style={{
                transform: `translate(${x}px, ${y}px)`,
                background: hours === num ? accent : 'transparent',
                color: hours === num ? onAccent : 'var(--ink)',
              }}
            >
              {num}
            </span>
          );
        })}

        {/* عرض أرقام الدقائق بزيادة 5 (0, 5, 10, 15, ... 55) موزعة على الـ 12 موضع */}
        {mode === 'minutes' && [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((min, index) => {
          const num = index === 0 ? 12 : index; // لتوزيع الزوايا بشكل صحيح على مواقع الساعة
          const angle = (num * 30 - 90) * (Math.PI / 180);
          const radius = 85;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;
          return (
            <span
              key={min}
              className="absolute flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold"
              style={{
                transform: `translate(${x}px, ${y}px)`,
                background: minutes === min ? accent : 'transparent',
                color: minutes === min ? onAccent : 'var(--muted)',
              }}
            >
              {min}
            </span>
          );
        })}
      </div>
    </div>
  );
}