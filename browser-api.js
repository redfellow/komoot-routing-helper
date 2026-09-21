// Firefox's browser namespace and modern Chrome's chrome namespace support
// promises for the storage, messaging and action APIs used by this extension.
globalThis.KrbBrowser = globalThis.browser ?? globalThis.chrome;
