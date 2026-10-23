/** Shared input boundary: never read an untrusted property through normal access. */
export function rejectLearningData(message = '学习记录字段或状态不合法'): never { throw new Error(message) }

export function dataObject(value: unknown, fields?: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) rejectLearningData()
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) rejectLearningData()
  const keys = Reflect.ownKeys(value)
  if (keys.some(key => typeof key !== 'string') || (fields && (keys.length !== fields.length || keys.some(key => !fields.includes(key as string))))) rejectLearningData()
  const output: Record<string, unknown> = {}
  for (const key of keys as string[]) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) rejectLearningData()
    Object.defineProperty(output, key, { value: descriptor.value, enumerable: true, writable: true, configurable: true })
  }
  return output
}

export function dataInteger(value: unknown, maximum = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > maximum) rejectLearningData()
  return value
}

export function dataBoolean(value: unknown): boolean {
  if (typeof value !== 'boolean') rejectLearningData()
  return value
}

export function dataArray<T>(value: unknown, maximum: number, parse: (item: unknown, index: number) => T): T[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) rejectLearningData()
  const count = dataInteger(Object.getOwnPropertyDescriptor(value, 'length')?.value, maximum)
  const keys = Reflect.ownKeys(value)
  if (keys.length !== count + 1 || keys.some(key => key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= count))) rejectLearningData()
  const output: T[] = []
  for (let index = 0; index < count; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) rejectLearningData()
    output.push(parse(descriptor.value, index))
  }
  return output
}

/** Bounded deep snapshot for formats whose legacy validator has recovery behavior.
 * Every branch is copied before serialization; accessors/toJSON/custom prototypes
 * are rejected even when nested in an otherwise invalid field. */
export function snapshotLearningData(value: unknown): unknown {
  const ancestors = new Set<object>()
  let nodes = 0
  function snapshot(input: unknown, depth: number): unknown {
    if (++nodes > 20000 || depth > 24) rejectLearningData()
    if (input === null || typeof input === 'boolean' || typeof input === 'string') return input
    if (typeof input === 'number' && Number.isFinite(input)) return input
    if (!input || typeof input !== 'object' || ancestors.has(input)) rejectLearningData()
    ancestors.add(input)
    let result: unknown
    if (Array.isArray(input)) result = dataArray(input, 20000, item => snapshot(item, depth + 1))
    else {
      const fields = dataObject(input)
      if (Object.hasOwn(fields, 'toJSON')) rejectLearningData()
      for (const key of Object.keys(fields)) fields[key] = snapshot(fields[key], depth + 1)
      result = fields
    }
    ancestors.delete(input)
    return result
  }
  return snapshot(value, 0)
}

export function checkLearningBytes(raw: string, maximum: number): void {
  if (typeof raw !== 'string' || raw.length > maximum || new TextEncoder().encode(raw).length > maximum) rejectLearningData('学习备份大小超过字节上限')
}
