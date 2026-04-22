export async function copyToClipboard(text) {
  try {
    await navigator.clipboard?.writeText(String(text));
  } catch { /* ignore permission/security errors */ }
}
