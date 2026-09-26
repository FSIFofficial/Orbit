// 個人の実績(共通スキルのポイント・スキルレベル・資格)を団体をまたいで
// 持ち出し/持ち込みするための仕組み。ライブでの団体間データ連携は今の
// 「団体ごとに独立したスプレッドシート」という構成では作れないため、
// 代わりに「エクスポートしたファイルを新しい団体側でインポートする」
// という一回限りの受け渡し方式にしている。
//
// 対象は DEFAULT_SKILL_OPTIONS (FSIF配布の共通スキル) に限る。団体独自に
// 追加したスキルのポイントは、その団体だけのものとして持ち出し対象外。
import type { Member, Qualification, SkillLevel, SkillPoints } from './types'
import { DEFAULT_SKILL_OPTIONS } from './store'

export const PORTABLE_RECORD_VERSION = 1

export interface PortableRecord {
  version: number
  exportedAt: string
  memberName: string
  skillPoints: SkillPoints
  skillLevels: SkillLevel[]
  qualifications: Qualification[]
}

function isCommonSkill(skill: string): boolean {
  return (DEFAULT_SKILL_OPTIONS as readonly string[]).includes(skill)
}

export function buildPortableRecord(member: Member): PortableRecord {
  const skillPoints = Object.fromEntries(
    Object.entries(member.skillPoints ?? {}).filter(([skill]) => isCommonSkill(skill)),
  )
  const skillLevels = (member.skillLevels ?? []).filter((sl) => isCommonSkill(sl.skill))
  return {
    version: PORTABLE_RECORD_VERSION,
    exportedAt: new Date().toISOString(),
    memberName: member.displayName || member.name,
    skillPoints,
    skillLevels,
    qualifications: member.qualifications ?? [],
  }
}

export function downloadPortableRecord(member: Member) {
  const record = buildPortableRecord(member)
  const blob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Orbit_実績_${member.displayName || member.name}.json`
  a.click()
  URL.revokeObjectURL(url)
}

// アップロードされたファイルを読み込み、最低限の形式チェックをした上で
// 共通スキルのポイント/レベルだけに絞り込んで返す。壊れたファイルや
// 別形式のファイルはエラーを投げる
export function parsePortableRecordFile(file: File): Promise<PortableRecord> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'))
    reader.onload = () => {
      try {
        const raw = JSON.parse(String(reader.result))
        if (!raw || typeof raw !== 'object' || typeof raw.skillPoints !== 'object') {
          throw new Error('不正な形式のファイルです')
        }
        const skillPoints: SkillPoints = {}
        Object.entries(raw.skillPoints as Record<string, unknown>).forEach(([skill, pts]) => {
          if (isCommonSkill(skill) && typeof pts === 'number' && pts > 0) {
            skillPoints[skill] = pts
          }
        })
        const skillLevels: SkillLevel[] = Array.isArray(raw.skillLevels)
          ? raw.skillLevels.filter(
              (sl: unknown): sl is SkillLevel =>
                !!sl &&
                typeof sl === 'object' &&
                typeof (sl as SkillLevel).skill === 'string' &&
                isCommonSkill((sl as SkillLevel).skill),
            )
          : []
        const qualifications: Qualification[] = Array.isArray(raw.qualifications)
          ? raw.qualifications.filter(
              (q: unknown): q is Qualification =>
                !!q && typeof q === 'object' && typeof (q as Qualification).name === 'string',
            )
          : []
        resolve({
          version: typeof raw.version === 'number' ? raw.version : PORTABLE_RECORD_VERSION,
          exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
          memberName: typeof raw.memberName === 'string' ? raw.memberName : '',
          skillPoints,
          skillLevels,
          qualifications,
        })
      } catch (err) {
        reject(err instanceof Error ? err : new Error('不正な形式のファイルです'))
      }
    }
    reader.readAsText(file)
  })
}
