// "Show in folder": asks the server to open the system's file manager on a file or folder of the project.
const platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || ''
export const revealLabel = /mac/i.test(platform) ? 'Show in Finder' : /win/i.test(platform) ? 'Show in Explorer' : 'Show in folder'
export async function revealInFolder(path) {
  const res = await fetch('/api/reveal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }) }).catch(() => null)
  return !!(res && res.ok)
}
