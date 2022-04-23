'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

const path = require('path');
const deepmerge = require('deepmerge');
const ufo = require('ufo');
const fsExtra = require('fs-extra');
const ohmyfetch = require('ohmyfetch');
const hookable = require('hookable');

function isValidDisplay(display) {
  return ["auto", "block", "swap", "fallback", "optional"].includes(display);
}
function convertFamiliesObject(families, v2 = true) {
  const result = {};
  families.flatMap((family) => family.split("|")).forEach((family) => {
    if (!family) {
      return;
    }
    if (!family.includes(":")) {
      result[family] = true;
      return;
    }
    const parts = family.split(":");
    if (!parts[1]) {
      return;
    }
    const values = {};
    if (!v2) {
      parts[1].split(",").forEach((style) => {
        if (["i", "italic", "ital"].includes(style)) {
          values.ital = true;
        }
        if (["bold", "b"].includes(style)) {
          values.wght = 700;
        }
        if (["bolditalic", "bi"].includes(style)) {
          values.ital = 700;
        }
        if (["wght"].includes(style)) {
          values.wght = true;
        }
      });
    }
    if (v2) {
      let [styles, weights] = parts[1].split("@");
      if (!weights) {
        weights = String(styles).replace(",", ";");
        styles = "wght";
      }
      styles.split(",").forEach((style) => {
        values[style] = weights.split(";").map((weight) => {
          if (/^\+?\d+$/.test(weight)) {
            return parseInt(weight);
          }
          const [pos, w] = weight.split(",");
          const index = style === "wght" ? 0 : 1;
          if (parseInt(pos) === index && /^\+?\d+$/.test(w)) {
            return parseInt(w);
          }
          return 0;
        }).filter((v) => v > 0);
        values[style] = Object.entries(values[style]).length > 0 ? values[style] : true;
      });
    }
    result[parts[0]] = values;
  });
  return result;
}
function convertFamiliesToArray(families, v2 = true) {
  const result = [];
  if (!v2) {
    Object.entries(families).forEach(([name, values]) => {
      if (!name) {
        return;
      }
      if (Array.isArray(values) && values.length > 0 || (values === true || values === 400)) {
        result.push(name);
        return;
      }
      if (values === 700) {
        result.push(`${name}:bold`);
        return;
      }
      if (Object.keys(values).length > 0) {
        const styles = [];
        Object.entries(values).sort(([styleA], [styleB]) => styleA.localeCompare(styleB)).forEach(([style, weight]) => {
          if (style === "ital" && (weight === 700 || Array.isArray(weight) && weight.includes(700))) {
            styles.push("bolditalic");
            if (Array.isArray(weight) && weight.includes(400)) {
              styles.push(style);
            }
          } else if (style === "wght" && (weight === 700 || Array.isArray(weight) && weight.includes(700))) {
            styles.push("bold");
            if (Array.isArray(weight) && weight.includes(400)) {
              styles.push(style);
            }
          } else if (weight !== false) {
            styles.push(style);
          }
        });
        const stylesSortered = styles.sort(([styleA], [styleB]) => styleA.localeCompare(styleB)).reverse().join(",");
        if (stylesSortered === "wght") {
          result.push(name);
          return;
        }
        result.push(`${name}:${stylesSortered}`);
      }
    });
    return result.length ? [result.join("|")] : result;
  }
  if (v2) {
    Object.entries(families).forEach(([name, values]) => {
      if (!name) {
        return;
      }
      if (Array.isArray(values) && values.length > 0) {
        result.push(`${name}:wght@${values.join(";")}`);
        return;
      }
      if (Object.keys(values).length > 0) {
        const styles = [];
        const weights = [];
        Object.entries(values).sort(([styleA], [styleB]) => styleA.localeCompare(styleB)).forEach(([style, weight]) => {
          styles.push(style);
          (Array.isArray(weight) ? weight : [weight]).forEach((value) => {
            if (Object.keys(values).length === 1 && style === "wght") {
              weights.push(String(value));
            } else {
              const index = style === "wght" ? 0 : 1;
              weights.push(`${index},${value}`);
            }
          });
        });
        if (!styles.includes("wght")) {
          styles.push("wght");
        }
        const weightsSortered = weights.sort(([weightA], [weightB]) => weightA.localeCompare(weightB)).join(";");
        result.push(`${name}:${styles.join(",")}@${weightsSortered}`);
        return;
      }
      if (values) {
        result.push(name);
      }
    });
  }
  return result;
}
function parseFontsFromCss(content, fontsPath) {
  const fonts = [];
  const re = {
    face: /\s*(?:\/\*\s*(.*?)\s*\*\/)?[^@]*?@font-face\s*{(?:[^}]*?)}\s*/gi,
    family: /font-family\s*:\s*(?:'|")?([^;]*?)(?:'|")?\s*;/i,
    weight: /font-weight\s*:\s*([^;]*?)\s*;/i,
    url: /url\s*\(\s*(?:'|")?\s*([^]*?)\s*(?:'|")?\s*\)\s*?/gi
  };
  let i = 1;
  let match1;
  while ((match1 = re.face.exec(content)) !== null) {
    const [fontface, comment] = match1;
    const familyRegExpArray = re.family.exec(fontface);
    const family = familyRegExpArray ? familyRegExpArray[1] : "";
    const weightRegExpArray = re.weight.exec(fontface);
    const weight = weightRegExpArray ? weightRegExpArray[1] : "";
    let match2;
    while ((match2 = re.url.exec(fontface)) !== null) {
      const [forReplace, url] = match2;
      const urlPathname = new URL(url).pathname;
      const ext = path.extname(urlPathname);
      if (ext.length < 2) {
        continue;
      }
      const filename = path.basename(urlPathname, ext) || "";
      const newFilename = formatFontFileName("{_family}-{weight}-{i}.{ext}", {
        comment: comment || "",
        family,
        weight: weight || "",
        filename,
        _family: family.replace(/\s+/g, "_"),
        ext: ext.replace(/^\./, "") || "",
        i: String(i++)
      }).replace(/\.$/, "");
      fonts.push({
        family,
        weight,
        inputFont: url,
        outputFont: newFilename,
        inputText: forReplace,
        outputText: `url('${path.posix.join(fontsPath, newFilename)}')`
      });
    }
  }
  return fonts;
}
function formatFontFileName(template, values) {
  return Object.entries(values).filter(([key]) => /^[a-z0-9_-]+$/gi.test(key)).map(([key, value]) => [new RegExp(`([^{]|^){${key}}([^}]|$)`, "g"), `$1${value}$2`]).reduce((str, [regexp, replacement]) => str.replace(regexp, String(replacement)), template).replace(/({|}){2}/g, "$1");
}

const GOOGLE_FONTS_DOMAIN = "fonts.googleapis.com";
function constructURL({ families, display, subsets, text } = {}) {
  const subset = (Array.isArray(subsets) ? subsets : [subsets]).filter(Boolean);
  const prefix = subset.length > 0 ? "css" : "css2";
  const family = convertFamiliesToArray(families ?? {}, prefix.endsWith("2"));
  if (family.length < 1) {
    return false;
  }
  const query = {
    family
  };
  if (display && isValidDisplay(display)) {
    query.display = display;
  }
  if (subset.length > 0) {
    query.subset = subset.join(",");
  }
  if (text) {
    query.text = text;
  }
  return ufo.withHttps(ufo.withQuery(ufo.resolveURL(GOOGLE_FONTS_DOMAIN, prefix), query));
}
function merge(...fonts) {
  return deepmerge.all(fonts);
}
function isValidURL(url) {
  return RegExp(GOOGLE_FONTS_DOMAIN).test(url);
}
function parse(url) {
  const result = {};
  if (!isValidURL(url)) {
    return result;
  }
  const { searchParams, pathname } = ufo.createURL(url);
  if (!searchParams.has("family")) {
    return result;
  }
  const families = convertFamiliesObject(searchParams.getAll("family"), pathname.endsWith("2"));
  if (Object.keys(families).length < 1) {
    return result;
  }
  result.families = families;
  const display = searchParams.get("display");
  if (display && isValidDisplay(display)) {
    result.display = display;
  }
  const subsets = searchParams.get("subset");
  if (subsets) {
    result.subsets = subsets.split(",");
  }
  const text = searchParams.get("text");
  if (text) {
    result.text = text;
  }
  return result;
}
function download(url, options) {
  return new Downloader(url, options);
}
class Downloader extends hookable.Hookable {
  constructor(url, options) {
    super();
    this.url = url;
    this.config = {
      base64: false,
      overwriting: false,
      outputDir: "./",
      stylePath: "fonts.css",
      fontsDir: "fonts",
      fontsPath: "./fonts",
      headers: options?.ttf ? {} : [["user-agent", [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "AppleWebKit/537.36 (KHTML, like Gecko)",
        "Chrome/98.0.4758.102 Safari/537.36"
      ].join(" ")]],
      ...options
    };
  }
  async execute() {
    if (!isValidURL(this.url)) {
      throw new Error("Invalid Google Fonts URL");
    }
    const { outputDir, stylePath, overwriting, headers, fontsPath } = this.config;
    const cssPath = path.resolve(outputDir, stylePath);
    if (!overwriting && fsExtra.pathExistsSync(cssPath)) {
      return;
    }
    await this.callHook("download-css:before", this.url);
    const cssContent = await ohmyfetch.$fetch(this.url, { headers });
    const fontsFromCss = parseFontsFromCss(cssContent, fontsPath);
    await this.callHook("download-css:done", this.url, cssContent, fontsFromCss);
    const fonts = (await Promise.all(this.downloadFonts(fontsFromCss))).filter((font) => font.inputText);
    await this.callHook("write-css:before", cssPath, cssContent, fonts);
    const newContent = await this.writeCss(cssPath, cssContent, fonts);
    await this.callHook("write-css:done", cssPath, newContent, cssContent);
  }
  downloadFonts(fonts) {
    const { headers, base64, outputDir, fontsDir } = this.config;
    return fonts.map(async (font) => {
      await this.callHook("download-font:before", font);
      const response = await ohmyfetch.$fetch.raw(font.inputFont, { headers, responseType: "arrayBuffer" });
      if (!response?._data) {
        return {};
      }
      const buffer = Buffer.from(response?._data);
      if (base64) {
        const mime = response.headers.get("content-type") ?? "font/woff2";
        font.outputText = `url('data:${mime};base64,${buffer.toString("base64")}')`;
      } else {
        const fontPath = path.resolve(outputDir, fontsDir, font.outputFont);
        await fsExtra.outputFile(fontPath, buffer);
      }
      await this.callHook("download-font:done", font);
      return font;
    });
  }
  async writeCss(path, content, fonts) {
    for (const font of fonts) {
      content = content.replace(font.inputText, font.outputText);
    }
    await fsExtra.outputFile(path, content);
    return content;
  }
}

exports.Downloader = Downloader;
exports.constructURL = constructURL;
exports.download = download;
exports.isValidURL = isValidURL;
exports.merge = merge;
exports.parse = parse;
