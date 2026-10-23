import type { BackupModule, BackupModuleData, RestoreResult } from '../core/learning-backup'

export type LearningBackupModuleState<K extends BackupModule> = {
  data: BackupModuleData[K] | null
  blocked: boolean
  unsaved: boolean
  notice: string
}

/** Module getters read the owning controllers' latest in-memory state. */
export type LearningBackupController = {
  modules: { [K in BackupModule]: LearningBackupModuleState<K> }
  restore: (module: BackupModule, value: unknown) => RestoreResult
}
