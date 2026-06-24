/**
 * Browser extensions (MetaMask, accessibility inspectors, etc.) inject content scripts
 * that log MaxListenersExceededWarning / ObjectMultiplex noise on every page load.
 * Filter those in development so the app console stays readable.
 */
const EXTENSION_NOISE = [
    /MaxListenersExceededWarning/,
    /ObjectMultiplex/,
    /^InspectPage:/,
];

function isExtensionNoise(args) {
    const text = args
        .map((arg) => {
            if (typeof arg === 'string') return arg;
            if (arg instanceof Error) return `${arg.message} ${arg.stack || ''}`;
            return '';
        })
        .join(' ');
    return EXTENSION_NOISE.some((pattern) => pattern.test(text));
}

export function suppressExtensionConsoleNoise() {
    if (process.env.NODE_ENV !== 'development') return;

    ['log', 'warn'].forEach((level) => {
        const original = console[level].bind(console);
        console[level] = (...args) => {
            if (isExtensionNoise(args)) return;
            original(...args);
        };
    });
}
