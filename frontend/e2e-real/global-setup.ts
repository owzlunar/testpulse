// The real-backend suite reads invite mails from Mailpit: start with an empty inbox
export default async function globalSetup() {
  const res = await fetch('http://localhost:8025/api/v1/messages', { method: 'DELETE' }).catch(() => null)
  if (!res?.ok) throw new Error('Mailpit is not running (http://localhost:8025): docker start mailpit')
}
