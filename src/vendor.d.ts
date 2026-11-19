// @verdaccio/types ships its types as .ts sources that import three types
// from jsonwebtoken, which it does not depend on. The plugin never touches
// the JWT options, so they stay `any`, as they were before strict mode.
declare module 'jsonwebtoken' {
  export type Algorithm = any;
  export type SignOptions = any;
  export type VerifyOptions = any;
}
