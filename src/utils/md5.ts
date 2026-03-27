import SparkMD5 from 'spark-md5'

export function computeMd5(buffer: ArrayBuffer): string {
  return SparkMD5.ArrayBuffer.hash(buffer).toLowerCase()
}

export function compareMd5(expected: string | undefined, actual: string): boolean {
  if (!expected) {
    return true
  }
  return expected.toLowerCase() === actual.toLowerCase()
}
