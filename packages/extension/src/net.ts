/** The one shape of a page request, so a test supplies a stub instead of the network. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
