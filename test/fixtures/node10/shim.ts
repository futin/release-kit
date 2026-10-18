// guide-manager's shim (server/src/releases/release-kit.d.ts), verbatim: its deep import must keep resolving until the apps delete it.
declare module 'release-kit' {
  export * from 'release-kit/dist/esm/index';
}
