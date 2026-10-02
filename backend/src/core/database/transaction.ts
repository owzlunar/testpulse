import mongoose, { type ClientSession } from 'mongoose'

/** runs `fn` in a MongoDB transaction (retried on transient errors); pass the session to every write */
export async function transaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession()
  try {
    return await session.withTransaction(() => fn(session))
  } finally {
    await session.endSession()
  }
}
