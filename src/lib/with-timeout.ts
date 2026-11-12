export async function withTimeout<T>(operation: PromiseLike<T>, milliseconds = 10000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Operation timed out')), milliseconds)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
