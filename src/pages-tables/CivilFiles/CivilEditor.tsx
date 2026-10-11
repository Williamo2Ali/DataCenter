// محرر السجل المدني المضمن — تغليف `PhysicalForm` في ملف منفصل (تناظراً مع `PassportEditor`).
// بلا منطق حفظ داخلي: الحالة والأزرار والحفظ تعيش في `PhysicalForm`، والصفحة تملك `submitProfile`.
import PhysicalForm from '../../components/ValueEditorForm'
import type { PhysicalFieldDef } from '../../lib/physicalTables'

type CivilEditorProps = {
  defs: PhysicalFieldDef[]
  initial: Record<string, unknown>
  busy: boolean
  onSubmit: (values: Record<string, string | number | null>) => void
  onCancel: () => void
}

export default function CivilEditor({ defs, initial, busy, onSubmit, onCancel }: CivilEditorProps) {
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
