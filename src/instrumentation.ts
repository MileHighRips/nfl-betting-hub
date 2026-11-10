export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.DISABLE_CLOSING_LINE_SCHEDULER === '1')
    return;
  const { startClosingLineScheduler } = await import('./lib/closing-line-scheduler');
  startClosingLineScheduler();
}
