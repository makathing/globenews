/// <reference types="vite/client" />

/**
 * Build stamp injected by vite.config.ts. Used to bust caches on the one
 * asset Vite does not content-hash: the dataset.
 */
declare const __BUILD_ID__: string;
