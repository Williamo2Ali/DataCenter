// محرر الباسبورت المضمن — تغليف `PhysicalForm` في ملف منفصل (تناظراً مع `ContactEditor`).
// بلا منطق حفظ داخلي: الحالة والأزرار والحفظ تعيش في `PhysicalForm`، والصفحة تملك `submitProfile`.
import PhysicalForm from '../../components/ValueEditorForm'
import type { PhysicalFieldDef } from '../../lib/physicalTables'

type PassportEditorProps = {
  defs: PhysicalFieldDef[]
  initial: Record<string, unknown>
  busy: boolean
  onSubmit: (values: Record<string, string | number | null>) => void
  onCancel: () => void
}

export default function PassportEditor({ defs, initial, busy, onSubmit, onCancel }: PassportEditorProps) {
  return (
    <PhysicalForm
      defs={defs}
      initial={initial}
      busy={busy}
      onSubmit={onSubmit}
      onCancel={onCancel}
    />
  )
}
