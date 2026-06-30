declare module "qrcode-terminal" {
  export function generate(input: string, options?: { small?: boolean }): void;

  const qrcodeTerminal: {
    generate: typeof generate;
  };

  export default qrcodeTerminal;
}
