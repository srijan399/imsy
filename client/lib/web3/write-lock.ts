import "server-only"

let walletWriteQueue: Promise<void> = Promise.resolve()

export async function withWalletWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const previous = walletWriteQueue
  let release: (() => void) | undefined
  walletWriteQueue = new Promise<void>((resolve) => {
    release = resolve
  })

  await previous
  try {
    return await fn()
  } finally {
    release?.()
  }
}
