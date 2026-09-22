export default function localFont(options?: { variable?: string }) {
  const variable = options?.variable || '--font-geist';
  const className = variable.replace(/^--/, '');
  return {
    className,
    variable,
    style: {
      fontFamily: `var(${variable})`,
    },
  };
}
