// The Desktop app's User-Agent, by which the Sessions list names it "Nimbus for Mac/Windows/Linux" (#183).

/** Electron's User-Agent with a `Nimbus/<version>` product token at the end, added once. */
export function nimbusUserAgent(electronUserAgent, version) {
  const token = `Nimbus/${version}`;
  return electronUserAgent.split(" ").includes(token)
    ? electronUserAgent
    : `${electronUserAgent} ${token}`;
}
