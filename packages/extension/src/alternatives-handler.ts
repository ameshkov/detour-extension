import { requestAlternatives } from './alternatives';
import { hasCapability } from './capabilities';
import type { AlternativesResponse, GetAlternativesMessage } from './messages';
import type { ServiceWorkerDeps } from './service-worker';

/** The sender's own tab, and never a tab id that the message claims. */
type TabSender = { tab?: { id?: number } };

/**
 * The alternatives of the stopped page, fetched by the worker for its caller
 * only. A caller without the recorded tab and URL gets no request at all.
 */
export async function handleGetAlternatives(
  message: GetAlternativesMessage,
  sender: TabSender,
  deps: ServiceWorkerDeps,
): Promise<AlternativesResponse> {
  if (!(await hasCapability(sender.tab?.id, message.url))) {
    return { ok: false, error: 'bad_message' };
  }

  return {
    ok: true,
    answer: await requestAlternatives({
      apiBase: deps.apiBase,
      url: message.url,
      title: message.title,
      fetchImpl: deps.fetchImpl,
    }),
  };
}
