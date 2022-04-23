import { Hookable } from 'hookable';

interface FamilyStyles {
    [style: string]: boolean | number | number[];
}
interface Families {
    [family: string]: boolean | number | number[] | FamilyStyles;
}
interface FontInputOutput {
    inputFont: string;
    outputFont: string;
    inputText: string;
    outputText: string;
}
interface DownloadOptions {
    base64?: boolean;
    overwriting?: boolean;
    outputDir: string;
    stylePath: string;
    fontsDir: string;
    fontsPath: string;
    headers?: HeadersInit;
}
interface GoogleFonts {
    families?: Families;
    display?: string;
    subsets?: string[] | string;
    text?: string;
}
interface DownloaderHooks {
    'download-css:before': (url: string) => void;
    'download-css:done': (url: string, content: string, fonts: FontInputOutput[]) => void;
    'download-font:before': (font: FontInputOutput) => void;
    'download-font:done': (font: FontInputOutput) => void;
    'write-css:before': (path: string, content: string, fonts: FontInputOutput[]) => void;
    'write-css:done': (path: string, newContent: string, oldContent: string) => void;
}

declare function constructURL({ families, display, subsets, text }?: GoogleFonts): string | false;
declare function merge(...fonts: GoogleFonts[]): GoogleFonts;
declare function isValidURL(url: string): boolean;
declare function parse(url: string): GoogleFonts;
declare function download(url: string, options?: Partial<DownloadOptions>): Downloader;
declare class Downloader extends Hookable<DownloaderHooks> {
    private url;
    private config;
    constructor(url: string, options?: Partial<DownloadOptions>);
    execute(): Promise<void>;
    private downloadFonts;
    private writeCss;
}

export { DownloadOptions, Downloader, DownloaderHooks, Families, FamilyStyles, FontInputOutput, GoogleFonts, constructURL, download, isValidURL, merge, parse };
